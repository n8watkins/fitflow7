import crypto from 'node:crypto'
import {
  PROVIDERS,
  clearOAuthState,
  getCredentials,
  getRedirectUri,
  hasOAuthStateCookie,
  isAllowedIdentity,
  readOAuthState,
  sanitizeReturnTo,
} from '../../lib/auth.ts'
import { ensureSchema, getDb } from '../../lib/db.ts'
import { getUserId, startSession } from '../../lib/sessions.ts'
import type { ApiContext } from '../../lib/http.ts'
import { errorSummary, logError, logWarn, oauthErrorCode } from '../../lib/log.ts'

const ROUTE = '/api/auth/callback'
const EVENT = 'auth_callback_failed'

/** Why sign-in did not finish, as the app's `?signin=` notice reads it. */
export type SignInNotice = 'expired' | 'cancelled' | 'failed' | 'unavailable' | 'not_allowed'

/** Sends the browser back into the app with `?signin=<notice>`, so a failed or
 *  stale sign-in lands on a page with a "Sign in again" button instead of a bare
 *  text page. No session is set on this path. */
function backToApp(ctx: ApiContext, returnTo: string | undefined, notice: SignInNotice | null): Response {
  const target = new URL(sanitizeReturnTo(returnTo), 'https://app.invalid')
  target.searchParams.delete('signin')
  if (notice) target.searchParams.set('signin', notice)
  return ctx.redirect(302, `${target.pathname}${target.search}${target.hash}`)
}

// GET /api/auth/callback?code=...&state=...
// Verifies state, exchanges the code for an access token, fetches the profile,
// upserts the user, issues a session cookie, and bounces back into the app.
// Every failure logs one JSON line naming the reason (never the code, state,
// cookie, token or profile) and redirects into the app with `?signin=<notice>`.
// A stale or replayed callback (reload, back button, a second tab) from someone
// who is already signed in just goes back to the app without a notice.
export default async function callback(ctx: ApiContext): Promise<Response> {
  const code = ctx.query('code')
  const state = ctx.query('state')

  const hadCookie = hasOAuthStateCookie(ctx)
  const saved = readOAuthState(ctx)
  clearOAuthState(ctx)
  if (!saved || !state || saved.state !== state || !code) {
    const reason = !hadCookie
      ? 'missing_cookie'
      : !saved
        ? 'invalid_cookie'
        : !state || saved.state !== state
          ? 'state_mismatch'
          : 'missing_code'
    const signedIn = Boolean(await getUserId(ctx))
    logWarn({
      event: EVENT,
      reason,
      route: ROUTE,
      status: 302,
      provider: saved?.provider,
      // The provider's own reason when it sent the user back without a code
      // (access_denied when they cancel).
      providerError: oauthErrorCode(ctx.query('error')),
      // Already signed in: a reload, back button or second tab replaying an old
      // callback, not a failed sign-in.
      signedIn: signedIn || undefined,
    })
    if (signedIn) return backToApp(ctx, saved?.returnTo, null)
    const cancelled = reason === 'missing_code' && ctx.query('error') === 'access_denied'
    return backToApp(ctx, saved?.returnTo, cancelled ? 'cancelled' : 'expired')
  }

  const provider = saved.provider
  const config = PROVIDERS[provider]
  const credentials = getCredentials(ctx.env, provider)
  if (!credentials) {
    logError({ event: EVENT, reason: 'provider_not_configured', route: ROUTE, status: 302, provider })
    return backToApp(ctx, saved.returnTo, 'unavailable')
  }

  let stage = 'token_exchange_failed'
  try {
    // Exchange code -> access token.
    const tokenRes = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        code,
        redirect_uri: getRedirectUri(ctx),
        grant_type: 'authorization_code',
      }).toString(),
    })
    const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: unknown }
    if (!tokenJson.access_token) {
      logWarn({
        event: EVENT,
        reason: 'token_exchange_failed',
        route: ROUTE,
        status: 302,
        provider,
        providerStatus: tokenRes.status,
        // GitHub answers 200 with { error: "bad_verification_code" }; Google
        // answers 400 with { error: "invalid_grant" }.
        providerError: oauthErrorCode(tokenJson.error),
      })
      return backToApp(ctx, saved.returnTo, 'failed')
    }

    stage = 'profile_fetch_failed'
    const profile = await config.fetchProfile(tokenJson.access_token)

    // Optional single-tenant lock-down: if an allow-list is configured, reject
    // identities that aren't on it before creating any account (L6).
    if (!isAllowedIdentity(ctx.env, provider, profile)) {
      logWarn({ event: EVENT, reason: 'identity_not_allowed', route: ROUTE, status: 302, provider })
      return backToApp(ctx, saved.returnTo, 'not_allowed')
    }

    // Upsert the user; keep the existing id on conflict.
    stage = 'user_upsert_failed'
    await ensureSchema(ctx.env)
    const db = getDb(ctx.env)
    const result = await db.execute({
      sql: `INSERT INTO users (id, provider, provider_id, email, name, avatar_url, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(provider, provider_id)
            DO UPDATE SET email = excluded.email, name = excluded.name, avatar_url = excluded.avatar_url
            RETURNING id`,
      args: [
        crypto.randomUUID(),
        provider,
        profile.providerId,
        profile.email,
        profile.name,
        profile.avatarUrl,
        new Date().toISOString(),
      ],
    })
    const userId = result.rows[0]?.id as string | undefined
    if (!userId) {
      logError({ event: EVENT, reason: 'user_upsert_failed', route: ROUTE, status: 302, provider })
      return backToApp(ctx, saved.returnTo, 'failed')
    }

    stage = 'session_start_failed'
    await startSession(ctx, userId)
    return backToApp(ctx, saved.returnTo, null)
  } catch (err) {
    logError({ event: EVENT, reason: stage, route: ROUTE, status: 302, provider, error: errorSummary(err) })
    return backToApp(ctx, saved.returnTo, 'failed')
  }
}
