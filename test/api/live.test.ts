import { describe, it, expect } from 'vitest'

// Read-only checks of a deployed FitFlow 7: LIVE_URL=https://... npm test
// (LIVE_EXPECT_DB=0 for a host that has no database yet).
// Nothing here signs in or writes, so it is safe against production, and the
// same run against two hosts shows that they answer alike.
const base = process.env.LIVE_URL?.replace(/\/$/, '')
const JSON_TYPE = 'application/json; charset=utf-8'

async function hit(path: string, method = 'GET', init: RequestInit = {}): Promise<Response> {
  return fetch(`${base}${path}`, { method, redirect: 'manual', ...init })
}

describe.skipIf(!base)(`live: ${base}`, () => {
  it('serves the app shell for client routes and assets with their types', async () => {
    for (const path of ['/', '/stats', '/workout/classic-7', '/api']) {
      const res = await hit(path)
      expect(res.status, path).toBe(200)
      // Vercel adds '; charset=utf-8', Cloudflare does not; index.html declares UTF-8.
      expect(res.headers.get('content-type'), path).toMatch(/^text\/html\b/)
      expect(await res.text(), path).toContain('<div id="root">')
    }
    for (const [path, type] of [['/favicon.svg', 'image/svg+xml'], ['/manifest.webmanifest', 'application/manifest+json'], ['/privacypolicy.html', 'text/html']]) {
      const res = await hit(path)
      expect(res.status, path).toBe(200)
      expect(res.headers.get('content-type'), path).toContain(type)
    }
  })

  it('answers the signed-out API calls', async () => {
    const me = await hit('/api/me')
    expect(me.status).toBe(200)
    expect(me.headers.get('content-type')).toBe(JSON_TYPE)
    const body = (await me.json()) as { user: unknown; providers: string[] }
    expect(body.user).toBeNull()
    expect(Array.isArray(body.providers)).toBe(true)

    // 200 with a database, 500 "unavailable" without one (the app shows the
    // community library as offline).
    const pub = await hit('/api/routines/public')
    const pubBody = (await pub.json()) as { routines?: unknown[]; error?: string }
    if (process.env.LIVE_EXPECT_DB === '0') {
      expect(pub.status).toBe(500)
      expect(pubBody).toEqual({ error: 'unavailable' })
    } else {
      expect(pub.status).toBe(200)
      expect(Array.isArray(pubBody.routines)).toBe(true)
      expect((await hit('/api/routines/public?slug=does-not-exist')).status).toBe(404)
    }
  })

  it('gates, rejects and routes exactly as before', async () => {
    const cases: [string, string, number][] = [
      ['POST', '/api/sync', 401], ['GET', '/api/sync', 405], ['OPTIONS', '/api/sync', 405],
      ['GET', '/api/token', 401], ['POST', '/api/token', 401], ['DELETE', '/api/token', 401],
      ['POST', '/api/routines/publish', 401], ['GET', '/api/routines/publish', 405],
      ['POST', '/api/routines/report', 401], ['POST', '/api/routines/public', 405],
      ['GET', '/api/auth/login?provider=bogus', 400], ['GET', '/api/auth/login?provider=google', 501],
      ['GET', '/api/me/', 200], ['GET', '/api/nope', 404],
    ]
    for (const [method, path, status] of cases) {
      const res = await hit(path, method)
      expect(res.status, `${method} ${path}`).toBe(status)
      expect(res.headers.get('content-type'), `${method} ${path}`).toBe(status === 404 && path === '/api/nope' ? 'text/plain; charset=utf-8' : JSON_TYPE)
    }
  })

  it('logout clears the session cookie', async () => {
    const res = await hit('/api/auth/logout', 'POST')
    expect(res.status).toBe(200)
    expect(res.headers.getSetCookie()).toEqual(['ff_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'])
  })

  it('a bad OAuth callback is a 400 that clears the state cookie', async () => {
    const res = await hit('/api/auth/callback?code=x&state=y')
    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(res.headers.getSetCookie()).toEqual(['ff_oauth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'])
  })

  it('GitHub sign-in starts with a redirect back to this host, when it is configured', async (t) => {
    const { providers } = (await (await hit('/api/me')).json()) as { providers: string[] }
    if (!providers.includes('github')) {
      expect((await hit('/api/auth/login?provider=github')).status).toBe(501)
      t.skip()
    }
    const res = await hit('/api/auth/login?provider=github&returnTo=/stats')
    expect(res.status).toBe(302)
    const location = new URL(res.headers.get('location')!)
    expect(location.origin).toBe('https://github.com')
    expect(location.searchParams.get('redirect_uri')).toBe(`${base}/api/auth/callback`)
    expect(res.headers.getSetCookie()[0]).toMatch(/^ff_oauth=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/)
  })
})
