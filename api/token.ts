import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createAccessToken, getUserId, type Scope } from './_lib/auth.js'
import { ensureSchema, getDb } from './_lib/db.js'
import { listTokens, recordToken, revokeToken } from './_lib/tokens.js'

// /api/token — personal access token management. Cookie-authed only: you manage
// tokens from a real signed-in web session, never with a token itself.
//   POST   mint a token  (body: { scope?: 'read'|'readwrite', label? }) -> { token, ... }
//   GET    list your tokens (metadata only, no secrets)
//   DELETE revoke one     (?jti= or body { jti })
// The minted secret is returned once on POST and never stored server-side; only
// the jti + metadata live in the registry (see _lib/tokens).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = getUserId(req)
  if (!userId) return res.status(401).json({ error: 'not signed in' })

  try {
    await ensureSchema()
    const db = getDb()

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as { scope?: unknown; label?: unknown }
      const scope: Scope = body.scope === 'read' ? 'read' : 'readwrite'
      const label = typeof body.label === 'string' ? body.label.trim().slice(0, 60) || null : null
      const { token, jti } = createAccessToken(userId, scope)
      await recordToken(db, { jti, userId, label, scope, createdAt: new Date().toISOString() })
      return res.status(200).json({ token, jti, scope, label })
    }

    if (req.method === 'GET') {
      return res.status(200).json({ tokens: await listTokens(db, userId) })
    }

    if (req.method === 'DELETE') {
      const raw = req.query.jti ?? (req.body as { jti?: unknown } | undefined)?.jti
      const jti = Array.isArray(raw) ? raw[0] : raw
      if (typeof jti !== 'string' || !jti) return res.status(400).json({ error: 'jti is required' })
      await revokeToken(db, userId, jti)
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'method not allowed' })
  } catch {
    return res.status(500).json({ error: 'token operation failed' })
  }
}
