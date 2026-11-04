import type {
  BodyProfile,
  ChallengeProgress,
  TrainingProfile,
  VariationTier,
  Routine,
  UserSettings,
  WeightEntry,
  WorkoutSession,
} from '../../src/types'
import { resolveAuth } from '../lib/tokens.ts'
import { ensureSchema, getDb } from '../lib/db.ts'
import type { ApiContext } from '../lib/http.ts'
import type { InStatement } from '@libsql/client'
import { errorSummary, logError } from '../lib/log.ts'
import {
  MAX_SYNC_BODY_BYTES,
  MAX_SYNC_RECORDS,
  checkBodyProfile,
  checkTrainingProfile,
  checkSkipDay,
  type SkipDayRecord,
  checkChallenge,
  checkRoutine,
  checkSession,
  checkSettings,
  checkWeight,
  rejectedId,
  type Collection,
  type Rejected,
  type SettingsPush,
} from '../lib/validate.ts'

// POST /api/sync — authenticated bidirectional sync.
//
// Body:  { since?, routines?, sessions?, settings?, weightLog?, bodyProfile?, challengeProgress? }
//   since     ISO cursor; server returns records with updated_at > since.
//   the rest  dirty local records to push. Upserts are last-write-wins by
//             updated_at and scoped to the authenticated user (a client cannot
//             overwrite another user's row). A read-scoped token may only pull.
//
// Reply: { serverTime, routines, sessions, settings, weightLog, challengeProgress, bodyProfile }
//   serverTime  the new cursor to send as `since` next time.
//   collections  server records changed since `since` (tombstones included so
//   deletes propagate). settings/bodyProfile are the row if newer, else null.

/** A push after validation: only records that passed their checks. */
interface ValidPush {
  since: string
  routines: Routine[]
  sessions: WorkoutSession[]
  settings: SettingsPush | null
  weightLog: WeightEntry[]
  skipDays: SkipDayRecord[]
  bodyProfile: BodyProfile | null
  trainingProfile: TrainingProfile | null
  challengeProgress: ChallengeProgress[]
  rejected: Rejected[]
}

const LIST_FIELDS = ['routines', 'sessions', 'weightLog', 'challengeProgress', 'skipDays'] as const
const ROUTE = '/api/sync'

/** Checks a push's shape and size, and each record on its own. Returns the
 *  reason when the request as a whole must be refused. */
function parsePush(raw: unknown): { status: 400 | 413; error: string } | ValidPush {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { status: 400, error: 'sync body must be an object' }
  const b = raw as Record<string, unknown>
  if (b.since !== undefined && b.since !== null && (typeof b.since !== 'string' || Number.isNaN(Date.parse(b.since)))) {
    return { status: 400, error: 'since must be a date' }
  }
  let total = 0
  for (const f of LIST_FIELDS) {
    if (b[f] === undefined || b[f] === null) continue
    if (!Array.isArray(b[f])) return { status: 400, error: `${f} must be a list` }
    total += (b[f] as unknown[]).length
  }
  for (const f of ['settings', 'bodyProfile', 'trainingProfile'] as const) {
    if (b[f] === undefined || b[f] === null) continue
    if (typeof b[f] !== 'object' || Array.isArray(b[f])) return { status: 400, error: `${f} must be an object` }
    total += 1
  }
  if (total > MAX_SYNC_RECORDS) return { status: 413, error: `too many records in one sync (max ${MAX_SYNC_RECORDS})` }

  const rejected: Rejected[] = []
  function each<T>(collection: Collection, list: unknown, check: (v: unknown) => { ok: true; value: T } | { ok: false; reason: string }, idKey: string): T[] {
    const out: T[] = []
    for (const item of (list as unknown[] | undefined) ?? []) {
      const r = check(item)
      if (r.ok) out.push(r.value)
      else rejected.push({ collection, id: rejectedId(item, idKey), reason: r.reason })
    }
    return out
  }
  const one = <T,>(collection: Collection, v: unknown, check: (v: unknown) => { ok: true; value: T } | { ok: false; reason: string }): T | null => {
    if (v === undefined || v === null) return null
    const [value] = each(collection, [v], check, '')
    return value ?? null
  }
  return {
    since: (b.since as string | undefined) || EPOCH,
    routines: each('routines', b.routines, checkRoutine, 'id'),
    sessions: each('sessions', b.sessions, checkSession, 'id'),
    weightLog: each('weightLog', b.weightLog, checkWeight, 'id'),
    skipDays: each('skipDays', b.skipDays, checkSkipDay, 'date'),
    challengeProgress: each('challengeProgress', b.challengeProgress, checkChallenge, 'challengeId'),
    settings: one('settings', b.settings, checkSettings),
    bodyProfile: one('bodyProfile', b.bodyProfile, checkBodyProfile),
    trainingProfile: one('trainingProfile', b.trainingProfile, checkTrainingProfile),
    rejected,
  }
}

const EPOCH = '1970-01-01T00:00:00.000Z'

// A client clock more than this far ahead of the server is treated as broken: its
// updated_at is clamped to the server's now before storage, so a bogus far-future
// timestamp can't permanently win LWW and freeze the row from edits/deletes on
// every device (H2). Normal data (past, or minutes/hours ahead) is untouched.
const FUTURE_GRACE_MS = 24 * 60 * 60 * 1000

/** The client `updated_at` to store for LWW, clamped against a runaway client
 *  clock. Falls back to the server clock when missing/unparseable. */
function clampStamp(clientTs: string | undefined, serverNow: string): string {
  if (!clientTs) return serverNow
  const t = Date.parse(clientTs)
  if (Number.isNaN(t)) return serverNow
  if (t > Date.parse(serverNow) + FUTURE_GRACE_MS) return serverNow
  return clientTs
}

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

function routineUpsert(userId: string, r: Routine, serverNow: string): InStatement {
  return {
    sql: `INSERT INTO routines
            (id, user_id, name, description, exercise_ids, work_seconds, rest_seconds, rounds, created_at, updated_at, server_updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name, description = excluded.description,
            exercise_ids = excluded.exercise_ids, work_seconds = excluded.work_seconds,
            rest_seconds = excluded.rest_seconds, rounds = excluded.rounds,
            updated_at = excluded.updated_at, server_updated_at = excluded.server_updated_at,
            deleted_at = excluded.deleted_at
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
      clampStamp(r.updatedAt, serverNow),
      serverNow,
      r.deletedAt ?? null,
    ],
  }
}

function sessionUpsert(userId: string, s: WorkoutSession, serverNow: string): InStatement {
  return {
    sql: `INSERT INTO sessions
            (id, user_id, routine_id, routine_name, started_at, completed_at, duration_seconds, completed, exercises_completed, total_exercises, updated_at, server_updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            routine_name = excluded.routine_name, completed_at = excluded.completed_at,
            duration_seconds = excluded.duration_seconds, completed = excluded.completed,
            exercises_completed = excluded.exercises_completed, total_exercises = excluded.total_exercises,
            updated_at = excluded.updated_at, server_updated_at = excluded.server_updated_at,
            deleted_at = excluded.deleted_at
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
      clampStamp(s.updatedAt, serverNow),
      serverNow,
      s.deletedAt ?? null,
    ],
  }
}

// --- Body stats (B1) ---------------------------------------------------------

function rowToWeight(r: Record<string, unknown>): WeightEntry {
  return {
    id: r.id as string,
    date: r.date as string,
    weightKg: Number(r.weight_kg),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    deletedAt: (r.deleted_at as string) ?? undefined,
  }
}

function weightUpsert(userId: string, e: WeightEntry, serverNow: string): InStatement {
  return {
    sql: `INSERT INTO weight_log (id, user_id, date, weight_kg, created_at, updated_at, server_updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            date = excluded.date, weight_kg = excluded.weight_kg,
            updated_at = excluded.updated_at, server_updated_at = excluded.server_updated_at,
            deleted_at = excluded.deleted_at
          WHERE excluded.updated_at > weight_log.updated_at AND weight_log.user_id = excluded.user_id`,
    args: [
      e.id,
      userId,
      e.date,
      e.weightKg,
      e.createdAt,
      clampStamp(e.updatedAt, serverNow),
      serverNow,
      e.deletedAt ?? null,
    ],
  }
}

function parseVariations(raw: unknown): Record<string, VariationTier> {
  try {
    return JSON.parse((raw as string) || '{}') as Record<string, VariationTier>
  } catch {
    return {}
  }
}

function parseDayMap(raw: unknown): Record<number, string> {
  try {
    return JSON.parse((raw as string) || '{}') as Record<number, string>
  } catch {
    return {}
  }
}

function rowToChallenge(r: Record<string, unknown>): ChallengeProgress {
  return {
    challengeId: r.challenge_id as string,
    completedDays: parseDayMap(r.completed_days),
    clearedDays: parseDayMap(r.cleared_days),
    startedAt: r.started_at as string,
    updatedAt: r.updated_at as string,
    deletedAt: (r.deleted_at as string) ?? undefined,
  }
}

function challengeUpsert(userId: string, c: ChallengeProgress, serverNow: string): InStatement {
  return {
    sql: `INSERT INTO challenge_progress (user_id, challenge_id, completed_days, cleared_days, started_at, updated_at, server_updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, challenge_id) DO UPDATE SET
            completed_days = excluded.completed_days, cleared_days = excluded.cleared_days,
            started_at = excluded.started_at,
            updated_at = excluded.updated_at, server_updated_at = excluded.server_updated_at,
            deleted_at = excluded.deleted_at
          WHERE excluded.updated_at > challenge_progress.updated_at`,
    args: [
      userId,
      c.challengeId,
      JSON.stringify(c.completedDays ?? {}),
      JSON.stringify(c.clearedDays ?? {}),
      c.startedAt,
      clampStamp(c.updatedAt, serverNow),
      serverNow,
      c.deletedAt ?? null,
    ],
  }
}

export default async function sync(ctx: ApiContext): Promise<Response> {
  if (ctx.method !== 'POST') return ctx.json(405, { error: 'method not allowed' })
  const auth = await resolveAuth(ctx)
  if (!auth) return ctx.json(401, { error: 'not signed in' })
  const userId = auth.userId

  if (ctx.bodyLength > MAX_SYNC_BODY_BYTES) return ctx.json(413, { error: 'sync request too large (max 1 MB)' })
  const parsed = parsePush(ctx.body ?? {})
  if ('error' in parsed) return ctx.json(parsed.status, { error: parsed.error })
  const body = parsed
  const since = body.since

  // A read-scoped token may pull but never push (S1).
  const wantsWrite =
    body.routines.length > 0 ||
    body.sessions.length > 0 ||
    !!body.settings ||
    body.weightLog.length > 0 ||
    body.skipDays.length > 0 ||
    !!body.bodyProfile ||
    !!body.trainingProfile ||
    body.challengeProgress.length > 0 ||
    body.rejected.length > 0
  if (auth.scope === 'read' && wantsWrite) {
    return ctx.json(403, { error: 'read-only token cannot push' })
  }

  try {
    await ensureSchema(ctx.env)
    const db = getDb(ctx.env)
    // One server-clock stamp per request — used both as every row's
    // server_updated_at and as the returned cursor, so the watermark is entirely
    // server-authoritative and immune to client clock skew (H2).
    const serverTime = new Date().toISOString()

    // --- Push (one write transaction). System routines never sync. ---
    const writes: InStatement[] = []
    for (const r of body.routines) {
      if (!r.isSystem) writes.push(routineUpsert(userId, r, serverTime))
    }
    for (const s of body.sessions) {
      writes.push(sessionUpsert(userId, s, serverTime))
    }
    if (body.settings) {
      const s = body.settings.value
      writes.push({
        sql: `INSERT INTO settings
                (user_id, default_work_seconds, default_rest_seconds, default_rounds, countdown_seconds, audio_cues_enabled, exercise_images, updated_at, server_updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET
                default_work_seconds = excluded.default_work_seconds,
                default_rest_seconds = excluded.default_rest_seconds,
                default_rounds = excluded.default_rounds,
                countdown_seconds = excluded.countdown_seconds,
                audio_cues_enabled = excluded.audio_cues_enabled,
                exercise_images = COALESCE(excluded.exercise_images, settings.exercise_images),
                updated_at = excluded.updated_at, server_updated_at = excluded.server_updated_at
              WHERE excluded.updated_at > settings.updated_at`,
        args: [
          userId,
          s.defaultWorkSeconds,
          s.defaultRestSeconds,
          s.defaultRounds,
          s.countdownSeconds,
          s.audioCuesEnabled ? 1 : 0,
          s.exerciseImages ?? null,
          clampStamp(body.settings.updatedAt, serverTime),
          serverTime,
        ],
      })
    }
    for (const e of body.weightLog) writes.push(weightUpsert(userId, e, serverTime))
    for (const d of body.skipDays) {
      writes.push({
        sql: `INSERT INTO skip_days (user_id, date, created_at, updated_at, server_updated_at, deleted_at)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(user_id, date) DO UPDATE SET
                updated_at = excluded.updated_at, server_updated_at = excluded.server_updated_at,
                deleted_at = excluded.deleted_at
              WHERE excluded.updated_at > skip_days.updated_at`,
        args: [userId, d.date, d.createdAt, clampStamp(d.updatedAt, serverTime), serverTime, d.deletedAt ?? null],
      })
    }
    for (const c of body.challengeProgress) writes.push(challengeUpsert(userId, c, serverTime))
    if (body.bodyProfile) {
      const bp = body.bodyProfile
      writes.push({
        sql: `INSERT INTO body_profile (user_id, height_cm, goal_weight_kg, updated_at, server_updated_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET
                height_cm = excluded.height_cm, goal_weight_kg = excluded.goal_weight_kg,
                updated_at = excluded.updated_at, server_updated_at = excluded.server_updated_at
              WHERE excluded.updated_at > body_profile.updated_at`,
        args: [userId, bp.heightCm ?? null, bp.goalWeightKg ?? null, clampStamp(bp.updatedAt, serverTime), serverTime],
      })
    }
    if (body.trainingProfile) {
      const tp = body.trainingProfile
      writes.push({
        sql: `INSERT INTO training_profile (user_id, goal, level, plan_started_at, onboarding_done, variations, updated_at, server_updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET
                goal = excluded.goal, level = excluded.level, plan_started_at = excluded.plan_started_at,
                onboarding_done = excluded.onboarding_done, variations = excluded.variations,
                updated_at = excluded.updated_at, server_updated_at = excluded.server_updated_at
              WHERE excluded.updated_at > training_profile.updated_at`,
        args: [
          userId, tp.goal ?? null, tp.level ?? null, tp.planStartedAt ?? null, tp.onboardingDone ? 1 : 0,
          JSON.stringify(tp.variations ?? {}), clampStamp(tp.updatedAt, serverTime), serverTime,
        ],
      })
    }
    if (writes.length > 0) await db.batch(writes, 'write')

    // --- Pull everything changed since the cursor (tombstones included). The
    // filter is on server_updated_at (server clock), never the client updated_at,
    // so a behind-clock device's writes can't sort before another device's cursor
    // and be silently skipped forever (H2). ---
    const [routinesRes, sessionsRes, settingsRes, weightRes, challengeRes, bodyRes, trainingRes, skipRes] = await Promise.all([
      db.execute({
        sql: `SELECT * FROM routines WHERE user_id = ? AND server_updated_at > ?`,
        args: [userId, since],
      }),
      db.execute({
        sql: `SELECT * FROM sessions WHERE user_id = ? AND server_updated_at > ?`,
        args: [userId, since],
      }),
      db.execute({
        sql: `SELECT * FROM settings WHERE user_id = ? AND server_updated_at > ?`,
        args: [userId, since],
      }),
      db.execute({
        sql: `SELECT * FROM weight_log WHERE user_id = ? AND server_updated_at > ?`,
        args: [userId, since],
      }),
      db.execute({
        sql: `SELECT * FROM challenge_progress WHERE user_id = ? AND server_updated_at > ?`,
        args: [userId, since],
      }),
      db.execute({
        sql: `SELECT * FROM body_profile WHERE user_id = ? AND server_updated_at > ?`,
        args: [userId, since],
      }),
      db.execute({
        sql: `SELECT * FROM training_profile WHERE user_id = ? AND server_updated_at > ?`,
        args: [userId, since],
      }),
      db.execute({
        sql: `SELECT * FROM skip_days WHERE user_id = ? AND server_updated_at > ?`,
        args: [userId, since],
      }),
    ])

    const settingsRow = settingsRes.rows[0]
    const settings: { value: Omit<UserSettings, 'exerciseImages'> & Partial<UserSettings>; updatedAt: string } | null = settingsRow
      ? {
          value: {
            defaultWorkSeconds: Number(settingsRow.default_work_seconds),
            defaultRestSeconds: Number(settingsRow.default_rest_seconds),
            defaultRounds: Number(settingsRow.default_rounds),
            countdownSeconds: Number(settingsRow.countdown_seconds),
            audioCuesEnabled: Boolean(settingsRow.audio_cues_enabled),
            // Absent until a client has saved it; the client then keeps its own.
            ...(settingsRow.exercise_images === 'illustrations' || settingsRow.exercise_images === 'photos'
              ? { exerciseImages: settingsRow.exercise_images }
              : {}),
            // unitSystem is a device-local preference (no server column). The
            // client's applyRemoteSettings preserves the local value, so this
            // default is never actually applied — it only satisfies the type.
            unitSystem: 'imperial',
          },
          updatedAt: settingsRow.updated_at as string,
        }
      : null

    const bodyRow = bodyRes.rows[0]
    const bodyProfile: BodyProfile | null = bodyRow
      ? {
          heightCm: bodyRow.height_cm != null ? Number(bodyRow.height_cm) : undefined,
          goalWeightKg: bodyRow.goal_weight_kg != null ? Number(bodyRow.goal_weight_kg) : undefined,
          updatedAt: bodyRow.updated_at as string,
        }
      : null

    const trainingRow = trainingRes.rows[0]
    const trainingProfile: TrainingProfile | null = trainingRow
      ? {
          ...(trainingRow.goal ? { goal: trainingRow.goal as TrainingProfile['goal'] } : {}),
          ...(trainingRow.level ? { level: trainingRow.level as TrainingProfile['level'] } : {}),
          ...(trainingRow.plan_started_at ? { planStartedAt: trainingRow.plan_started_at as string } : {}),
          onboardingDone: Boolean(trainingRow.onboarding_done),
          variations: parseVariations(trainingRow.variations),
          updatedAt: trainingRow.updated_at as string,
        }
      : null

    return ctx.json(200, {
      serverTime,
      routines: routinesRes.rows.map((r) => rowToRoutine(r as Record<string, unknown>)),
      sessions: sessionsRes.rows.map((r) => rowToSession(r as Record<string, unknown>)),
      settings,
      weightLog: weightRes.rows.map((r) => rowToWeight(r as Record<string, unknown>)),
      skipDays: skipRes.rows.map((r) => ({
        id: r.date as string,
        date: r.date as string,
        createdAt: r.created_at as string,
        updatedAt: r.updated_at as string,
        ...(r.deleted_at ? { deletedAt: r.deleted_at as string } : {}),
      })),
      challengeProgress: challengeRes.rows.map((r) => rowToChallenge(r as Record<string, unknown>)),
      bodyProfile,
      trainingProfile,
      rejected: body.rejected,
    })
  } catch (err) {
    logError({ event: 'sync_failed', reason: 'unhandled', route: ROUTE, status: 500, error: errorSummary(err) })
    return ctx.json(500, { error: 'sync failed' })
  }
}
