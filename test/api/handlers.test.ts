import { describe, it, expect, beforeEach } from 'vitest'
import { ensureSchema, getDb } from '../../api/_lib/db.ts'
import { createAccessToken } from '../../api/_lib/auth.ts'
import syncHandler from '../../api/sync.ts'
import meHandler from '../../api/me.ts'
import tokenHandler from '../../api/token.ts'
import publishHandler from '../../api/routines/publish.ts'
import publicHandler from '../../api/routines/public.ts'
import reportHandler from '../../api/routines/report.ts'

// B2: /api request-harness tests. Handlers are Vercel-style (req, res) functions;
// we invoke them with hand-rolled stubs (no supertest / new deps). The Turso seam
// is a real in-memory libSQL DB (TURSO_DATABASE_URL=:memory:), so LWW / tombstone /
// scoping go through the actual SQL rather than a mock. Tables are cleared per test.

const EPOCH = '1970-01-01T00:00:00.000Z'

interface MockRes {
  statusCode: number
  body: unknown
  headers: Record<string, string | string[]>
  status(c: number): MockRes
  json(b: unknown): MockRes
  send(b: unknown): MockRes
  setHeader(k: string, v: string | string[]): MockRes
  getHeader(k: string): string | string[] | undefined
  end(): MockRes
}

function mockRes(): MockRes {
  const res = { statusCode: 200, body: undefined as unknown, headers: {} as Record<string, string | string[]> } as MockRes
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  res.send = (b) => { res.body = b; return res }
  res.setHeader = (k, v) => { res.headers[k] = v; return res }
  res.getHeader = (k) => res.headers[k]
  res.end = () => res
  return res
}

interface CallOpts {
  method?: string
  headers?: Record<string, string>
  body?: unknown
  query?: Record<string, string>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(handler: (req: any, res: any) => unknown, opts: CallOpts = {}): Promise<MockRes> {
  const req = { method: opts.method ?? 'GET', headers: opts.headers ?? {}, body: opts.body, query: opts.query ?? {} }
  const res = mockRes()
  await handler(req, res)
  return res
}

function bearer(userId: string): Record<string, string> {
  return { authorization: `Bearer ${createAccessToken(userId)}` }
}

function routine(over: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    name: 'A',
    exerciseIds: ['push-ups'],
    workSeconds: 30,
    restSeconds: 10,
    rounds: 1,
    isSystem: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

beforeEach(async () => {
  // A configured-but-test environment: a session secret + an in-memory DB.
  process.env.SESSION_SECRET = 'test-secret-xyz'
  process.env.TURSO_DATABASE_URL = ':memory:'
  await ensureSchema()
  const db = getDb()
  await db.batch(
    ['DELETE FROM routines', 'DELETE FROM sessions', 'DELETE FROM settings', 'DELETE FROM public_routines', 'DELETE FROM users'],
    'write',
  )
})

describe('auth gating', () => {
  it('me returns { user: null } when unauthenticated (no DB hit)', async () => {
    const res = await call(meHandler, { method: 'GET' })
    expect(res.statusCode).toBe(200)
    expect((res.body as { user: unknown }).user).toBeNull()
  })

  it('protected endpoints 401 without credentials', async () => {
    expect((await call(syncHandler, { method: 'POST', body: {} })).statusCode).toBe(401)
    expect((await call(tokenHandler, { method: 'POST' })).statusCode).toBe(401)
    expect((await call(publishHandler, { method: 'POST', body: {} })).statusCode).toBe(401)
    expect((await call(reportHandler, { method: 'POST', body: {} })).statusCode).toBe(401)
  })

  it('wrong method is rejected with 405', async () => {
    expect((await call(syncHandler, { method: 'GET' })).statusCode).toBe(405)
    expect((await call(tokenHandler, { method: 'GET' })).statusCode).toBe(405)
    expect((await call(publicHandler, { method: 'POST' })).statusCode).toBe(405)
  })

  it('fails closed when unconfigured: a valid-looking token is rejected with no SESSION_SECRET', async () => {
    const headers = bearer('userA') // minted while the secret is set
    delete process.env.SESSION_SECRET
    const res = await call(syncHandler, { method: 'POST', headers, body: {} })
    expect(res.statusCode).toBe(401)
  })
})

describe('sync — LWW + tombstones + user scoping', () => {
  async function push(userId: string, body: unknown) {
    return call(syncHandler, { method: 'POST', headers: bearer(userId), body })
  }
  async function pull(userId: string, since = EPOCH) {
    const res = await call(syncHandler, { method: 'POST', headers: bearer(userId), body: { since } })
    return (res.body as { routines: { id: string; name: string; deletedAt?: string }[] }).routines
  }

  it('a newer updated_at wins; an older push is ignored', async () => {
    await push('userA', { routines: [routine({ updatedAt: '2026-01-01T00:00:00.000Z' })] })
    await push('userA', { routines: [routine({ name: 'A2', updatedAt: '2026-02-01T00:00:00.000Z' })] })
    await push('userA', { routines: [routine({ name: 'STALE', updatedAt: '2025-01-01T00:00:00.000Z' })] })
    const r = (await pull('userA')).find((x) => x.id === 'r1')
    expect(r?.name).toBe('A2')
  })

  it('tombstones propagate (deleted_at returned in the pull)', async () => {
    await push('userA', { routines: [routine({ updatedAt: '2026-02-01T00:00:00.000Z' })] })
    await push('userA', { routines: [routine({ updatedAt: '2026-03-01T00:00:00.000Z', deletedAt: '2026-03-01T00:00:00.000Z' })] })
    const r = (await pull('userA')).find((x) => x.id === 'r1')
    expect(r?.deletedAt).toBe('2026-03-01T00:00:00.000Z')
  })

  it('a pull is scoped to the authenticated user', async () => {
    await push('userB', { routines: [routine({ id: 'rB', updatedAt: '2026-02-01T00:00:00.000Z' })] })
    const routinesForA = await pull('userA')
    expect(routinesForA.some((x) => x.id === 'rB')).toBe(false)
  })

  it('a user cannot overwrite another user’s row even with a newer timestamp', async () => {
    await push('userA', { routines: [routine({ name: 'A2', updatedAt: '2026-02-01T00:00:00.000Z' })] })
    await push('userB', { routines: [routine({ id: 'r1', name: 'HACK', updatedAt: '2027-01-01T00:00:00.000Z' })] })
    const r = (await pull('userA')).find((x) => x.id === 'r1')
    expect(r?.name).toBe('A2')
  })
})

describe('routines/public — no PII + blocked exclusion', () => {
  async function publish(userId: string, ownerName?: string) {
    const res = await call(publishHandler, {
      method: 'POST',
      headers: bearer(userId),
      body: { routine: { name: 'Coach Burner', exerciseIds: ['push-ups', 'squats'], workSeconds: 30, restSeconds: 10, rounds: 2 }, ownerName },
    })
    return res
  }

  it('publishes and serves only a safe, PII-free shape', async () => {
    const pub = await publish('userA', 'Coach')
    expect(pub.statusCode).toBe(200)
    const slug = (pub.body as { slug: string }).slug

    const list = await call(publicHandler, { method: 'GET' })
    const item = (list.body as { routines: Record<string, unknown>[] }).routines.find((x) => x.slug === slug)
    expect(item).toBeTruthy()
    expect(item?.ownerName).toBe('Coach')
    expect(item).not.toHaveProperty('ownerId')
    expect(item).not.toHaveProperty('owner_id')
    expect(item).not.toHaveProperty('email')
    // The owner's user id must never leak into the public payload.
    expect(JSON.stringify(item)).not.toContain('userA')
  })

  it('hides a routine once it hits the report/block threshold', async () => {
    const slug = ((await publish('userA')).body as { slug: string }).slug
    for (let i = 0; i < 3; i++) {
      await call(reportHandler, { method: 'POST', headers: bearer(`reporter${i}`), body: { slug } })
    }
    const list = await call(publicHandler, { method: 'GET' })
    expect((list.body as { routines: { slug: string }[] }).routines.some((x) => x.slug === slug)).toBe(false)
    const one = await call(publicHandler, { method: 'GET', query: { slug } })
    expect(one.statusCode).toBe(404)
  })
})
