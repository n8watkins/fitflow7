import type { CloudflareOptions, ErrorEvent } from '@sentry/cloudflare'
import pkg from '../../package.json'

// Server-side error tracking options. Off (no DSN, so the SDK is disabled)
// unless the SENTRY_DSN secret is set. sendDefaultPii stays at its default
// (off), and beforeSend strips the rest: no IPs, cookies, headers,
// bodies or query strings leave the Worker.

export function sentryOptions(env: { SENTRY_DSN?: string; APP_URL?: string }): CloudflareOptions {
  return {
    dsn: env.SENTRY_DSN || undefined,
    enabled: Boolean(env.SENTRY_DSN),
    environment: env.APP_URL?.includes('fitflow7.n8builds.dev') ? 'production' : 'development',
    release: `fitflow7@${pkg.version}`,
    tracesSampleRate: 0.05,
    beforeSend: scrubEvent,
  }
}

/** Removes anything that could identify a person or carry a secret. */
export function scrubEvent<T extends ErrorEvent>(event: T): T {
  delete event.user
  if (event.request) {
    delete event.request.cookies
    delete event.request.headers
    delete event.request.data
    delete event.request.query_string
    if (event.request.url) event.request.url = event.request.url.split('?')[0]
  }
  return event
}
