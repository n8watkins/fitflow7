import type { VercelRequest, VercelResponse } from '@vercel/node'
import { resolveAuth } from '../_lib/tokens.js'
import { ensureSchema, getDb } from '../_lib/db.js'

// POST /api/routines/report — auth required.
//
// Body: { slug }
// Records one abuse report per (routine, user) — re-reporting is idempotent, so
// a single user can't drive the count up. `reports` tracks DISTINCT reporters;
// once it reaches 3 the routine auto-hides (blocked = 1). Reply: { ok: true }.

interface ReportBody {
  slug?: unknown
}

const BLOCK_THRESHOLD = 3

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  const auth = await resolveAuth(req)
  if (!auth) return res.status(401).json({ error: 'not signed in' })
  if (auth.scope === 'read') return res.status(403).json({ error: 'read-only token cannot report' })
  const userId = auth.userId

  const body = (req.body ?? {}) as ReportBody
  const slug = typeof body.slug === 'string' ? body.slug : ''
  if (!slug) return res.status(400).json({ error: 'slug is required' })

  try {
    await ensureSchema()
    const db = getDb()
    // Only accept reports for a routine that actually exists — otherwise a caller
    // could write unbounded orphan rows into routine_reports for arbitrary slugs.
    const exists = await db.execute({
      sql: `SELECT 1 FROM public_routines WHERE slug = ?`,
      args: [slug],
    })
    if (exists.rows.length === 0) return res.status(404).json({ error: 'not found' })
    // One report per user per routine (dedup). Re-reporting is a no-op.
    await db.execute({
      sql: `INSERT OR IGNORE INTO routine_reports (slug, user_id, created_at) VALUES (?, ?, ?)`,
      args: [slug, userId, new Date().toISOString()],
    })
    // Recompute from distinct reporters, then block at the threshold.
    const distinct = Number(
      (
        await db.execute({
          sql: `SELECT COUNT(*) AS n FROM routine_reports WHERE slug = ?`,
          args: [slug],
        })
      ).rows[0]?.n ?? 0,
    )
    await db.execute({
      sql: `UPDATE public_routines
            SET reports = ?, blocked = CASE WHEN ? >= ? THEN 1 ELSE blocked END
            WHERE slug = ?`,
      args: [distinct, distinct, BLOCK_THRESHOLD, slug],
    })
    res.status(200).json({ ok: true })
  } catch {
    res.status(500).json({ error: 'report failed' })
  }
}
