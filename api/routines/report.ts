import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAuthedUserId } from '../_lib/auth.js'
import { ensureSchema, getDb } from '../_lib/db.js'

// POST /api/routines/report — auth required.
//
// Body: { slug }
// Increments the abuse-report count for a published routine. Once a routine
// reaches 3 reports it auto-hides (blocked = 1) and drops out of all public
// listings. Reply: { ok: true }.

interface ReportBody {
  slug?: unknown
}

const BLOCK_THRESHOLD = 3

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  const userId = getAuthedUserId(req)
  if (!userId) return res.status(401).json({ error: 'not signed in' })

  const body = (req.body ?? {}) as ReportBody
  const slug = typeof body.slug === 'string' ? body.slug : ''
  if (!slug) return res.status(400).json({ error: 'slug is required' })

  try {
    await ensureSchema()
    const db = getDb()
    await db.execute({
      sql: `UPDATE public_routines
            SET reports = reports + 1,
                blocked = CASE WHEN reports + 1 >= ? THEN 1 ELSE blocked END
            WHERE slug = ?`,
      args: [BLOCK_THRESHOLD, slug],
    })
    res.status(200).json({ ok: true })
  } catch {
    res.status(500).json({ error: 'report failed' })
  }
}
