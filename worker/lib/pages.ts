import { isClientRoute } from '../../src/routes.ts'

/** Serves the built app: files as they are, app pages as index.html, and any
 *  other extension-less path as index.html with status 404, so the app's
 *  not-found page is a real 404 for browsers, crawlers and link checkers. */
export async function serveApp(request: Request, env: Pick<Env, 'ASSETS'>, url: URL): Promise<Response> {
  const isPage = (request.method === 'GET' || request.method === 'HEAD') && !/\.[a-z0-9]+$/i.test(url.pathname)
  if (!isPage || isClientRoute(url.pathname)) return env.ASSETS.fetch(request)
  const shell = await env.ASSETS.fetch(new Request(new URL('/', url), request))
  return new Response(request.method === 'HEAD' ? null : shell.body, { status: 404, headers: shell.headers })
}
