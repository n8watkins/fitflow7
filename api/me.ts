import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getConfiguredProviders, getUserId } from './_lib/auth.js'
import { ensureSchema, getDb } from './_lib/db.js'

// GET /api/me — returns the signed-in user (or { user: null }) plus the list of
// configured OAuth providers, so the client only renders sign-in buttons that work.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const providers = getConfiguredProviders()
  const userId = getUserId(req)
  if (!userId) return res.status(200).json({ user: null, providers })

  try {
    await ensureSchema()
    const db = getDb()
    const result = await db.execute({
      sql: `SELECT id, email, name, avatar_url FROM users WHERE id = ?`,
      args: [userId],
    })
    const row = result.rows[0]
    if (!row) return res.status(200).json({ user: null, providers })
    res.status(200).json({
      user: { id: row.id, email: row.email, name: row.name, avatarUrl: row.avatar_url },
      providers,
    })
  } catch {
    res.status(500).json({ error: 'lookup failed' })
  }
}
