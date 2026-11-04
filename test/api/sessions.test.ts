import { describe, it, expect, beforeEach } from 'vitest'
import { handle, remote } from './target.ts'
import { DB_URL, SECRET, request, seedTestSessions, sessionCookie, signToken, testDb, type ApiEnv, type Req } from './contract-helpers.ts'

// Sessions live on the server: signing out ends the session for real, and "sign
// out everywhere" ends every session of the account. Before this, sign out only
// cleared the cookie, and a copied cookie kept working for its full 30 days.

let env: ApiEnv
const call = (path: string, opts: Req = {}) => handle(request(path, opts), env)
const me = async (cookie: string) => ((await (await call('/api/me', { headers: { cookie } })).json()) as { user: { id: string } | null }).user
const logout = (cookie: string, json?: unknown) => call('/api/auth/logout', { method: 'POST', headers: { cookie }, json })

beforeEach(async () => {
  env = { SESSION_SECRET: SECRET, TURSO_DATABASE_URL: DB_URL }
  await call('/api/routines/public')
  await testDb().batch(['DELETE FROM users', 'DELETE FROM access_tokens'], 'write')
  await testDb().execute({ sql: `INSERT INTO users (id, provider, provider_id, name, created_at) VALUES ('u1', 'github', '1', 'One', ?), ('u2', 'github', '2', 'Two', ?)`, args: [new Date().toISOString(), new Date().toISOString()] })
  await seedTestSessions()
})

/** A second browser for the same user: a real extra session row. */
async function secondDevice(userId: string): Promise<string> {
  const sid = `second-${userId}`
  await testDb().execute({
    sql: 'INSERT INTO auth_sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    args: [sid, userId, new Date().toISOString(), new Date(Date.now() + 3_600_000).toISOString()],
  })
  return `ff_session=${encodeURIComponent(signToken({ uid: userId, sid, exp: Math.floor(Date.now() / 1000) + 3600 }))}`
}

describe.skipIf(remote)('server-side sessions', () => {
  it('a cookie copied before sign out stops working after it', async () => {
    const cookie = sessionCookie('u1')
    expect((await me(cookie))?.id).toBe('u1')
    const res = await logout(cookie)
    expect(res.status).toBe(200)
    expect(await me(cookie)).toBeNull()
    expect((await call('/api/sync', { method: 'POST', headers: { cookie }, json: {} })).status).toBe(401)
  })

  it('signing out on one device leaves the others signed in', async () => {
    const other = await secondDevice('u1')
    await logout(sessionCookie('u1'))
    expect((await me(other))?.id).toBe('u1')
  })

  it('sign out everywhere ends every session of the account, and only that account', async () => {
    const other = await secondDevice('u1')
    const cookie = sessionCookie('u1')
    const token = (await (await call('/api/token', { method: 'POST', headers: { cookie }, json: {} })).json()) as { token: string }
    const res = await logout(cookie, { everywhere: true })
    expect(res.status).toBe(200)
    expect(await me(cookie)).toBeNull()
    expect(await me(other)).toBeNull()
    expect((await me(sessionCookie('u2')))?.id).toBe('u2')
    // Access tokens are separate and keep working.
    expect((await call('/api/sync', { method: 'POST', headers: { authorization: `Bearer ${token.token}` }, json: {} })).status).toBe(200)
  })

  it('a correctly signed cookie for a session that does not exist is signed out', async () => {
    const forged = `ff_session=${encodeURIComponent(signToken({ uid: 'u1', sid: 'never-created', exp: Math.floor(Date.now() / 1000) + 3600 }))}`
    expect(await me(forged)).toBeNull()
    // The old stateless form (sid: true) no longer signs anyone in.
    const legacy = `ff_session=${encodeURIComponent(signToken({ uid: 'u1', sid: true, exp: Math.floor(Date.now() / 1000) + 3600 }))}`
    expect(await me(legacy)).toBeNull()
  })

  it('an expired session row is signed out', async () => {
    expect((await me(sessionCookie('u1')))?.id).toBe('u1')
    await testDb().execute({ sql: `UPDATE auth_sessions SET expires_at = ? WHERE user_id = 'u1'`, args: [new Date(Date.now() - 1000).toISOString()] })
    expect(await me(sessionCookie('u1'))).toBeNull()
  })
})
