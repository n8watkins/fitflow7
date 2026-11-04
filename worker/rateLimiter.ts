import { DurableObject } from 'cloudflare:workers'
import { takeToken, type Window } from './lib/rateLimit.ts'

/** One fixed rate-limit window for one bucket and key (see lib/rateLimit.ts).
 *  The count lives in memory: a window is one minute, and an object that sits
 *  idle long enough to be evicted has nothing left worth counting. */
export class RateLimiter extends DurableObject<Env> {
  private window: Window | undefined

  hit(limit: number, periodMs: number): { success: boolean } {
    const result = takeToken(this.window, Date.now(), limit, periodMs)
    this.window = result.window
    return { success: result.success }
  }
}
