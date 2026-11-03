import { ApiContext, InvalidJsonError, type ApiEnv, type Route } from './lib/http.ts'
import me from './routes/me.ts'
import sync from './routes/sync.ts'
import token from './routes/token.ts'
import login from './routes/auth/login.ts'
import logout from './routes/auth/logout.ts'
import callback from './routes/auth/callback.ts'
import publicRoutines from './routes/routines/public.ts'
import publishRoutine from './routes/routines/publish.ts'
import reportRoutine from './routes/routines/report.ts'

// The /api routes. Each route checks the method itself, exactly as the Vercel
// Functions it replaced did, so status codes for a wrong method stay the same.
const ROUTES: Record<string, Route> = {
  '/api/me': me,
  '/api/sync': sync,
  '/api/token': token,
  '/api/auth/login': login,
  '/api/auth/logout': logout,
  '/api/auth/callback': callback,
  '/api/routines/public': publicRoutines,
  '/api/routines/publish': publishRoutine,
  '/api/routines/report': reportRoutine,
}

function notFound(): Response {
  return new Response('The page could not be found\n\nNOT_FOUND\n', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' },
  })
}

export async function handleApi(request: Request, env: ApiEnv): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/$/, '')
  const route = ROUTES[path]
  if (!route) return notFound()

  const ctx = await ApiContext.from(request, env)
  try {
    return await route(ctx)
  } catch (err) {
    if (err instanceof InvalidJsonError) return ctx.send(400, 'Invalid JSON')
    console.error(JSON.stringify({ message: 'api route failed', path, error: String(err) }))
    return ctx.json(500, { error: 'internal error' })
  }
}
