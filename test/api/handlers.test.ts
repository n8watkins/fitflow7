import { describe, it, expect, beforeEach } from 'vitest'
import { ensureSchema, getDb } from '../../api/_lib/db.ts'
import { createAccessToken } from '../../api/_lib/auth.ts'
import { recordToken, revokeToken, type AuthResult } from '../../api/_lib/tokens.ts'
import syncHandler from '../../api/sync.ts'
import meHandler from '../../api/me.ts'
import tokenHandler from '../../api/token.ts'
import publishHandler from '../../api/routines/publish.ts'
import publicHandler from '../../api/routines/public.ts'
import reportHandler from '../../api/routines/report.ts'

// B2 + S1: /api request-harness tests. Handlers are Vercel-style (req, res);
// we invoke them with hand-rolled stubs (no supertest / new deps) against a real
// in-memory libSQL DB (TURSO_DATABASE_URL=:memory:). Tables cleared per test.

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

type Scope = AuthResult['scope']

// Mint a PAT AND register it (only registered, non-revoked tokens authenticate).
async function mint(userId: string, scope: Scope = 'readwrite') {
  const { token, jti } = createAccessToken(userId, scope)
  await recordToken(getDb(), { jti, userId, label: null, scope, createdAt: new Date().toISOString() })
  return { headers: { authorization: `Bearer ${token}` }, jti, token }
}
async function bearer(userId: string, scope: Scope = 'readwrite') {
  return (await mint(userId, scope)).headers
}
// A forged session cookie: getUserId only checks the cookie's signed uid, so a
// signed token doubles as a session for cookie-authed endpoints in tests.
function cookieFor(userId: string): Record<string, string> {
  return { cookie: `ff_session=${createAccessToken(userId).token}` }
}

function routine(over: Record<string, unknown> = {}) {
  return {
    id: 'r1', name: 'A', exerciseIds: ['push-ups'], workSeconds: 30, restSeconds: 10, rounds: 1,
    isSystem: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...over,
  }
}

beforeEach(async () => {
  process.env.SESSION_SECRET = 'test-secret-xyz'
  process.env.TURSO_DATABASE_URL = ':memory:'
  await ensureSchema()
  await getDb().batch(
    ['DELETE FROM routines', 'DELETE FROM sessions', 'DELETE FROM settings', 'DELETE FROM public_routines',
      'DELETE FROM users', 'DELETE FROM access_tokens', 'DELETE FROM routine_reports'],
    'write',
  )
})

describe('auth gating', () => {
  it('me returns { user: null } when unauthenticated', async () => {
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
    expect((await call(publicHandler, { method: 'POST' })).statusCode).toBe(405)
    expect((await call(tokenHandler, { method: 'PUT', headers: cookieFor('u') })).statusCode).toBe(405)
  })

  it('fails closed when unconfigured: a valid-looking token is rejected with no SESSION_SECRET', async () => {
    const headers = await bearer('userA')
    delete process.env.SESSION_SECRET
    expect((await call(syncHandler, { method: 'POST', headers, body: {} })).statusCode).toBe(401)
  })
})

describe('sync — LWW + tombstones + user scoping', () => {
  async function push(userId: string, body: unknown) {
    return call(syncHandler, { method: 'POST', headers: await bearer(userId), body })
  }
  async function pull(userId: string, since = EPOCH) {
    const res = await call(syncHandler, { method: 'POST', headers: await bearer(userId), body: { since } })
    return (res.body as { routines: { id: string; name: string; deletedAt?: string }[] }).routines
  }

  it('a newer updated_at wins; an older push is ignored', async () => {
    await push('userA', { routines: [routine({ updatedAt: '2026-01-01T00:00:00.000Z' })] })
    await push('userA', { routines: [routine({ name: 'A2', updatedAt: '2026-02-01T00:00:00.000Z' })] })
    await push('userA', { routines: [routine({ name: 'STALE', updatedAt: '2025-01-01T00:00:00.000Z' })] })
    expect((await pull('userA')).find((x) => x.id === 'r1')?.name).toBe('A2')
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
})

describe('S1 — revocable + scoped tokens', () => {
  it('a revoked token stops authenticating', async () => {
    const t = await mint('userA')
    expect((await call(syncHandler, { method: 'POST', headers: t.headers, body: { since: EPOCH } })).statusCode).toBe(200)
    await revokeToken(getDb(), 'userA', t.jti)
    expect((await call(syncHandler, { method: 'POST', headers: t.headers, body: { since: EPOCH } })).statusCode).toBe(401)
  })

  it('an unregistered (but validly-signed) token is rejected', async () => {
    const { token } = createAccessToken('userA') // never recorded
    const res = await call(syncHandler, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: { since: EPOCH } })
    expect(res.statusCode).toBe(401)
  })

  it('a read-only token can pull but never push/publish/report', async () => {
    const ro = await bearer('userA', 'read')
    expect((await call(syncHandler, { method: 'POST', headers: ro, body: { since: EPOCH } })).statusCode).toBe(200)
    expect((await call(syncHandler, { method: 'POST', headers: ro, body: { routines: [routine()] } })).statusCode).toBe(403)
    expect((await call(publishHandler, { method: 'POST', headers: ro, body: { routine: { name: 'X', exerciseIds: ['push-ups'], workSeconds: 30, restSeconds: 10, rounds: 1 } } })).statusCode).toBe(403)
    expect((await call(reportHandler, { method: 'POST', headers: ro, body: { slug: 'x' } })).statusCode).toBe(403)
  })
})

describe('S1 — token management endpoint (cookie-authed)', () => {
  it('mints, lists, and revokes', async () => {
    const cookie = cookieFor('userA')
    const minted = await call(tokenHandler, { method: 'POST', headers: cookie, body: { scope: 'read', label: 'My MCP' } })
    expect(minted.statusCode).toBe(200)
    const { token, jti } = minted.body as { token: string; jti: string }
    expect(typeof token).toBe('string')

    const list = await call(tokenHandler, { method: 'GET', headers: cookie })
    const tokens = (list.body as { tokens: { id: string; scope: string; label: string | null; revoked: boolean }[] }).tokens
    const row = tokens.find((x) => x.id === jti)
    expect(row).toMatchObject({ scope: 'read', label: 'My MCP', revoked: false })

    const del = await call(tokenHandler, { method: 'DELETE', headers: cookie, query: { jti } })
    expect(del.statusCode).toBe(200)
    const after = await call(tokenHandler, { method: 'GET', headers: cookie })
    expect((after.body as { tokens: { id: string; revoked: boolean }[] }).tokens.find((x) => x.id === jti)?.revoked).toBe(true)
  })

  it('only lists the caller’s own tokens', async () => {
    await call(tokenHandler, { method: 'POST', headers: cookieFor('userA'), body: {} })
    const listB = await call(tokenHandler, { method: 'GET', headers: cookieFor('userB') })
    expect((listB.body as { tokens: unknown[] }).tokens).toHaveLength(0)
  })
})

describe('routines/public — no PII, validation, report dedup', () => {
  async function publish(userId: string, body: Record<string, unknown>) {
    return call(publishHandler, { method: 'POST', headers: await bearer(userId), body })
  }
  const goodRoutine = { name: 'Coach Burner', exerciseIds: ['push-ups', 'squats'], workSeconds: 30, restSeconds: 10, rounds: 2 }

  it('publishes and serves only a safe, PII-free shape', async () => {
    const pub = await publish('userA', { routine: goodRoutine, ownerName: 'Coach' })
    expect(pub.statusCode).toBe(200)
    const slug = (pub.body as { slug: string }).slug

    const list = await call(publicHandler, { method: 'GET' })
    const item = (list.body as { routines: Record<string, unknown>[] }).routines.find((x) => x.slug === slug)
    expect(item?.ownerName).toBe('Coach')
    expect(item).not.toHaveProperty('ownerId')
    expect(item).not.toHaveProperty('owner_id')
    expect(item).not.toHaveProperty('email')
    expect(JSON.stringify(item)).not.toContain('userA')
  })

  it('rejects malformed exercise ids server-side', async () => {
    const res = await publish('userA', { routine: { ...goodRoutine, exerciseIds: ['ok', 'DROP TABLE routines'] } })
    expect(res.statusCode).toBe(400)
  })

  it('dedups reports per user: one reporter cannot block a routine', async () => {
    const slug = ((await publish('userA', { routine: goodRoutine })).body as { slug: string }).slug
    const spammer = await bearer('spammer')
    for (let i = 0; i < 3; i++) await call(reportHandler, { method: 'POST', headers: spammer, body: { slug } })
    const list = await call(publicHandler, { method: 'GET' })
    expect((list.body as { routines: { slug: string }[] }).routines.some((x) => x.slug === slug)).toBe(true)
  })

  it('hides a routine after 3 DISTINCT reporters', async () => {
    const slug = ((await publish('userA', { routine: goodRoutine })).body as { slug: string }).slug
    for (const u of ['r1', 'r2', 'r3']) {
      await call(reportHandler, { method: 'POST', headers: await bearer(u), body: { slug } })
    }
    const list = await call(publicHandler, { method: 'GET' })
    expect((list.body as { routines: { slug: string }[] }).routines.some((x) => x.slug === slug)).toBe(false)
    expect((await call(publicHandler, { method: 'GET', query: { slug } })).statusCode).toBe(404)
  })
})
