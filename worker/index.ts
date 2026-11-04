import { handleApi } from './api.ts'

export { RateLimiter } from './rateLimiter.ts'

// FitFlow 7 on Cloudflare Workers. wrangler.jsonc sends /api/* here first; every
// other path is the Vite build in dist/, with index.html for client routes
// (assets.not_found_handling).
export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/api/')) return handleApi(request, env)
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
