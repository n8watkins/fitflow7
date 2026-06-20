import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'node:crypto'
import { getAuthedUserId } from '../_lib/auth.js'
import { ensureSchema, getDb } from '../_lib/db.js'

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
  const userId = getAuthedUserId(req)
  if (!userId) return res.status(401).json({ error: 'not signed in' })

  const body = (req.body ?? {}) as PublishBody
  const routine = body.routine ?? {}

  const name = typeof routine.name === 'string' ? routine.name.trim() : ''
  if (!name) return res.status(400).json({ error: 'name is required' })

  const description = typeof routine.description === 'string' ? routine.description : null
  const exerciseIds = Array.isArray(routine.exerciseIds)
    ? routine.exerciseIds.filter((id): id is string => typeof id === 'string')
    : []
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
