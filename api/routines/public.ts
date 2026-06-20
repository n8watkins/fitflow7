import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ensureSchema, getDb } from '../_lib/db.js'

// GET /api/routines/public — public, no auth.
//
//   ?slug=<id>  returns { routine } for one non-blocked row (404 if missing).
//   (no query)  returns { routines: [...] } — up to 50 most-recent non-blocked rows.
//
// Rows are mapped to a SAFE shape only: owner_id and any other PII are never
// included. If the DB is unconfigured getDb() throws and we surface a 500, which
// the client treats as "community unavailable".

interface SafeRoutine {
  slug: string
  name: string
  description?: string
  exerciseIds: string[]
  workSeconds: number
  restSeconds: number
  rounds: number
  ownerName?: string
  createdAt: string
}

function rowToSafe(r: Record<string, unknown>): SafeRoutine {
  return {
    slug: r.slug as string,
    name: r.name as string,
    description: (r.description as string) ?? undefined,
    exerciseIds: JSON.parse((r.exercise_ids as string) || '[]') as string[],
    workSeconds: Number(r.work_seconds),
    restSeconds: Number(r.rest_seconds),
    rounds: Number(r.rounds),
    ownerName: (r.owner_name as string) ?? undefined,
    createdAt: r.created_at as string,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' })

  const rawSlug = req.query.slug
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug

  try {
    await ensureSchema()
    const db = getDb()

    if (slug) {
      const result = await db.execute({
        sql: `SELECT * FROM public_routines WHERE slug = ? AND blocked = 0`,
        args: [slug],
      })
      const row = result.rows[0]
      if (!row) return res.status(404).json({ error: 'not found' })
      return res.status(200).json({ routine: rowToSafe(row as Record<string, unknown>) })
    }

    const result = await db.execute(
      `SELECT * FROM public_routines WHERE blocked = 0 ORDER BY created_at DESC LIMIT 50`,
    )
    res.status(200).json({
      routines: result.rows.map((r) => rowToSafe(r as Record<string, unknown>)),
    })
  } catch {
    res.status(500).json({ error: 'unavailable' })
  }
}
