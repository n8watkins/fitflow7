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
  setSession,
} from '../../lib/auth.ts'
import { ensureSchema, getDb } from '../../lib/db.ts'
import type { ApiContext } from '../../lib/http.ts'
import { errorSummary, logError, logWarn, oauthErrorCode } from '../../lib/log.ts'

const ROUTE = '/api/auth/callback'
const EVENT = 'auth_callback_failed'

// GET /api/auth/callback?code=...&state=...
// Verifies state, exchanges the code for an access token, fetches the profile,
// upserts the user, issues a session cookie, and bounces back into the app.
// Every failure logs one JSON line naming the reason (never the code, state,
// cookie, token or profile).
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
    logWarn({
      event: EVENT,
      reason,
      route: ROUTE,
      status: 400,
      provider: saved?.provider,
      // The provider's own reason when it sent the user back without a code
      // (access_denied when they cancel).
      providerError: oauthErrorCode(ctx.query('error')),
    })
    return ctx.send(400, 'OAuth state mismatch — please try signing in again.')
  }

  const provider = saved.provider
  const config = PROVIDERS[provider]
  const credentials = getCredentials(ctx.env, provider)
  if (!credentials) {
    logError({ event: EVENT, reason: 'provider_not_configured', route: ROUTE, status: 501, provider })
    return ctx.send(501, 'Provider not configured.')
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
        status: 502,
        provider,
        providerStatus: tokenRes.status,
        // GitHub answers 200 with { error: "bad_verification_code" }; Google
        // answers 400 with { error: "invalid_grant" }.
        providerError: oauthErrorCode(tokenJson.error),
      })
      return ctx.send(502, 'Failed to obtain access token.')
    }

    stage = 'profile_fetch_failed'
    const profile = await config.fetchProfile(tokenJson.access_token)

    // Optional single-tenant lock-down: if an allow-list is configured, reject
    // identities that aren't on it before creating any account (L6).
    if (!isAllowedIdentity(ctx.env, provider, profile)) {
      logWarn({ event: EVENT, reason: 'identity_not_allowed', route: ROUTE, status: 403, provider })
      return ctx.send(403, 'This deployment is private — your account is not permitted.')
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
      logError({ event: EVENT, reason: 'user_upsert_failed', route: ROUTE, status: 500, provider })
      return ctx.send(500, 'Sign-in failed. Please try again.')
    }

    setSession(ctx, userId)
    return ctx.redirect(302, sanitizeReturnTo(saved.returnTo))
  } catch (err) {
    logError({ event: EVENT, reason: stage, route: ROUTE, status: 500, provider, error: errorSummary(err) })
    return ctx.send(500, 'Sign-in failed. Please try again.')
  }
}
