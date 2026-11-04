import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { handle, remote } from './target.ts'
import {
  DB_URL, ORIGIN, SECRET, cookieValue, request, sessionCookie, setCookies, testDb, unregisteredPat,
  type ApiEnv, type Req,
} from './contract-helpers.ts'

// The HTTP contract of the FitFlow 7 API: every route, method, status code,
// content type, cookie and redirect the web app, the Android app and the MCP
// server rely on. It runs against a real libSQL database file.

const EPOCH = '1970-01-01T00:00:00.000Z'
const JSON_TYPE = 'application/json; charset=utf-8'

let env: ApiEnv

async function call(path: string, opts: Req = {}): Promise<Response> {
  return handle(request(path, opts), env)
}

async function json<T = Record<string, unknown>>(res: Response): Promise<T> {
  expect(res.headers.get('content-type')).toBe(JSON_TYPE)
  return (await res.json()) as T
}

/** Mints a registered access token through the API, as Settings does. */
async function mint(userId: string, scope: 'read' | 'readwrite' = 'readwrite') {
  const res = await call('/api/token', { method: 'POST', headers: { cookie: sessionCookie(userId) }, json: { scope } })
  expect(res.status).toBe(200)
  const body = await json<{ token: string; jti: string }>(res)
  return { headers: { authorization: `Bearer ${body.token}` }, jti: body.jti, token: body.token }
}
async function bearer(userId: string, scope: 'read' | 'readwrite' = 'readwrite') {
  return (await mint(userId, scope)).headers
}
const cookieFor = (userId: string) => ({ cookie: sessionCookie(userId) })

function routine(over: Record<string, unknown> = {}) {
  return {
    id: 'r1', name: 'A', exerciseIds: ['push-ups'], workSeconds: 30, restSeconds: 10, rounds: 1,
    isSystem: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...over,
  }
}

const TABLES = ['routines', 'sessions', 'settings', 'public_routines', 'users', 'access_tokens',
  'routine_reports', 'weight_log', 'body_profile', 'challenge_progress']

beforeEach(async () => {
  env = { SESSION_SECRET: SECRET, TURSO_DATABASE_URL: DB_URL }
  // Any request creates the schema; then start every test from empty tables.
  await call('/api/routines/public')
  await testDb().batch(TABLES.map((t) => `DELETE FROM ${t}`), 'write')
})

describe('routing', () => {
  it('unknown API paths are a plain-text 404', async () => {
    for (const path of ['/api/nope', '/api/_lib/auth', '/api/auth', '/api/routines']) {
      const res = await call(path)
      expect(res.status, path).toBe(404)
      expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    }
  })

  it('a trailing slash reaches the same route', async () => {
    const res = await call('/api/me/')
    expect(res.status).toBe(200)
    expect((await json(res)).user).toBeNull()
  })
})

describe('auth gating', () => {
  it.skipIf(remote)('me returns { user: null } and the configured providers when unauthenticated', async () => {
    env.GITHUB_CLIENT_ID = 'gid'
    env.GITHUB_CLIENT_SECRET = 'gsecret'
    env.GOOGLE_CLIENT_ID = 'only-an-id'
    const res = await call('/api/me')
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ user: null, providers: ['github'] })
  })

  it('protected endpoints 401 without credentials', async () => {
    const cases: [string, string][] = [
      ['POST', '/api/sync'], ['POST', '/api/token'], ['GET', '/api/token'], ['DELETE', '/api/token'],
      ['PUT', '/api/token'], ['POST', '/api/routines/publish'], ['POST', '/api/routines/report'],
    ]
    for (const [method, path] of cases) {
      const res = await call(path, { method, json: method === 'GET' ? undefined : {} })
      expect(res.status, `${method} ${path}`).toBe(401)
      expect(await json(res)).toEqual({ error: 'not signed in' })
    }
  })

  it('wrong method is rejected with 405', async () => {
    const cases: [string, string, Record<string, string>?][] = [
      ['GET', '/api/sync'], ['PUT', '/api/sync'], ['OPTIONS', '/api/sync'],
      ['POST', '/api/routines/public'], ['GET', '/api/routines/publish'], ['GET', '/api/routines/report'],
      ['PUT', '/api/token', cookieFor('u')], ['PATCH', '/api/token', cookieFor('u')],
    ]
    for (const [method, path, headers] of cases) {
      const res = await call(path, { method, headers })
      expect(res.status, `${method} ${path}`).toBe(405)
      expect(await json(res)).toEqual({ error: 'method not allowed' })
    }
  })

  it.skipIf(remote)('fails closed when unconfigured: a valid-looking token is rejected with no SESSION_SECRET', async () => {
    const headers = await bearer('userA')
    delete env.SESSION_SECRET
    expect((await call('/api/sync', { method: 'POST', headers, json: {} })).status).toBe(401)
  })
})

describe('logout', () => {
  it('clears the session cookie on POST', async () => {
    const res = await call('/api/auth/logout', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ ok: true })
    expect(setCookies(res)).toEqual(['ff_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'])
  })
})

describe('login', () => {
  it.skipIf(remote)('rejects an unknown provider with 400 and an unconfigured one with 501', async () => {
    const bad = await call('/api/auth/login?provider=bogus')
    expect(bad.status).toBe(400)
    expect(await json(bad)).toEqual({ error: 'unknown provider' })
    const none = await call('/api/auth/login')
    expect(none.status).toBe(400)
    const off = await call('/api/auth/login?provider=google')
    expect(off.status).toBe(501)
    expect(await json(off)).toEqual({ error: 'google OAuth is not configured' })
  })

  it.skipIf(remote)('redirects to the provider with a signed state cookie', async () => {
    env.GITHUB_CLIENT_ID = 'gid'
    env.GITHUB_CLIENT_SECRET = 'gsecret'
    env.APP_URL = 'https://app.example/'
    const res = await call('/api/auth/login?provider=github&returnTo=/stats')
    expect(res.status).toBe(302)
    const location = new URL(res.headers.get('location')!)
    expect(location.origin + location.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(location.searchParams.get('client_id')).toBe('gid')
    expect(location.searchParams.get('redirect_uri')).toBe('https://app.example/api/auth/callback')
    expect(location.searchParams.get('scope')).toBe('read:user user:email')
    expect(location.searchParams.get('response_type')).toBe('code')
    const state = location.searchParams.get('state')!
    expect(state).toMatch(/^[0-9a-f]{32}$/)
    const [cookie] = setCookies(res)
    expect(cookie).toMatch(/^ff_oauth=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/)
    const payload = JSON.parse(Buffer.from(decodeURIComponent(cookieValue(res, 'ff_oauth')!).split('.')[0], 'base64url').toString())
    expect(payload).toMatchObject({ state, provider: 'github', returnTo: '/stats' })
  })

  it.skipIf(remote)('uses Google’s endpoint and scope, and drops an unsafe returnTo', async () => {
    env.GOOGLE_CLIENT_ID = 'goid'
    env.GOOGLE_CLIENT_SECRET = 'gosecret'
    const res = await call('/api/auth/login?provider=google&returnTo=//evil.com')
    expect(res.status).toBe(302)
    const location = new URL(res.headers.get('location')!)
    expect(location.origin + location.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(location.searchParams.get('scope')).toBe('openid email profile')
    expect(location.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/callback`)
    const payload = JSON.parse(Buffer.from(decodeURIComponent(cookieValue(res, 'ff_oauth')!).split('.')[0], 'base64url').toString())
    expect(payload.returnTo).toBe('/')
  })
})

describe('sync - LWW + tombstones + user scoping', () => {
  async function push(userId: string, body: unknown) {
    return call('/api/sync', { method: 'POST', headers: await bearer(userId), json: body })
  }
  async function pull(userId: string, since = EPOCH) {
    const res = await call('/api/sync', { method: 'POST', headers: await bearer(userId), json: { since } })
    return (await json<{ routines: { id: string; name: string; deletedAt?: string }[] }>(res)).routines
  }

  it('returns every collection and a server cursor', async () => {
    const res = await call('/api/sync', { method: 'POST', headers: cookieFor('userA'), json: {} })
    expect(res.status).toBe(200)
    const body = await json(res)
    expect(Object.keys(body).sort()).toEqual(
      ['bodyProfile', 'challengeProgress', 'routines', 'serverTime', 'sessions', 'settings', 'weightLog'])
    expect(Date.parse(body.serverTime as string)).not.toBeNaN()
  })

  it('a newer updated_at wins; an older push is ignored', async () => {
    await push('userA', { routines: [routine({ updatedAt: '2026-01-01T00:00:00.000Z' })] })
    await push('userA', { routines: [routine({ name: 'A2', updatedAt: '2026-02-01T00:00:00.000Z' })] })
    await push('userA', { routines: [routine({ name: 'STALE', updatedAt: '2025-01-01T00:00:00.000Z' })] })
    expect((await pull('userA')).find((x) => x.id === 'r1')?.name).toBe('A2')
  })

  it('system routines are never stored', async () => {
    await push('userA', { routines: [routine({ id: 'sys', isSystem: true })] })
    expect((await pull('userA')).some((x) => x.id === 'sys')).toBe(false)
  })

  it('tombstones propagate (deleted_at returned in the pull)', async () => {
    await push('userA', { routines: [routine({ updatedAt: '2026-02-01T00:00:00.000Z' })] })
    await push('userA', { routines: [routine({ updatedAt: '2026-03-01T00:00:00.000Z', deletedAt: '2026-03-01T00:00:00.000Z' })] })
    expect((await pull('userA')).find((x) => x.id === 'r1')?.deletedAt).toBe('2026-03-01T00:00:00.000Z')
  })

  it('a pull is scoped to the authenticated user', async () => {
    await push('userB', { routines: [routine({ id: 'rB', updatedAt: '2026-02-01T00:00:00.000Z' })] })
    expect((await pull('userA')).some((x) => x.id === 'rB')).toBe(false)
  })

  it('a user cannot overwrite another user’s row even with a newer timestamp', async () => {
    await push('userA', { routines: [routine({ name: 'A2', updatedAt: '2026-02-01T00:00:00.000Z' })] })
    await push('userB', { routines: [routine({ id: 'r1', name: 'HACK', updatedAt: '2027-01-01T00:00:00.000Z' })] })
    expect((await pull('userA')).find((x) => x.id === 'r1')?.name).toBe('A2')
  })

  it('sessions and settings round-trip', async () => {
    const session = {
      id: 's1', routineId: 'r1', routineName: 'A', startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:07:00.000Z', durationSeconds: 420, completed: true,
      exercisesCompleted: 12, totalExercises: 12, updatedAt: '2026-01-01T00:07:00.000Z',
    }
    const settings = {
      value: { defaultWorkSeconds: 30, defaultRestSeconds: 10, defaultRounds: 1, countdownSeconds: 5, audioCuesEnabled: true, unitSystem: 'metric' },
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    await push('userA', { sessions: [session], settings })
    const res = await call('/api/sync', { method: 'POST', headers: cookieFor('userA'), json: { since: EPOCH } })
    const body = await json<{ sessions: unknown[]; settings: unknown }>(res)
    expect(body.sessions).toEqual([{ ...session }])
    expect(body.settings).toEqual({ value: { ...settings.value, unitSystem: 'imperial' }, updatedAt: settings.updatedAt })
  })
})

describe.skipIf(remote)('sync watermark is server-authoritative (H2)', () => {
  afterEach(() => vi.useRealTimers())

  it('a behind-clock device’s writes survive the cursor (not lost)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-27T00:00:00.000Z'))
    const auth = cookieFor('userA')
    await call('/api/sync', { method: 'POST', headers: auth, json: { routines: [routine({ id: 'r1', updatedAt: '2020-01-01T00:00:00.000Z' })] } })
    const first = await json<{ serverTime: string; routines: { id: string }[] }>(
      await call('/api/sync', { method: 'POST', headers: auth, json: { since: EPOCH } }))
    expect(first.routines.some((r) => r.id === 'r1')).toBe(true)

    vi.setSystemTime(new Date('2026-06-27T00:01:00.000Z'))
    await call('/api/sync', { method: 'POST', headers: auth, json: { routines: [routine({ id: 'r2', updatedAt: '2020-01-02T00:00:00.000Z' })] } })

    const second = await json<{ routines: { id: string }[] }>(
      await call('/api/sync', { method: 'POST', headers: auth, json: { since: first.serverTime } }))
    expect(second.routines.some((r) => r.id === 'r2')).toBe(true)
  })

  it('clamps a runaway-future client updatedAt so it cannot freeze the row', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-27T00:00:00.000Z'))
    const auth = cookieFor('userA')
    await call('/api/sync', { method: 'POST', headers: auth, json: { routines: [routine({ id: 'r1', name: 'FUTURE', updatedAt: '2999-01-01T00:00:00.000Z' })] } })
    vi.setSystemTime(new Date('2026-06-27T00:00:30.000Z'))
    await call('/api/sync', { method: 'POST', headers: auth, json: { routines: [routine({ id: 'r1', name: 'FIXED', updatedAt: '2026-06-27T00:00:30.000Z' })] } })
    const pulled = await json<{ routines: { id: string; name: string }[] }>(
      await call('/api/sync', { method: 'POST', headers: auth, json: { since: EPOCH } }))
    expect(pulled.routines.find((r) => r.id === 'r1')?.name).toBe('FIXED')
  })
})

describe('S1 - revocable + scoped tokens', () => {
  it('a revoked token stops authenticating', async () => {
    const t = await mint('userA')
    expect((await call('/api/sync', { method: 'POST', headers: t.headers, json: { since: EPOCH } })).status).toBe(200)
    await call(`/api/token?jti=${t.jti}`, { method: 'DELETE', headers: cookieFor('userA') })
    expect((await call('/api/sync', { method: 'POST', headers: t.headers, json: { since: EPOCH } })).status).toBe(401)
  })

  it('an unregistered (but validly-signed) token is rejected', async () => {
    const res = await call('/api/sync', { method: 'POST', headers: { authorization: `Bearer ${unregisteredPat('userA')}` }, json: { since: EPOCH } })
    expect(res.status).toBe(401)
  })

  it.skipIf(remote)('a token signed with another secret is rejected', async () => {
    const t = await mint('userA')
    env.SESSION_SECRET = 'rotated'
    expect((await call('/api/sync', { method: 'POST', headers: t.headers, json: {} })).status).toBe(401)
  })

  it('a read-only token can pull but never push/publish/report', async () => {
    const ro = await bearer('userA', 'read')
    expect((await call('/api/sync', { method: 'POST', headers: ro, json: { since: EPOCH } })).status).toBe(200)
    const push = await call('/api/sync', { method: 'POST', headers: ro, json: { routines: [routine()] } })
    expect(push.status).toBe(403)
    expect(await json(push)).toEqual({ error: 'read-only token cannot push' })
    const pub = await call('/api/routines/publish', { method: 'POST', headers: ro, json: { routine: { name: 'X', exerciseIds: ['push-ups'], workSeconds: 30, restSeconds: 10, rounds: 1 } } })
    expect(pub.status).toBe(403)
    expect(await json(pub)).toEqual({ error: 'read-only token cannot publish' })
    const rep = await call('/api/routines/report', { method: 'POST', headers: ro, json: { slug: 'x' } })
    expect(rep.status).toBe(403)
    expect(await json(rep)).toEqual({ error: 'read-only token cannot report' })
  })

  it('records when a token was last used', async () => {
    const t = await mint('userA')
    await call('/api/sync', { method: 'POST', headers: t.headers, json: {} })
    const list = await json<{ tokens: { id: string; lastUsedAt: string | null }[] }>(
      await call('/api/token', { headers: cookieFor('userA') }))
    expect(list.tokens.find((x) => x.id === t.jti)?.lastUsedAt).toBeTruthy()
  })
})

describe('S1 - token management endpoint (cookie-authed)', () => {
  it('mints, lists, and revokes', async () => {
    const cookie = cookieFor('userA')
    const minted = await call('/api/token', { method: 'POST', headers: cookie, json: { scope: 'read', label: '  My MCP  ' } })
    expect(minted.status).toBe(200)
    const m = await json<{ token: string; jti: string; scope: string; label: string }>(minted)
    expect(m).toMatchObject({ scope: 'read', label: 'My MCP' })
    expect(typeof m.token).toBe('string')

    const tokens = (await json<{ tokens: Record<string, unknown>[] }>(await call('/api/token', { headers: cookie }))).tokens
    expect(tokens.find((x) => x.id === m.jti)).toMatchObject({ scope: 'read', label: 'My MCP', revoked: false, lastUsedAt: null })
    expect(JSON.stringify(tokens)).not.toContain(m.token)

    const del = await call(`/api/token?jti=${encodeURIComponent(m.jti)}`, { method: 'DELETE', headers: cookie })
    expect(del.status).toBe(200)
    expect(await json(del)).toEqual({ ok: true })
    const after = await json<{ tokens: { id: string; revoked: boolean }[] }>(await call('/api/token', { headers: cookie }))
    expect(after.tokens.find((x) => x.id === m.jti)?.revoked).toBe(true)
  })

  it('defaults to a readwrite token with no label, and revokes by body jti too', async () => {
    const cookie = cookieFor('userA')
    const m = await json<{ jti: string; scope: string; label: unknown }>(
      await call('/api/token', { method: 'POST', headers: cookie }))
    expect(m).toMatchObject({ scope: 'readwrite', label: null })
    expect((await call('/api/token', { method: 'DELETE', headers: cookie, json: { jti: m.jti } })).status).toBe(200)
    const missing = await call('/api/token', { method: 'DELETE', headers: cookie })
    expect(missing.status).toBe(400)
    expect(await json(missing)).toEqual({ error: 'jti is required' })
  })

  it('only lists the caller’s own tokens', async () => {
    await call('/api/token', { method: 'POST', headers: cookieFor('userA'), json: {} })
    const listB = await json<{ tokens: unknown[] }>(await call('/api/token', { headers: cookieFor('userB') }))
    expect(listB.tokens).toHaveLength(0)
  })

  it('a PAT replayed via the session cookie does not authenticate (no scope/revocation bypass)', async () => {
    const t = await mint('userA', 'read')
    const res = await call('/api/token', { headers: { cookie: `ff_session=${t.token}` } })
    expect(res.status).toBe(401)
  })

  it('a PAT cannot manage tokens', async () => {
    const t = await mint('userA')
    expect((await call('/api/token', { headers: t.headers })).status).toBe(401)
  })

  it('cannot revoke another user’s token', async () => {
    const t = await mint('userA')
    await call(`/api/token?jti=${t.jti}`, { method: 'DELETE', headers: cookieFor('userB') })
    expect((await call('/api/sync', { method: 'POST', headers: t.headers, json: { since: EPOCH } })).status).toBe(200)
  })
})

describe('routines/public - no PII, validation, report dedup', () => {
  async function publish(userId: string, body: Record<string, unknown>) {
    return call('/api/routines/publish', { method: 'POST', headers: await bearer(userId), json: body })
  }
  const goodRoutine = { name: 'Coach Burner', exerciseIds: ['push-ups', 'squats'], workSeconds: 30, restSeconds: 10, rounds: 2 }

  it('publishes and serves only a safe, PII-free shape', async () => {
    const pub = await publish('userA', { routine: goodRoutine, ownerName: 'Coach' })
    expect(pub.status).toBe(200)
    const { slug } = await json<{ slug: string }>(pub)

    const list = await json<{ routines: Record<string, unknown>[] }>(await call('/api/routines/public'))
    const item = list.routines.find((x) => x.slug === slug)
    expect(item).toMatchObject({ ...goodRoutine, ownerName: 'Coach', slug })
    expect(item).not.toHaveProperty('ownerId')
    expect(item).not.toHaveProperty('owner_id')
    expect(item).not.toHaveProperty('email')
    expect(JSON.stringify(item)).not.toContain('userA')

    const one = await call(`/api/routines/public?slug=${slug}`)
    expect(one.status).toBe(200)
    expect((await json<{ routine: Record<string, unknown> }>(one)).routine).toEqual(item)
  })

  it('a missing slug is a 404', async () => {
    const res = await call('/api/routines/public?slug=nope')
    expect(res.status).toBe(404)
    expect(await json(res)).toEqual({ error: 'not found' })
  })

  it('rate-limits a burst of publishes (429 after 10/hr)', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await publish('owner', { routine: goodRoutine })).status).toBe(200)
    }
    const res = await publish('owner', { routine: goodRoutine })
    expect(res.status).toBe(429)
    expect(await json(res)).toEqual({ error: 'publish limit reached' })
  })

  it('validates the routine', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ routine: { ...goodRoutine, name: '  ' } }, 'name is required'],
      [{}, 'name is required'],
      [{ routine: { ...goodRoutine, exerciseIds: ['ok', 'DROP TABLE routines'] } }, 'invalid exercise id'],
      [{ routine: { ...goodRoutine, exerciseIds: [] } }, 'invalid routine'],
      [{ routine: { ...goodRoutine, rounds: 'x' } }, 'invalid routine'],
      [{ routine: { ...goodRoutine, name: 'n'.repeat(101) } }, 'routine too large'],
      [{ routine: goodRoutine, ownerName: 'o'.repeat(61) }, 'routine too large'],
    ]
    for (const [body, error] of cases) {
      const res = await publish('userA', body)
      expect(res.status, error).toBe(400)
      expect(await json(res)).toEqual({ error })
    }
  })

  it('dedups reports per user: one reporter cannot block a routine', async () => {
    const { slug } = await json<{ slug: string }>(await publish('userA', { routine: goodRoutine }))
    const spammer = await bearer('spammer')
    for (let i = 0; i < 3; i++) {
      const res = await call('/api/routines/report', { method: 'POST', headers: spammer, json: { slug } })
      expect(await json(res)).toEqual({ ok: true })
    }
    const list = await json<{ routines: { slug: string }[] }>(await call('/api/routines/public'))
    expect(list.routines.some((x) => x.slug === slug)).toBe(true)
  })

  it('hides a routine after 3 DISTINCT reporters', async () => {
    const { slug } = await json<{ slug: string }>(await publish('userA', { routine: goodRoutine }))
    for (const u of ['r1', 'r2', 'r3']) {
      await call('/api/routines/report', { method: 'POST', headers: await bearer(u), json: { slug } })
    }
    const list = await json<{ routines: { slug: string }[] }>(await call('/api/routines/public'))
    expect(list.routines.some((x) => x.slug === slug)).toBe(false)
    expect((await call(`/api/routines/public?slug=${slug}`)).status).toBe(404)
  })

  it('rejects a report without a slug, or for a non-existent routine (no orphan rows)', async () => {
    const empty = await call('/api/routines/report', { method: 'POST', headers: cookieFor('userA'), json: {} })
    expect(empty.status).toBe(400)
    expect(await json(empty)).toEqual({ error: 'slug is required' })
    const res = await call('/api/routines/report', { method: 'POST', headers: await bearer('userA'), json: { slug: 'nope' } })
    expect(res.status).toBe(404)
    const n = Number((await testDb().execute(`SELECT COUNT(*) AS n FROM routine_reports`)).rows[0]?.n ?? -1)
    expect(n).toBe(0)
  })
})

describe('B1 - body/weight/challenge sync (LWW + tombstone + scoping)', () => {
  interface FullPull {
    weightLog: { id: string; weightKg: number; deletedAt?: string }[]
    challengeProgress: { challengeId: string; completedDays: Record<number, string>; deletedAt?: string }[]
    bodyProfile: { heightCm?: number; goalWeightKg?: number } | null
  }
  async function push(userId: string, body: unknown) {
    return call('/api/sync', { method: 'POST', headers: cookieFor(userId), json: body })
  }
  async function pull(userId: string, since = EPOCH): Promise<FullPull> {
    return json<FullPull>(await call('/api/sync', { method: 'POST', headers: cookieFor(userId), json: { since } }))
  }

  it('weight log: newer wins, tombstones propagate, scoped per user', async () => {
    const w = (over = {}) => ({ id: 'w1', date: '2026-06-01', weightKg: 80, createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z', ...over })
    await push('userA', { weightLog: [w()] })
    await push('userA', { weightLog: [w({ weightKg: 78, updatedAt: '2026-06-10T00:00:00.000Z' })] })
    await push('userA', { weightLog: [w({ weightKg: 99, updatedAt: '2025-01-01T00:00:00.000Z' })] })
    expect((await pull('userA')).weightLog.find((x) => x.id === 'w1')?.weightKg).toBe(78)

    await push('userA', { weightLog: [w({ updatedAt: '2026-06-20T00:00:00.000Z', deletedAt: '2026-06-20T00:00:00.000Z' })] })
    expect((await pull('userA')).weightLog.find((x) => x.id === 'w1')?.deletedAt).toBeTruthy()

    await push('userB', { weightLog: [w({ id: 'wB', updatedAt: '2026-06-05T00:00:00.000Z' })] })
    expect((await pull('userA')).weightLog.some((x) => x.id === 'wB')).toBe(false)
  })

  it('body profile: singleton LWW, scoped per user', async () => {
    await push('userA', { bodyProfile: { heightCm: 180, updatedAt: '2026-06-01T00:00:00.000Z' } })
    await push('userA', { bodyProfile: { heightCm: 182, goalWeightKg: 75, updatedAt: '2026-06-10T00:00:00.000Z' } })
    await push('userA', { bodyProfile: { heightCm: 1, updatedAt: '2025-01-01T00:00:00.000Z' } })
    expect((await pull('userA')).bodyProfile).toMatchObject({ heightCm: 182, goalWeightKg: 75 })
    expect((await pull('userB')).bodyProfile).toBeNull()
  })

  it('challenge progress: newer wins, completedDays preserved, scoped', async () => {
    const c = (over = {}) => ({ challengeId: 'c30', completedDays: { 1: '2026-06-01T00:00:00.000Z' }, startedAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z', ...over })
    await push('userA', { challengeProgress: [c()] })
    await push('userA', { challengeProgress: [c({ completedDays: { 1: 'x', 2: 'y' }, updatedAt: '2026-06-05T00:00:00.000Z' })] })
    const row = (await pull('userA')).challengeProgress.find((x) => x.challengeId === 'c30')
    expect(Object.keys(row?.completedDays ?? {})).toEqual(['1', '2'])
    expect((await pull('userB')).challengeProgress.some((x) => x.challengeId === 'c30')).toBe(false)
  })

  it('challenge progress: cleared_days (per-day unmark tombstones) round-trip (M2)', async () => {
    await push('userA', {
      challengeProgress: [{
        challengeId: 'c30', completedDays: { 2: '2026-06-02T00:00:00.000Z' },
        clearedDays: { 1: '2026-06-03T00:00:00.000Z' },
        startedAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-03T00:00:00.000Z',
      }],
    })
    const row = (await pull('userA')).challengeProgress.find((x) => x.challengeId === 'c30') as
      { completedDays: Record<number, string>; clearedDays?: Record<number, string> } | undefined
    expect(row?.completedDays).toEqual({ 2: '2026-06-02T00:00:00.000Z' })
    expect(row?.clearedDays).toEqual({ 1: '2026-06-03T00:00:00.000Z' })
  })

  it('a read-only token cannot push body data', async () => {
    const ro = await bearer('userA', 'read')
    const res = await call('/api/sync', { method: 'POST', headers: ro, json: { weightLog: [{ id: 'w', date: '2026-06-01', weightKg: 80, createdAt: 'x', updatedAt: 'x' }] } })
    expect(res.status).toBe(403)
  })
})

describe('publish validation + atomic caps (L2, L4)', () => {
  const good = { name: 'X', exerciseIds: ['push-ups'], workSeconds: 30, restSeconds: 10, rounds: 2 }
  const pub = async (over: Record<string, unknown>) =>
    call('/api/routines/publish', { method: 'POST', headers: cookieFor('u'), json: { routine: { ...good, ...over } } })

  it('rejects out-of-range numeric fields (L2)', async () => {
    for (const over of [{ rounds: 0 }, { workSeconds: -5 }, { workSeconds: 1e12 }, { rounds: 999 }, { restSeconds: -1 }]) {
      const res = await pub(over)
      expect(res.status, JSON.stringify(over)).toBe(400)
      expect(await json(res)).toEqual({ error: 'routine values out of range' })
    }
    expect((await pub({})).status).toBe(200)
  })

  it('enforces the per-owner cap atomically - 429 when already at the limit (L4)', async () => {
    const stmts = Array.from({ length: 25 }, (_, i) => ({
      sql: `INSERT INTO public_routines (slug, owner_id, name, exercise_ids, work_seconds, rest_seconds, rounds, created_at, reports, blocked)
            VALUES (?, ?, 'n', '["push-ups"]', 30, 10, 1, ?, 0, 0)`,
      args: [`seed${i}`, 'capped', '2020-01-01T00:00:00.000Z'],
    }))
    await testDb().batch(stmts, 'write')
    const res = await call('/api/routines/publish', { method: 'POST', headers: cookieFor('capped'), json: { routine: good } })
    expect(res.status).toBe(429)
  })
})

describe('cookie parsing fails closed (L5)', () => {
  it('a malformed cookie resolves to unauthenticated rather than a 500', async () => {
    const me = await call('/api/me', { headers: { cookie: 'ff_session=%' } })
    expect(me.status).toBe(200)
    expect((await json(me)).user).toBeNull()
    const sync = await call('/api/sync', { method: 'POST', headers: { cookie: 'ff_session=%' }, json: {} })
    expect(sync.status).toBe(401)
  })

  it('an expired session does not authenticate', async () => {
    const { signToken } = await import('./contract-helpers.ts')
    const expired = signToken({ uid: 'userA', sid: true, exp: Math.floor(Date.now() / 1000) - 1 })
    expect((await call('/api/token', { headers: { cookie: `ff_session=${expired}` } })).status).toBe(401)
  })
})

describe('/api/me authenticated branch (L11)', () => {
  it.skipIf(remote)('maps the user row for a valid session and returns null for a missing row', async () => {
    await testDb().execute({
      sql: `INSERT INTO users (id, provider, provider_id, email, name, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: ['u-me', 'github', 'gh-9', 'me@x.com', 'Me', 'http://a/v.png', '2026-01-01T00:00:00.000Z'],
    })
    const ok = await call('/api/me', { headers: cookieFor('u-me') })
    expect(ok.status).toBe(200)
    expect(await json(ok)).toEqual({
      user: { id: 'u-me', email: 'me@x.com', name: 'Me', avatarUrl: 'http://a/v.png' },
      providers: [],
    })
    const missing = await call('/api/me', { headers: cookieFor('ghost') })
    expect((await json(missing)).user).toBeNull()
  })
})

describe.skipIf(remote)('OAuth callback (M6, L6)', () => {
  const realFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = realFetch })

  interface Seen { url: string; init?: RequestInit }
  /** Stubs GitHub's token and profile endpoints; records what the API sent. */
  function stubGithub(profile: { id: number; login: string; name: string | null; email: string | null }, accessToken: string | null = 'tok') {
    env.GITHUB_CLIENT_ID = 'gid'
    env.GITHUB_CLIENT_SECRET = 'gsecret'
    const seen: Seen[] = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      seen.push({ url, init })
      const body = url.startsWith('https://github.com/login/oauth/access_token')
        ? (accessToken ? { access_token: accessToken } : { error: 'bad_verification_code' })
        : url === 'https://api.github.com/user'
          ? { ...profile, avatar_url: null }
          : url === 'https://api.github.com/user/emails'
            ? [{ email: 'primary@b.com', primary: true, verified: true }]
            : null
      return new Response(JSON.stringify(body), { status: body ? 200 : 404, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    return seen
  }

  async function startLogin(returnTo = '/'): Promise<{ cookie: string; state: string }> {
    const res = await call(`/api/auth/login?provider=github&returnTo=${encodeURIComponent(returnTo)}`)
    const state = new URL(res.headers.get('location')!).searchParams.get('state')!
    return { cookie: `ff_oauth=${cookieValue(res, 'ff_oauth')}`, state }
  }
  const userCount = async () => Number((await testDb().execute('SELECT COUNT(*) AS n FROM users')).rows[0]?.n ?? -1)

  it('sends a missing/mismatched state back to the app with a sign-in notice, clears the state cookie and writes no user', async () => {
    const res = await call('/api/auth/callback?code=x&state=nope')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/?signin=expired')
    expect(setCookies(res)).toEqual(['ff_oauth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'])
    expect(await userCount()).toBe(0)

    // A bare callback URL (no code, no state, no cookie), as a reload or a typed URL sends it.
    const bare = await call('/api/auth/callback')
    expect(bare.status).toBe(302)
    expect(bare.headers.get('location')).toBe('/?signin=expired')
    expect(setCookies(bare).some((c) => c.startsWith('ff_session='))).toBe(false)

    stubGithub({ id: 1, login: 'a', name: 'A', email: 'a@b.com' })
    const s = await startLogin('/settings')
    const noCode = await call(`/api/auth/callback?state=${s.state}`, { headers: { cookie: s.cookie } })
    expect(noCode.headers.get('location')).toBe('/settings?signin=expired')
    expect(await userCount()).toBe(0)
  })

  it('says "cancelled" when the user declines on the provider', async () => {
    stubGithub({ id: 1, login: 'a', name: 'A', email: 'a@b.com' })
    const s = await startLogin('/settings')
    const res = await call(`/api/auth/callback?state=${s.state}&error=access_denied`, { headers: { cookie: s.cookie } })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/settings?signin=cancelled')
  })

  it('sends a replayed callback from a signed-in browser back to the app without a notice or a new session', async () => {
    const res = await call('/api/auth/callback?code=old&state=old', { headers: { cookie: sessionCookie('u1') } })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/')
    expect(setCookies(res)).toEqual(['ff_oauth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'])
  })

  it('upserts a user, sets a session, and reuses the id on a second sign-in', async () => {
    const seen = stubGithub({ id: 1, login: 'alogin', name: null, email: null })
    const s1 = await startLogin('/stats')
    const r1 = await call(`/api/auth/callback?code=c&state=${s1.state}`, { headers: { cookie: s1.cookie } })
    expect(r1.status).toBe(302)
    expect(r1.headers.get('location')).toBe('/stats')
    const cookies = setCookies(r1)
    expect(cookies[0]).toBe('ff_oauth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0')
    expect(cookies[1]).toMatch(/^ff_session=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$/)

    const exchange = seen.find((x) => x.url.startsWith('https://github.com/login/oauth/access_token'))!
    const form = new URLSearchParams(String(exchange.init?.body))
    expect(Object.fromEntries(form)).toEqual({
      client_id: 'gid', client_secret: 'gsecret', code: 'c', redirect_uri: `${ORIGIN}/api/auth/callback`, grant_type: 'authorization_code',
    })

    // The new session works, and the profile fell back to login + primary email.
    const me = await json<{ user: Record<string, unknown> }>(
      await call('/api/me', { headers: { cookie: `ff_session=${cookieValue(r1, 'ff_session')}` } }))
    expect(me.user).toMatchObject({ name: 'alogin', email: 'primary@b.com' })
    const id1 = me.user.id

    const s2 = await startLogin('/')
    await call(`/api/auth/callback?code=c&state=${s2.state}`, { headers: { cookie: s2.cookie } })
    const rows = (await testDb().execute('SELECT id FROM users')).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(id1)
  })

  it('answers 502 when the provider gives no access token', async () => {
    stubGithub({ id: 1, login: 'a', name: 'A', email: 'a@b.com' }, null)
    const s = await startLogin()
    const res = await call(`/api/auth/callback?code=c&state=${s.state}`, { headers: { cookie: s.cookie } })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/?signin=failed')
    expect(setCookies(res).some((c) => c.startsWith('ff_session='))).toBe(false)
  })

  it('logs one JSON line per failure naming the reason, never the code, state or cookie', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const reasons = () => warn.mock.calls.map((c) => JSON.parse(String(c[0])) as Record<string, unknown>)
      stubGithub({ id: 1, login: 'a', name: 'A', email: 'a@b.com' }, null)

      await call('/api/auth/callback?code=secretcode&state=secretstate')
      const s1 = await startLogin()
      await call('/api/auth/callback?code=secretcode&state=wrong', { headers: { cookie: s1.cookie } })
      const s2 = await startLogin()
      await call(`/api/auth/callback?state=${s2.state}&error=access_denied`, { headers: { cookie: s2.cookie } })
      await call(`/api/auth/callback?code=c&state=${s2.state}`, { headers: { cookie: 'ff_oauth=forged.sig' } })
      const s3 = await startLogin()
      await call(`/api/auth/callback?code=secretcode&state=${s3.state}`, { headers: { cookie: s3.cookie } })

      expect(reasons()).toEqual([
        { event: 'auth_callback_failed', reason: 'missing_cookie', route: '/api/auth/callback', status: 302 },
        { event: 'auth_callback_failed', reason: 'state_mismatch', route: '/api/auth/callback', status: 302, provider: 'github' },
        { event: 'auth_callback_failed', reason: 'missing_code', route: '/api/auth/callback', status: 302, provider: 'github', providerError: 'access_denied' },
        { event: 'auth_callback_failed', reason: 'invalid_cookie', route: '/api/auth/callback', status: 302 },
        {
          event: 'auth_callback_failed', reason: 'token_exchange_failed', route: '/api/auth/callback', status: 302,
          provider: 'github', providerStatus: 200, providerError: 'bad_verification_code',
        },
      ])
      const logged = warn.mock.calls.map((c) => String(c[0])).join('\n')
      for (const secret of ['secretcode', 'secretstate', s1.state, s3.state, 'forged', 'gsecret']) {
        expect(logged).not.toContain(secret)
      }
    } finally {
      warn.mockRestore()
    }
  })

  it('logs profile_fetch_failed when the provider profile call fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      env.GITHUB_CLIENT_ID = 'gid'
      env.GITHUB_CLIENT_SECRET = 'gsecret'
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        return url.startsWith('https://github.com/login/oauth/access_token')
          ? new Response(JSON.stringify({ access_token: 'tok' }), { headers: { 'content-type': 'application/json' } })
          : new Response('{}', { status: 401 })
      }) as typeof fetch
      const s = await startLogin()
      const res = await call(`/api/auth/callback?code=c&state=${s.state}`, { headers: { cookie: s.cookie } })
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe('/?signin=failed')
      expect(JSON.parse(String(error.mock.calls[0]?.[0]))).toEqual({
        event: 'auth_callback_failed', reason: 'profile_fetch_failed', route: '/api/auth/callback', status: 302,
        provider: 'github', error: 'Error: GitHub profile fetch failed: 401',
      })
    } finally {
      error.mockRestore()
    }
  })

  it('sends the user back with "unavailable" when the provider was switched off after login started', async () => {
    stubGithub({ id: 1, login: 'a', name: 'A', email: 'a@b.com' })
    const s = await startLogin()
    delete env.GITHUB_CLIENT_SECRET
    const res = await call(`/api/auth/callback?code=c&state=${s.state}`, { headers: { cookie: s.cookie } })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/?signin=unavailable')
  })

  it('rejects an identity not on the allow-list when one is configured (L6)', async () => {
    stubGithub({ id: 2, login: 'x', name: 'X', email: 'stranger@evil.com' })
    env.ALLOWED_EMAILS = 'owner@example.com'
    const s = await startLogin()
    const res = await call(`/api/auth/callback?code=c&state=${s.state}`, { headers: { cookie: s.cookie } })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/?signin=not_allowed')
    expect(await userCount()).toBe(0)
  })

  it('lets an allow-listed provider id in', async () => {
    stubGithub({ id: 7, login: 'x', name: 'X', email: 'someone@else.com' })
    env.ALLOWED_PROVIDER_IDS = 'github:7'
    const s = await startLogin()
    expect((await call(`/api/auth/callback?code=c&state=${s.state}`, { headers: { cookie: s.cookie } })).status).toBe(302)
  })
})
