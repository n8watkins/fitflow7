import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'node:crypto'
import { resolveAuth } from '../_lib/tokens.js'
import { ensureSchema, getDb } from '../_lib/db.js'

// Exercise ids are short kebab-case slugs (see src/data/exercises.ts). Validate
// the shape server-side so junk / injection-y ids can't be stored or served.
const SLUG_RE = /^[a-z0-9-]{1,64}$/
// Burst guard on top of the per-owner total cap: at most this many publishes/hour.
const MAX_PER_HOUR = 10

// POST /api/routines/publish — auth required.
//
// Publishes an immutable snapshot of a routine to the community library. The
// snapshot is content-only: no email or other PII is ever stored or echoed; the
// optional `ownerName` is a free-text display name supplied by the client.
//
// Body: { routine: { name, description?, exerciseIds[], workSeconds, restSeconds,
//         rounds }, ownerName? }
// Reply: { slug }
//
// Abuse cap: a single owner may publish at most 25 routines.

interface PublishRoutine {
  name?: unknown
  description?: unknown
  exerciseIds?: unknown
  workSeconds?: unknown
  restSeconds?: unknown
  rounds?: unknown
}

interface PublishBody {
  routine?: PublishRoutine
  ownerName?: unknown
}

const MAX_PER_OWNER = 25

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  const auth = await resolveAuth(req)
  if (!auth) return res.status(401).json({ error: 'not signed in' })
  if (auth.scope === 'read') return res.status(403).json({ error: 'read-only token cannot publish' })
  const userId = auth.userId

  const body = (req.body ?? {}) as PublishBody
  const routine = body.routine ?? {}

  const name = typeof routine.name === 'string' ? routine.name.trim() : ''
  if (!name) return res.status(400).json({ error: 'name is required' })

  const description = typeof routine.description === 'string' ? routine.description : null
  const exerciseIds = Array.isArray(routine.exerciseIds)
    ? routine.exerciseIds.filter((id): id is string => typeof id === 'string')
    : []
  // Server-side shape validation: every id must be a valid slug (S1).
  if (exerciseIds.some((id) => !SLUG_RE.test(id))) {
    return res.status(400).json({ error: 'invalid exercise id' })
  }
  const workSeconds = Number(routine.workSeconds)
  const restSeconds = Number(routine.restSeconds)
  const rounds = Number(routine.rounds)
  if (
    exerciseIds.length === 0 ||
    !Number.isFinite(workSeconds) ||
    !Number.isFinite(restSeconds) ||
    !Number.isFinite(rounds)
  ) {
    return res.status(400).json({ error: 'invalid routine' })
  }

  const ownerName = typeof body.ownerName === 'string' ? body.ownerName.trim() || null : null

  // Length caps — keep stored/served payloads bounded (abuse / DoS guard).
  if (
    name.length > 100 ||
    (description !== null && description.length > 1000) ||
    (ownerName !== null && ownerName.length > 60) ||
    exerciseIds.length > 60 ||
    exerciseIds.some((id) => id.length > 64)
  ) {
    return res.status(400).json({ error: 'routine too large' })
  }

  const slug = crypto.randomUUID()
  const createdAt = new Date().toISOString()

  try {
    await ensureSchema()
    const db = getDb()

    // Abuse cap: refuse if this owner is already at the per-owner limit.
    const countRes = await db.execute({
      sql: `SELECT COUNT(*) AS n FROM public_routines WHERE owner_id = ?`,
      args: [userId],
    })
    const count = Number(countRes.rows[0]?.n ?? 0)
    if (count >= MAX_PER_OWNER) {
      return res.status(429).json({ error: 'publish limit reached' })
    }

    // Burst guard: cap publishes in the trailing hour (S1 rate limiting).
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const recentRes = await db.execute({
      sql: `SELECT COUNT(*) AS n FROM public_routines WHERE owner_id = ? AND created_at > ?`,
      args: [userId, hourAgo],
    })
    if (Number(recentRes.rows[0]?.n ?? 0) >= MAX_PER_HOUR) {
      return res.status(429).json({ error: 'too many publishes — try again later' })
    }

    await db.execute({
      sql: `INSERT INTO public_routines
              (slug, owner_id, owner_name, name, description, exercise_ids, work_seconds, rest_seconds, rounds, created_at, reports, blocked)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
      args: [
        slug,
        userId,
        ownerName,
        name,
        description,
        JSON.stringify(exerciseIds),
        Math.round(workSeconds),
        Math.round(restSeconds),
        Math.round(rounds),
        createdAt,
      ],
    })

    res.status(200).json({ slug })
  } catch {
    res.status(500).json({ error: 'publish failed' })
  }
}
