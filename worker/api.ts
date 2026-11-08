import { API_SECURITY_HEADERS, ApiContext, InvalidJsonError, type ApiEnv, type Route } from './lib/http.ts'
import { errorSummary, logError } from './lib/log.ts'
import { allow } from './lib/rateLimit.ts'
import me from './routes/me.ts'
import config from './routes/config.ts'
import sync from './routes/sync.ts'
import token from './routes/token.ts'
import login from './routes/auth/login.ts'
import logout from './routes/auth/logout.ts'
import callback from './routes/auth/callback.ts'
import publicRoutines from './routes/routines/public.ts'
import publishRoutine from './routes/routines/publish.ts'
import reportRoutine from './routes/routines/report.ts'

// The /api routes. Each route checks the method itself, so a wrong method gets
// the route's own 405.
const ROUTES: Record<string, Route> = {
  '/api/me': me,
  '/api/config': config,
  '/api/sync': sync,
  '/api/token': token,
  '/api/auth/login': login,
  '/api/auth/logout': logout,
  '/api/auth/callback': callback,
  '/api/routines/public': publicRoutines,
  '/api/routines/publish': publishRoutine,
  '/api/routines/report': reportRoutine,
}

// Sign-in routes get their own, smaller per-IP budget; every other route shares
// the API budget (lib/rateLimit.ts).
const AUTH_ROUTES = new Set(['/api/auth/login', '/api/auth/callback'])

const MAX_REQUEST_BYTES = 2_000_000

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function notFound(): Response {
  return new Response('The page could not be found\n\nNOT_FOUND\n', {
    status: 404,
    headers: { ...API_SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' },
  })
}


/** A browser write carrying the session cookie from another origin. Sibling
 *  *.n8builds.dev apps count as the same site, so SameSite=Lax alone would let
 *  their pages send the cookie; the Origin header tells them apart. Clients that
 *  authenticate with a bearer token send no cookie and are not affected. */
function isCrossSiteCookieWrite(request: Request, env: ApiEnv): boolean {
  if (SAFE_METHODS.has(request.method)) return false
  const origin = request.headers.get('origin')
  if (!origin) return false
  if (!(request.headers.get('cookie') ?? '').includes('ff_session=')) return false
  // The app's own origin: APP_URL, or the origin the request reached (the same
  // host in production; `wrangler dev` rewrites both to the route's host).
  const own = new Set([new URL(request.url).origin])
  if (env.APP_URL) own.add(new URL(env.APP_URL).origin)
  return !own.has(origin)
}

export async function handleApi(request: Request, env: ApiEnv): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/$/, '')
  const route = ROUTES[path]
  if (!route) return notFound()

  // No route takes more than about 1 MB; refuse bigger bodies before reading them.
  if (Number(request.headers.get('content-length') ?? 0) > MAX_REQUEST_BYTES) {
    return new Response(JSON.stringify({ error: 'request too large' }), {
      status: 413,
      headers: { ...API_SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
    })
  }
  const ctx = await ApiContext.from(request, env)
  if (isCrossSiteCookieWrite(request, env)) return ctx.json(403, { error: 'cross-site request refused' })

  if (!(await allow(env, AUTH_ROUTES.has(path) ? 'auth' : 'api', ctx.clientIp))) return ctx.tooManyRequests()

  try {
    return await route(ctx)
  } catch (err) {
    if (err instanceof InvalidJsonError) return ctx.send(400, 'Invalid JSON')
    logError({
      event: 'unhandled_exception',
      reason: 'route_threw',
      route: path,
      method: request.method,
      status: 500,
      error: errorSummary(err),
    })
    return ctx.json(500, { error: 'internal error' })
  }
}
