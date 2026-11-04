import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CLIENT_ROUTES, isClientRoute } from '../src/routes'
import { serveApp } from '../worker/lib/pages'
import { scrubEvent } from '../worker/lib/sentry'

// Unknown paths are real 404s: the Worker serves the app with status 404 for
// any path the router does not know, and the app shows its not-found page.

describe('page routes', () => {
  it('match the routes the app declares', () => {
    const app = fs.readFileSync('src/App.tsx', 'utf8')
    const declared = [...app.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== '*')
    expect(declared).toEqual([...CLIENT_ROUTES])
  })

  it('recognises app pages and nothing else', () => {
    for (const p of ['/', '/settings', '/settings/', '/workout/classic-7', '/routines/abc/edit']) expect(isClientRoute(p), p).toBe(true)
    for (const p of ['/nope', '/settings/x', '/workout', '/routines/abc', '/wp-admin']) expect(isClientRoute(p), p).toBe(false)
  })
})

describe('Worker page serving', () => {
  const shell = '<!doctype html><div id="root"></div>'
  const assets = {
    fetch: async (req: Request) => {
      const { pathname } = new URL(req.url)
      if (pathname === '/' || !/\.[a-z0-9]+$/i.test(pathname)) return new Response(shell, { headers: { 'content-type': 'text/html', 'x-frame-options': 'DENY' } })
      return new Response('missing', { status: 404 })
    },
  } as unknown as Fetcher
  const get = (path: string, method = 'GET') => {
    const url = new URL(`https://fitflow7.test${path}`)
    return serveApp(new Request(url, { method }), { ASSETS: assets }, url)
  }

  it('answers an unknown path with the app at status 404, keeping its headers', async () => {
    const res = await get('/no-such-page')
    expect(res.status).toBe(404)
    expect(await res.text()).toBe(shell)
    expect(res.headers.get('x-frame-options')).toBe('DENY')
  })

  it('answers app pages with 200', async () => {
    for (const p of ['/', '/settings', '/workout/classic-7']) expect((await get(p)).status, p).toBe(200)
  })

  it('leaves files to the static assets', async () => {
    expect((await get('/missing.js')).status).toBe(404)
    expect(await (await get('/missing.js')).text()).toBe('missing')
  })

  it('sends no body for HEAD', async () => {
    const res = await get('/nope', 'HEAD')
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('')
  })
})

describe('error report scrubbing', () => {
  it('drops user, cookies, headers, bodies and query strings', () => {
    const event = scrubEvent({
      type: undefined,
      user: { id: 'u', ip_address: '1.2.3.4' },
      request: { url: 'https://x.test/api/sync?token=abc', cookies: { ff_session: 's' }, headers: { cookie: 'c' }, data: '{}', query_string: 'token=abc' },
    })
    expect(event.user).toBeUndefined()
    expect(event.request).toEqual({ url: 'https://x.test/api/sync' })
  })
})
