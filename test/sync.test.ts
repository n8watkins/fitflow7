import { describe, it, expect, afterEach, vi } from 'vitest'
import type { Routine } from '../src/types'

// Finding M5: the client sync engine (src/lib/sync.ts) had zero coverage despite
// being the most logic-dense client module. Its non-obvious orchestration — push
// then pull, 401 sign-out, 403 pull-only fallback, dirty-clear ordering, and
// concurrent coalescing — is exercised here. Each test loads a FRESH module graph
// (vi.resetModules) so sync.ts's module-level inFlight/pushForbidden don't leak,
// and shares the in-memory localStorage from test/setup.ts (cleared per test).

interface FakeResponse {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

function okBody(over: Record<string, unknown> = {}) {
  return {
    serverTime: '2026-06-27T00:00:00.000Z',
    routines: [], sessions: [], settings: null, weightLog: [], challengeProgress: [], bodyProfile: null,
    ...over,
  }
}

function makeRoutine(over: Partial<Routine> = {}): Routine {
  return {
    id: 'a', name: 'A', exerciseIds: ['x'], workSeconds: 30, restSeconds: 10, rounds: 1,
    isSystem: false, createdAt: 't', updatedAt: 't', ...over,
  }
}

/** Fresh sync + store + storage modules, with a user signed in. */
async function loadSync() {
  vi.resetModules()
  const storage = await import('../src/lib/storage')
  const { useSyncStore } = await import('../src/store/syncStore')
  const sync = await import('../src/lib/sync')
  useSyncStore.getState().setUser({ id: 'u', email: null, name: null, avatarUrl: null })
  return { storage, useSyncStore, sync }
}

function stubFetch(impl: (url: string, init?: { body?: string }) => FakeResponse | Promise<FakeResponse>) {
  const fn = vi.fn(impl)
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('client sync engine (M5)', () => {
  it('is a no-op when signed out (no fetch)', async () => {
    vi.resetModules()
    const { useSyncStore } = await import('../src/store/syncStore')
    const sync = await import('../src/lib/sync')
    useSyncStore.getState().setUser(null)
    const fetchFn = stubFetch(() => ({ ok: true, status: 200, json: async () => okBody() }))
    await sync.sync()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('pushes the dirty queue + cursor, then merges the pull and clears dirty', async () => {
    const { storage, sync } = await loadSync()
    storage.setSyncCursor('2026-06-01T00:00:00.000Z')
    storage.saveRoutine(makeRoutine({ id: 'a' }))
    let sent: { since?: unknown; routines?: { id: string }[] } = {}
    stubFetch((_url, init) => {
      sent = JSON.parse(init?.body ?? '{}')
      return {
        ok: true, status: 200,
        json: async () => okBody({ routines: [makeRoutine({ id: 'b', updatedAt: '2999-01-01T00:00:00.000Z' })] }),
      }
    })
    await sync.sync()

    expect(sent.routines?.some((r) => r.id === 'a')).toBe(true) // pushed the dirty routine
    expect(sent.since).toBe('2026-06-01T00:00:00.000Z') // and the pull cursor
    expect(storage.getPendingSync().routines.some((r) => r.id === 'a')).toBe(false) // marked clean
    expect(storage.getRoutines().some((r) => r.id === 'b')).toBe(true) // remote merged in
  })

  it('drops to signed-out on 401', async () => {
    const { useSyncStore, sync } = await loadSync()
    stubFetch(() => ({ ok: false, status: 401, json: async () => ({}) }))
    await sync.sync()
    expect(useSyncStore.getState().user).toBeNull()
  })

  it('on 403 falls back to pull-only and does NOT clear dirty', async () => {
    const { storage, sync } = await loadSync()
    storage.saveRoutine(makeRoutine({ id: 'a' }))
    const bodies: Record<string, unknown>[] = []
    let n = 0
    stubFetch((_url, init) => {
      bodies.push(JSON.parse(init?.body ?? '{}'))
      n++
      if (n === 1) return { ok: false, status: 403, json: async () => ({}) }
      return { ok: true, status: 200, json: async () => okBody() }
    })
    await sync.sync()

    expect(bodies).toHaveLength(2) // the forbidden push, then a pull-only rerun
    expect('routines' in bodies[0]).toBe(true) // first attempt carried the push
    expect('routines' in bodies[1]).toBe(false) // rerun omits the dirty payload
    expect(storage.getPendingSync().routines.some((r) => r.id === 'a')).toBe(true) // still dirty
  })

  it('coalesces concurrent calls into one in-flight + one rerun', async () => {
    const { sync } = await loadSync()
    let calls = 0
    const release: Array<() => void> = []
    stubFetch(
      () =>
        new Promise<FakeResponse>((res) => {
          calls++
          release.push(() => res({ ok: true, status: 200, json: async () => okBody() }))
        }),
    )
    const p1 = sync.sync()
    const p2 = sync.sync() // inFlight -> coalesced
    const p3 = sync.sync() // inFlight -> coalesced
    expect(calls).toBe(1) // only the first actually fetched

    release[0]()
    await Promise.all([p1, p2, p3])
    expect(calls).toBe(2) // the single queued rerun fired — not three fetches
    release[1]?.() // resolve the rerun's pending fetch
  })
})
