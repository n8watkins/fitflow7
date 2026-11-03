import type { VercelRequest, VercelResponse } from '@vercel/node'
import { PROVIDERS } from '../../api/_lib/auth.ts'
import syncHandler from '../../api/sync.ts'
import meHandler from '../../api/me.ts'
import tokenHandler from '../../api/token.ts'
import loginHandler from '../../api/auth/login.ts'
import logoutHandler from '../../api/auth/logout.ts'
import callbackHandler from '../../api/auth/callback.ts'
import publishHandler from '../../api/routines/publish.ts'
import publicHandler from '../../api/routines/public.ts'
import reportHandler from '../../api/routines/report.ts'
import type { ApiEnv } from './contract-helpers.ts'

// Runs the Vercel Functions in api/ behind a fetch-style interface that mimics
// what Vercel's Node runtime does with them: file-based routing, req.query and
// a JSON req.body, and the res.status/json/send/redirect helpers. The contract
// suite drives this and the Worker with the same Requests.

type Handler = (req: VercelRequest, res: VercelResponse) => unknown

const ROUTES: Record<string, Handler> = {
  '/api/sync': syncHandler,
  '/api/me': meHandler,
  '/api/token': tokenHandler,
  '/api/auth/login': loginHandler,
  '/api/auth/logout': logoutHandler,
  '/api/auth/callback': callbackHandler,
  '/api/routines/publish': publishHandler,
  '/api/routines/public': publicHandler,
  '/api/routines/report': reportHandler,
}

const ENV_KEYS = [
  'SESSION_SECRET', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'APP_URL',
  'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
  'ALLOWED_EMAILS', 'ALLOWED_PROVIDER_IDS',
] as const

function applyEnv(env: ApiEnv): void {
  for (const key of ENV_KEYS) {
    const value = env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  // auth.ts reads the OAuth client ids when it is first imported.
  PROVIDERS.github.clientId = env.GITHUB_CLIENT_ID
  PROVIDERS.github.clientSecret = env.GITHUB_CLIENT_SECRET
  PROVIDERS.google.clientId = env.GOOGLE_CLIENT_ID
  PROVIDERS.google.clientSecret = env.GOOGLE_CLIENT_SECRET
}

export async function handle(request: Request, env: ApiEnv): Promise<Response> {
  applyEnv(env)
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/$/, '')
  const handler = ROUTES[path]
  if (!handler) {
    return new Response('The page could not be found\n\nNOT_FOUND\n', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  const query: Record<string, string | string[]> = {}
  for (const [key, value] of url.searchParams) {
    const prev = query[key]
    query[key] = prev === undefined ? value : Array.isArray(prev) ? [...prev, value] : [prev, value]
  }
  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => { headers[key] = value })
  headers.host ??= url.host
  const text = await request.text()
  let body: unknown = undefined
  if (text && (headers['content-type'] ?? '').includes('application/json')) {
    try {
      body = JSON.parse(text)
    } catch {
      return new Response('Invalid JSON', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    }
  }

  let status = 200
  let resBody: string | null = null
  const resHeaders = new Headers()
  const setCookies: string[] = []
  const res = {
    status(code: number) { status = code; return res },
    json(value: unknown) {
      resHeaders.set('Content-Type', 'application/json; charset=utf-8')
      resBody = JSON.stringify(value)
      return res
    },
    send(value: string) {
      if (!resHeaders.has('Content-Type')) resHeaders.set('Content-Type', 'text/html; charset=utf-8')
      resBody = value
      return res
    },
    redirect(code: number, location: string) {
      status = code
      resHeaders.set('Location', location)
      return res
    },
    setHeader(key: string, value: string | string[]) {
      if (key.toLowerCase() === 'set-cookie') {
        setCookies.length = 0
        setCookies.push(...(Array.isArray(value) ? value : [value]))
      } else {
        resHeaders.set(key, Array.isArray(value) ? value.join(', ') : value)
      }
      return res
    },
    getHeader(key: string) {
      return key.toLowerCase() === 'set-cookie' ? (setCookies.length ? [...setCookies] : undefined) : resHeaders.get(key) ?? undefined
    },
    end() { return res },
  }
  const req = { method: request.method, headers, query, body, url: url.pathname + url.search }
  await handler(req as unknown as VercelRequest, res as unknown as VercelResponse)
  for (const cookie of setCookies) resHeaders.append('Set-Cookie', cookie)
  return new Response(resBody, { status, headers: resHeaders })
}
