import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getUserId } from './_lib/auth'
import { ensureSchema, getDb } from './_lib/db'

// GET /api/me — returns the signed-in user (or { user: null }).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = getUserId(req)
  if (!userId) return res.status(200).json({ user: null })

  try {
    await ensureSchema()
    const db = getDb()
    const result = await db.execute({
      sql: `SELECT id, email, name, avatar_url FROM users WHERE id = ?`,
      args: [userId],
    })
    const row = result.rows[0]
    if (!row) return res.status(200).json({ user: null })
    res.status(200).json({
      user: { id: row.id, email: row.email, name: row.name, avatarUrl: row.avatar_url },
    })
  } catch {
    res.status(500).json({ error: 'lookup failed' })
  }
}
