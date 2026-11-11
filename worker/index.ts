import * as Sentry from '@sentry/cloudflare'
import { handleApi } from './api.ts'
import { healthCheck } from './health.ts'
import { serveApp } from './lib/pages.ts'
import { sentryOptions } from './lib/sentry.ts'

export { RateLimiter } from './rateLimiter.ts'

// FitFlow 7 on Cloudflare Workers. wrangler.jsonc runs this first for every
// path except the hashed build files and exercise photos: /api/* is the API,
// app pages get index.html, and any other path without a file extension gets
// index.html too, but with status 404, so the app's not-found page is a real
// 404 for browsers, crawlers and link checkers. Files go to the static assets.
const handler = {
  async fetch(request, env): Promise<Response> {
    const health = healthCheck(request)
    if (health) return health
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) return handleApi(request, env)
    return serveApp(request, env, url)
  },
} satisfies ExportedHandler<Env>

// Error tracking wraps the Worker only when SENTRY_DSN is set; otherwise the
// SDK stays disabled and nothing is sent.
export default Sentry.withSentry((env: Env) => sentryOptions(env), handler)
