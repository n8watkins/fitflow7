import { resolveAuth } from '../../lib/tokens.ts'
import { ensureSchema, getDb } from '../../lib/db.ts'
import type { ApiContext } from '../../lib/http.ts'
import { allow } from '../../lib/rateLimit.ts'

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

export default async function reportRoutine(ctx: ApiContext): Promise<Response> {
  if (ctx.method !== 'POST') return ctx.json(405, { error: 'method not allowed' })
  const auth = await resolveAuth(ctx)
  if (!auth) return ctx.json(401, { error: 'not signed in' })
  if (auth.scope === 'read') return ctx.json(403, { error: 'read-only token cannot report' })
  const userId = auth.userId
  if (!(await allow(ctx.env, 'write', `report:${userId}`))) {
    return ctx.tooManyRequests()
  }

  const body = (ctx.body ?? {}) as ReportBody
  const slug = typeof body.slug === 'string' ? body.slug : ''
  if (!slug) return ctx.json(400, { error: 'slug is required' })

  try {
    await ensureSchema(ctx.env)
    const db = getDb(ctx.env)
    // Only accept reports for a routine that actually exists — otherwise a caller
    // could write unbounded orphan rows into routine_reports for arbitrary slugs.
    const exists = await db.execute({
      sql: `SELECT 1 FROM public_routines WHERE slug = ?`,
      args: [slug],
    })
    if (exists.rows.length === 0) return ctx.json(404, { error: 'not found' })
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
    return ctx.json(200, { ok: true })
  } catch {
    return ctx.json(500, { error: 'report failed' })
  }
}
