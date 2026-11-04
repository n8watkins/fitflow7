import { createAccessToken, type Scope } from '../lib/auth.ts'
import { getUserId } from '../lib/sessions.ts'
import { ensureSchema, getDb } from '../lib/db.ts'
import type { ApiContext } from '../lib/http.ts'
import { listTokens, recordToken, revokeToken } from '../lib/tokens.ts'
import { allow } from '../lib/rateLimit.ts'

// /api/token — personal access token management. Cookie-authed only: you manage
// tokens from a real signed-in web session, never with a token itself.
//   POST   mint a token  (body: { scope?: 'read'|'readwrite', label? }) -> { token, ... }
//   GET    list your tokens (metadata only, no secrets)
//   DELETE revoke one     (?jti= or body { jti })
// The minted secret is returned once on POST and never stored server-side; only
// the jti + metadata live in the registry (see _lib/tokens).
// Live (unrevoked) tokens one account may hold at once.
const MAX_LIVE_TOKENS = 20

export default async function token(ctx: ApiContext): Promise<Response> {
  const userId = await getUserId(ctx)
  if (!userId) return ctx.json(401, { error: 'not signed in' })

  try {
    await ensureSchema(ctx.env)
    const db = getDb(ctx.env)

    if (ctx.method === 'POST') {
      if (!(await allow(ctx.env, 'write', `token:${userId}`))) {
        return ctx.tooManyRequests()
      }
      const live = Number(
        (await db.execute({
          sql: `SELECT COUNT(*) AS n FROM access_tokens WHERE user_id = ? AND revoked_at IS NULL`,
          args: [userId],
        })).rows[0]?.n ?? 0,
      )
      if (live >= MAX_LIVE_TOKENS) return ctx.json(429, { error: 'token limit reached: revoke one first' })
      const body = (ctx.body ?? {}) as { scope?: unknown; label?: unknown }
      const scope: Scope = body.scope === 'read' ? 'read' : 'readwrite'
      const label = typeof body.label === 'string' ? body.label.trim().slice(0, 60) || null : null
      const { token, jti } = createAccessToken(ctx.env, userId, scope)
      await recordToken(db, { jti, userId, label, scope, createdAt: new Date().toISOString() })
      return ctx.json(200, { token, jti, scope, label })
    }

    if (ctx.method === 'GET') {
      return ctx.json(200, { tokens: await listTokens(db, userId) })
    }

    if (ctx.method === 'DELETE') {
      const jti = ctx.query('jti') ?? (ctx.body as { jti?: unknown } | undefined)?.jti
      if (typeof jti !== 'string' || !jti) return ctx.json(400, { error: 'jti is required' })
      await revokeToken(db, userId, jti)
      return ctx.json(200, { ok: true })
    }

    return ctx.json(405, { error: 'method not allowed' })
  } catch {
    return ctx.json(500, { error: 'token operation failed' })
  }
}
