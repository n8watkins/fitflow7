import type { ApiContext } from '../lib/http.ts'

// GET /api/config: public settings the browser needs at runtime. The Sentry
// DSN is public by design (it only allows sending events); without it the
// browser loads no error tracking at all.
export default async function config(ctx: ApiContext): Promise<Response> {
  if (ctx.method !== 'GET') return ctx.json(405, { error: 'method not allowed' })
  return ctx.json(200, { sentryDsn: ctx.env.SENTRY_DSN || null })
}
