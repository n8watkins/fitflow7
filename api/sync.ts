import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { Routine, UserSettings, WorkoutSession } from '../src/types'
import { getAuthedUserId } from './_lib/auth.js'
import { ensureSchema, getDb } from './_lib/db.js'
import type { InStatement } from '@libsql/client'

// POST /api/sync — authenticated bidirectional sync.
//
// Body:  { since?, routines?, sessions?, settings? }
//   since     ISO cursor; server returns records with updated_at > since.
//   routines/ dirty local records to push. Upserts are last-write-wins by
//   sessions  updated_at and scoped to the authenticated user (a client cannot
//   settings  overwrite another user's row).
//
// Reply: { serverTime, routines, sessions, settings }
//   serverTime  the new cursor to send as `since` next time.
//   routines/sessions  server records changed since `since` (tombstones included
//   so deletes propagate). settings is the server row if newer, else omitted.

interface SyncBody {
  since?: string
  routines?: Routine[]
  sessions?: WorkoutSession[]
  settings?: { value: UserSettings; updatedAt: string } | null
}

const EPOCH = '1970-01-01T00:00:00.000Z'

function rowToRoutine(r: Record<string, unknown>): Routine {
  return {
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string) ?? undefined,
    exerciseIds: JSON.parse((r.exercise_ids as string) || '[]') as string[],
    workSeconds: Number(r.work_seconds),
    restSeconds: Number(r.rest_seconds),
    rounds: Number(r.rounds),
    isSystem: false,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    deletedAt: (r.deleted_at as string) ?? undefined,
  }
}

function rowToSession(r: Record<string, unknown>): WorkoutSession {
  return {
    id: r.id as string,
    routineId: (r.routine_id as string) ?? undefined,
    routineName: r.routine_name as string,
    startedAt: r.started_at as string,
    completedAt: (r.completed_at as string) ?? undefined,
    durationSeconds: Number(r.duration_seconds),
    completed: Boolean(r.completed),
    exercisesCompleted: Number(r.exercises_completed),
    totalExercises: Number(r.total_exercises),
    updatedAt: r.updated_at as string,
    deletedAt: (r.deleted_at as string) ?? undefined,
  }
}

function routineUpsert(userId: string, r: Routine): InStatement {
  return {
    sql: `INSERT INTO routines
            (id, user_id, name, description, exercise_ids, work_seconds, rest_seconds, rounds, created_at, updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name, description = excluded.description,
            exercise_ids = excluded.exercise_ids, work_seconds = excluded.work_seconds,
            rest_seconds = excluded.rest_seconds, rounds = excluded.rounds,
            updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
          WHERE excluded.updated_at > routines.updated_at AND routines.user_id = excluded.user_id`,
    args: [
      r.id,
      userId,
      r.name,
      r.description ?? null,
      JSON.stringify(r.exerciseIds),
      r.workSeconds,
      r.restSeconds,
      r.rounds,
      r.createdAt,
      r.updatedAt ?? new Date().toISOString(),
      r.deletedAt ?? null,
    ],
  }
}

function sessionUpsert(userId: string, s: WorkoutSession): InStatement {
  return {
    sql: `INSERT INTO sessions
            (id, user_id, routine_id, routine_name, started_at, completed_at, duration_seconds, completed, exercises_completed, total_exercises, updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            routine_name = excluded.routine_name, completed_at = excluded.completed_at,
            duration_seconds = excluded.duration_seconds, completed = excluded.completed,
            exercises_completed = excluded.exercises_completed, total_exercises = excluded.total_exercises,
            updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
          WHERE excluded.updated_at > sessions.updated_at AND sessions.user_id = excluded.user_id`,
    args: [
      s.id,
      userId,
      s.routineId ?? null,
      s.routineName,
      s.startedAt,
      s.completedAt ?? null,
      s.durationSeconds,
      s.completed ? 1 : 0,
      s.exercisesCompleted,
      s.totalExercises,
      s.updatedAt ?? new Date().toISOString(),
      s.deletedAt ?? null,
    ],
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  const userId = getAuthedUserId(req)
  if (!userId) return res.status(401).json({ error: 'not signed in' })

  const body = (req.body ?? {}) as SyncBody
  const since = body.since || EPOCH

  try {
    await ensureSchema()
    const db = getDb()

    // --- Push (one write transaction). System routines never sync. ---
    const writes: InStatement[] = []
    for (const r of body.routines ?? []) {
      if (!r.isSystem) writes.push(routineUpsert(userId, r))
    }
    for (const s of body.sessions ?? []) {
      writes.push(sessionUpsert(userId, s))
    }
    if (body.settings) {
      const s = body.settings.value
      writes.push({
        sql: `INSERT INTO settings
                (user_id, default_work_seconds, default_rest_seconds, default_rounds, countdown_seconds, audio_cues_enabled, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET
                default_work_seconds = excluded.default_work_seconds,
                default_rest_seconds = excluded.default_rest_seconds,
                default_rounds = excluded.default_rounds,
                countdown_seconds = excluded.countdown_seconds,
                audio_cues_enabled = excluded.audio_cues_enabled,
                updated_at = excluded.updated_at
              WHERE excluded.updated_at > settings.updated_at`,
        args: [
          userId,
          s.defaultWorkSeconds,
          s.defaultRestSeconds,
          s.defaultRounds,
          s.countdownSeconds,
          s.audioCuesEnabled ? 1 : 0,
          body.settings.updatedAt,
        ],
      })
    }
    if (writes.length > 0) await db.batch(writes, 'write')

    // --- Pull everything changed since the cursor (tombstones included). ---
    const serverTime = new Date().toISOString()
    const [routinesRes, sessionsRes, settingsRes] = await Promise.all([
      db.execute({
        sql: `SELECT * FROM routines WHERE user_id = ? AND updated_at > ?`,
        args: [userId, since],
      }),
      db.execute({
        sql: `SELECT * FROM sessions WHERE user_id = ? AND updated_at > ?`,
        args: [userId, since],
      }),
      db.execute({
        sql: `SELECT * FROM settings WHERE user_id = ? AND updated_at > ?`,
        args: [userId, since],
      }),
    ])

    const settingsRow = settingsRes.rows[0]
    const settings: { value: UserSettings; updatedAt: string } | null = settingsRow
      ? {
          value: {
            defaultWorkSeconds: Number(settingsRow.default_work_seconds),
            defaultRestSeconds: Number(settingsRow.default_rest_seconds),
            defaultRounds: Number(settingsRow.default_rounds),
            countdownSeconds: Number(settingsRow.countdown_seconds),
            audioCuesEnabled: Boolean(settingsRow.audio_cues_enabled),
            // unitSystem is a device-local preference (no server column). The
            // client's applyRemoteSettings preserves the local value, so this
            // default is never actually applied — it only satisfies the type.
            unitSystem: 'imperial',
          },
          updatedAt: settingsRow.updated_at as string,
        }
      : null

    res.status(200).json({
      serverTime,
      routines: routinesRes.rows.map((r) => rowToRoutine(r as Record<string, unknown>)),
      sessions: sessionsRes.rows.map((r) => rowToSession(r as Record<string, unknown>)),
      settings,
    })
  } catch {
    res.status(500).json({ error: 'sync failed' })
  }
}
