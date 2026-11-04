import fs from 'node:fs'
import { describe, it, expect, beforeEach } from 'vitest'
import { handle, remote } from './target.ts'
import { DB_URL, ORIGIN, SECRET, request, sessionCookie, testDb, type ApiEnv, type Req } from './contract-helpers.ts'

// Browser-facing hardening: security headers on every API answer, no caching of
// private answers, cross-site writes refused, and rate limits on the routes a
// script could hammer.

let env: ApiEnv & Record<string, unknown>
const call = (path: string, opts: Req = {}) => handle(request(path, opts), env as ApiEnv)

/** A stand-in for the Workers rate-limiting binding: allows `limit` calls per key. */
function fakeLimiter(limit: number) {
  const seen = new Map<string, number>()
  return {
    keys: seen,
    async limit({ key }: { key: string }) {
      const n = (seen.get(key) ?? 0) + 1
      seen.set(key, n)
      return { success: n <= limit }
    },
  }
}

beforeEach(async () => {
  env = { SESSION_SECRET: SECRET, TURSO_DATABASE_URL: DB_URL }
  await call('/api/routines/public')
  await testDb().batch(['DELETE FROM access_tokens', 'DELETE FROM users'], 'write')
})

describe('security headers', () => {
  it('every API answer carries them and is never stored by a cache', async () => {
    for (const path of ['/api/me', '/api/routines/public', '/api/nope', '/api/sync']) {
      const res = await call(path)
      expect(res.headers.get('x-content-type-options'), path).toBe('nosniff')
      expect(res.headers.get('referrer-policy'), path).toBe('strict-origin-when-cross-origin')
      expect(res.headers.get('strict-transport-security'), path).toMatch(/^max-age=31536000/)
      expect(res.headers.get('content-security-policy'), path).toContain("frame-ancestors 'none'")
      expect(res.headers.get('x-frame-options'), path).toBe('DENY')
      expect(res.headers.get('cache-control'), path).toBe('private, no-store')
    }
  })

  it('the static app ships the same headers through public/_headers, and index.html has no inline script', () => {
    const rules = fs.readFileSync('public/_headers', 'utf8')
    for (const h of ['Content-Security-Policy:', "frame-ancestors 'none'", "script-src 'self'", 'Strict-Transport-Security:',
      'X-Content-Type-Options: nosniff', 'Referrer-Policy: strict-origin-when-cross-origin', 'X-Frame-Options: DENY']) {
      expect(rules).toContain(h)
    }
    // script-src 'self' blocks inline scripts, so the page must not rely on one.
    const html = fs.readFileSync('index.html', 'utf8')
    expect(html.match(/<script(?![^>]*\bsrc=)[^>]*>/g) ?? []).toEqual([])
  })
})

describe.skipIf(remote)('cross-site writes', () => {
  it('refuses a cookie-authenticated write from another origin, even a sibling n8builds.dev app', async () => {
    const res = await call('/api/token', {
      method: 'POST',
      headers: { cookie: sessionCookie('u1'), origin: 'https://pivot.n8builds.dev', 'content-type': 'text/plain' },
      body: 'x=1',
    })
    expect(res.status).toBe(403)
    const n = (await testDb().execute('SELECT COUNT(*) AS n FROM access_tokens')).rows[0]?.n
    expect(Number(n)).toBe(0)
  })

  it('allows the same origin, and bearer-token clients that send no cookie', async () => {
    const same = await call('/api/token', { method: 'POST', headers: { cookie: sessionCookie('u1'), origin: ORIGIN }, json: {} })
    expect(same.status).toBe(200)
  })

  it('logout only answers POST', async () => {
    expect((await call('/api/auth/logout', { method: 'GET' })).status).toBe(405)
    expect((await call('/api/auth/logout', { method: 'POST' })).status).toBe(200)
  })
})

describe.skipIf(remote)('rate limits', () => {
  it('sign-in routes answer 429 once the per-IP budget is spent', async () => {
    env.AUTH_LIMITER = fakeLimiter(2)
    env.GITHUB_CLIENT_ID = 'gid'
    env.GITHUB_CLIENT_SECRET = 'gs'
    const ip = { 'cf-connecting-ip': '203.0.113.9' }
    expect((await call('/api/auth/login?provider=github', { headers: ip })).status).toBe(302)
    expect((await call('/api/auth/callback', { headers: ip })).status).toBe(302)
    const blocked = await call('/api/auth/login?provider=github', { headers: ip })
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('retry-after')).toBe('60')
    // Another address still gets in.
    expect((await call('/api/auth/login?provider=github', { headers: { 'cf-connecting-ip': '203.0.113.10' } })).status).toBe(302)
  })

  it('API routes answer 429 once the budget is spent', async () => {
    env.API_LIMITER = fakeLimiter(3)
    const ip = { 'cf-connecting-ip': '203.0.113.9' }
    for (let i = 0; i < 3; i++) expect((await call('/api/me', { headers: ip })).status).toBe(200)
    expect((await call('/api/me', { headers: ip })).status).toBe(429)
  })

  it('token minting is limited per user and capped at 20 live tokens', async () => {
    env.WRITE_LIMITER = fakeLimiter(100)
    const ck = { cookie: sessionCookie('u1') }
    for (let i = 0; i < 20; i++) expect((await call('/api/token', { method: 'POST', headers: ck, json: {} })).status).toBe(200)
    const over = await call('/api/token', { method: 'POST', headers: ck, json: {} })
    expect(over.status).toBe(429)
    expect(await over.json()).toEqual({ error: 'token limit reached: revoke one first' })

    env.WRITE_LIMITER = fakeLimiter(1)
    const ck2 = { cookie: sessionCookie('u2') }
    expect((await call('/api/token', { method: 'POST', headers: ck2, json: {} })).status).toBe(200)
    expect((await call('/api/token', { method: 'POST', headers: ck2, json: {} })).status).toBe(429)
  })
})
