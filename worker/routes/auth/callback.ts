import crypto from 'node:crypto'
import {
  PROVIDERS,
  clearOAuthState,
  getCredentials,
  getRedirectUri,
  isAllowedIdentity,
  readOAuthState,
  sanitizeReturnTo,
  setSession,
} from '../../lib/auth.ts'
import { ensureSchema, getDb } from '../../lib/db.ts'
import type { ApiContext } from '../../lib/http.ts'

// GET /api/auth/callback?code=...&state=...
// Verifies state, exchanges the code for an access token, fetches the profile,
// upserts the user, issues a session cookie, and bounces back into the app.
export default async function callback(ctx: ApiContext): Promise<Response> {
  const code = ctx.query('code')
  const state = ctx.query('state')

  const saved = readOAuthState(ctx)
  clearOAuthState(ctx)
  if (!saved || !state || saved.state !== state || !code) {
    return ctx.send(400, 'OAuth state mismatch — please try signing in again.')
  }

  const config = PROVIDERS[saved.provider]
  const credentials = getCredentials(ctx.env, saved.provider)
  if (!credentials) {
    return ctx.send(501, 'Provider not configured.')
  }

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
    const tokenJson = (await tokenRes.json()) as { access_token?: string }
    if (!tokenJson.access_token) {
      return ctx.send(502, 'Failed to obtain access token.')
    }

    const profile = await config.fetchProfile(tokenJson.access_token)

    // Optional single-tenant lock-down: if an allow-list is configured, reject
    // identities that aren't on it before creating any account (L6).
    if (!isAllowedIdentity(ctx.env, saved.provider, profile)) {
      return ctx.send(403, 'This deployment is private — your account is not permitted.')
    }

    // Upsert the user; keep the existing id on conflict.
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
        saved.provider,
        profile.providerId,
        profile.email,
        profile.name,
        profile.avatarUrl,
        new Date().toISOString(),
      ],
    })
    const userId = result.rows[0]?.id as string | undefined
    if (!userId) return ctx.send(500, 'Sign-in failed. Please try again.')

    setSession(ctx, userId)
    return ctx.redirect(302, sanitizeReturnTo(saved.returnTo))
  } catch {
    return ctx.send(500, 'Sign-in failed. Please try again.')
  }
}
