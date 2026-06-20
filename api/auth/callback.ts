import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'node:crypto'
import {
  PROVIDERS,
  clearOAuthState,
  getRedirectUri,
  readOAuthState,
  sanitizeReturnTo,
  setSession,
} from '../_lib/auth.js'
import { ensureSchema, getDb } from '../_lib/db.js'

// GET /api/auth/callback?code=...&state=...
// Verifies state, exchanges the code for an access token, fetches the profile,
// upserts the user, issues a session cookie, and bounces back into the app.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = Array.isArray(req.query.code) ? req.query.code[0] : req.query.code
  const state = Array.isArray(req.query.state) ? req.query.state[0] : req.query.state

  const saved = readOAuthState(req)
  clearOAuthState(res)
  if (!saved || !state || saved.state !== state || !code) {
    return res.status(400).send('OAuth state mismatch — please try signing in again.')
  }

  const config = PROVIDERS[saved.provider]
  if (!config.clientId || !config.clientSecret) {
    return res.status(501).send('Provider not configured.')
  }

  try {
    // Exchange code -> access token.
    const tokenRes = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: getRedirectUri(req),
        grant_type: 'authorization_code',
      }).toString(),
    })
    const tokenJson = (await tokenRes.json()) as { access_token?: string }
    if (!tokenJson.access_token) {
      return res.status(502).send('Failed to obtain access token.')
    }

    const profile = await config.fetchProfile(tokenJson.access_token)

    // Upsert the user; keep the existing id on conflict.
    await ensureSchema()
    const db = getDb()
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
    const userId = result.rows[0]?.id as string

    setSession(res, userId)
    res.redirect(302, sanitizeReturnTo(saved.returnTo))
  } catch {
    res.status(500).send('Sign-in failed. Please try again.')
  }
}
