import { apiUrl } from './api'

// Browser error tracking. The Sentry SDK loads only when the Worker reports a
// DSN (/api/config, from the SENTRY_DSN secret), so local, CI and test runs
// load and send nothing. Events carry no PII: no user, IP, cookies or query
// strings, and known noise (extensions, aborted requests) is dropped.

type SentryModule = typeof import('@sentry/browser')

let sentry: SentryModule | null = null
const early: unknown[] = []

declare const __APP_RELEASE__: string

export async function initMonitoring(): Promise<void> {
  try {
    const res = await fetch(apiUrl('/api/config'))
    if (!res.ok) return
    const { sentryDsn } = (await res.json()) as { sentryDsn: string | null }
    if (!sentryDsn) return
    const mod = await import('@sentry/browser')
    mod.init({
      dsn: sentryDsn,
      release: __APP_RELEASE__,
      environment: location.hostname === 'fitflow7.n8builds.dev' ? 'production' : 'development',
      sampleRate: 1,
      tracesSampleRate: 0,
      denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//, /^safari-web-extension:\/\//],
      ignoreErrors: ['AbortError', 'The operation was aborted', 'ResizeObserver loop'],
      beforeSend(event) {
        delete event.user
        if (event.request) {
          delete event.request.cookies
          delete event.request.headers
          delete event.request.query_string
          if (event.request.url) event.request.url = event.request.url.split('?')[0]
        }
        return event
      },
    })
    sentry = mod
    for (const err of early.splice(0)) mod.captureException(err)
  } catch {
    // Monitoring is best effort; the app never depends on it.
  }
}

/** Reports an error, or holds it until monitoring has loaded. */
export function reportError(err: unknown): void {
  if (sentry) sentry.captureException(err)
  else if (early.length < 10) early.push(err)
}
