import type { ApiEnv } from './http.ts'
import { errorSummary, logError } from './log.ts'

// Exact per-key rate limits on a Durable Object (worker/rateLimiter.ts): one
// object per bucket and key holds a fixed one-minute window. The Workers
// rate-limiting binding was tried first, but its counts are approximate and
// local to each machine, and on the live Worker 80 sign-ins in a minute from one
// address never tripped a limit of 20.

export const LIMITS = {
  /** Sign-in (login and callback), per IP. */
  auth: { limit: 20, periodMs: 60_000 },
  /** Every other API route, per IP. */
  api: { limit: 240, periodMs: 60_000 },
  /** Token mints, publishes and reports, per user. */
  write: { limit: 10, periodMs: 60_000 },
} as const

export type Bucket = keyof typeof LIMITS

export interface Window {
  start: number
  count: number
}

/** Counts one request against a fixed window; starts a new window once the
 *  period has passed. Pure, so the Durable Object and the tests share it. */
export function takeToken(window: Window | undefined, now: number, limit: number, periodMs: number): { window: Window; success: boolean } {
  const current = window && now - window.start < periodMs ? window : { start: now, count: 0 }
  const next = { start: current.start, count: current.count + 1 }
  return { window: next, success: next.count <= limit }
}

/** Whether this request fits the bucket's budget for `key`. No namespace (tests,
 *  local runs without the binding) means no limit; a Durable Object failure
 *  lets the request through and logs it, so an outage never locks users out. */
export async function allow(env: ApiEnv, bucket: Bucket, key: string): Promise<boolean> {
  const ns = env.RATE_LIMITER
  if (!ns) return true
  const { limit, periodMs } = LIMITS[bucket]
  try {
    const stub = ns.get(ns.idFromName(`${bucket}:${key}`))
    return (await stub.hit(limit, periodMs)).success
  } catch (err) {
    logError({ event: 'rate_limit_failed', reason: 'durable_object_error', route: bucket, error: errorSummary(err) })
    return true
  }
}
