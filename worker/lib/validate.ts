import type {
  BodyProfile,
  Goal,
  Level,
  TrainingProfile,
  VariationTier,
  ChallengeProgress,
  Routine,
  UserSettings,
  WeightEntry,
  WorkoutSession,
} from '../../src/types'

// Shape and range checks for what a client pushes to /api/sync. A request that
// is too big or not the right shape is refused as a whole; inside a well-formed
// request each record is checked on its own, and a bad one is skipped and
// reported back instead of stored. The bounds are wider than anything the app
// itself produces, so only broken or hostile data trips them.

export const MAX_SYNC_BODY_BYTES = 1_000_000
export const MAX_SYNC_RECORDS = 500

export type Collection = 'routines' | 'sessions' | 'weightLog' | 'challengeProgress' | 'settings' | 'bodyProfile' | 'trainingProfile' | 'skipDays'

export interface Rejected {
  collection: Collection
  id: string
  reason: string
}

type Check<T> = { ok: true; value: T } | { ok: false; reason: string }

const ID_RE = /^[A-Za-z0-9_.:-]{1,100}$/
const SLUG_RE = /^[a-z0-9-]{1,64}$/
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isDate(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v))
}

/** Throws a reason string for the first field that fails; `record` runs them. */
class Invalid extends Error {}
function fail(reason: string): never {
  throw new Invalid(reason)
}
function num(o: Record<string, unknown>, key: string, min: number, max: number): number {
  const v = o[key]
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(`${key} must be a number from ${min} to ${max}`)
  return v
}
function optNum(o: Record<string, unknown>, key: string, min: number, max: number): number | undefined {
  return o[key] === undefined || o[key] === null ? undefined : num(o, key, min, max)
}
function str(o: Record<string, unknown>, key: string, min: number, max: number): string {
  const v = o[key]
  if (typeof v !== 'string' || v.trim().length < min || v.length > max) fail(`${key} must be text of ${min} to ${max} characters`)
  return v
}
function optStr(o: Record<string, unknown>, key: string, max: number): string | undefined {
  return o[key] === undefined || o[key] === null ? undefined : str(o, key, 0, max)
}
function date(o: Record<string, unknown>, key: string): string {
  if (!isDate(o[key])) fail(`${key} must be a date`)
  return o[key] as string
}
function optDate(o: Record<string, unknown>, key: string): string | undefined {
  return o[key] === undefined || o[key] === null ? undefined : date(o, key)
}
function id(o: Record<string, unknown>, key: string, re = ID_RE): string {
  const v = o[key]
  if (typeof v !== 'string' || !re.test(v)) fail(`${key} is not a valid id`)
  return v
}
function bool(o: Record<string, unknown>, key: string): boolean {
  if (typeof o[key] !== 'boolean') fail(`${key} must be true or false`)
  return o[key] as boolean
}
function dayMap(o: Record<string, unknown>, key: string): Record<number, string> {
  const v = o[key]
  if (v === undefined || v === null) return {}
  if (!isObject(v)) fail(`${key} must be a map of day to date`)
  const entries = Object.entries(v)
  if (entries.length > 400) fail(`${key} has too many days`)
  const out: Record<number, string> = {}
  for (const [day, when] of entries) {
    const n = Number(day)
    if (!Number.isInteger(n) || n < 1 || n > 1000 || !isDate(when)) fail(`${key} must be a map of day to date`)
    out[n] = when
  }
  return out
}

function record<T>(raw: unknown, build: (o: Record<string, unknown>) => T): Check<T> {
  if (!isObject(raw)) return { ok: false, reason: 'not an object' }
  try {
    return { ok: true, value: build(raw) }
  } catch (err) {
    if (err instanceof Invalid) return { ok: false, reason: err.message }
    throw err
  }
}

export const checkRoutine = (raw: unknown): Check<Routine> =>
  record(raw, (o) => {
    const exerciseIds = o.exerciseIds
    if (!Array.isArray(exerciseIds) || exerciseIds.length > 200 || exerciseIds.some((e) => typeof e !== 'string' || !SLUG_RE.test(e))) {
      fail('exerciseIds must be a list of up to 200 exercise ids')
    }
    return {
      id: id(o, 'id'),
      name: str(o, 'name', 1, 200),
      description: optStr(o, 'description', 2000),
      exerciseIds: exerciseIds as string[],
      workSeconds: num(o, 'workSeconds', 1, 3600),
      restSeconds: num(o, 'restSeconds', 0, 3600),
      rounds: num(o, 'rounds', 1, 100),
      isSystem: o.isSystem === true,
      createdAt: date(o, 'createdAt'),
      updatedAt: date(o, 'updatedAt'),
      deletedAt: optDate(o, 'deletedAt'),
    }
  })

export const checkSession = (raw: unknown): Check<WorkoutSession> =>
  record(raw, (o) => ({
    id: id(o, 'id'),
    routineId: optStr(o, 'routineId', 100),
    routineName: str(o, 'routineName', 0, 200),
    startedAt: date(o, 'startedAt'),
    completedAt: optDate(o, 'completedAt'),
    durationSeconds: num(o, 'durationSeconds', 0, 86_400),
    completed: bool(o, 'completed'),
    exercisesCompleted: num(o, 'exercisesCompleted', 0, 10_000),
    totalExercises: num(o, 'totalExercises', 0, 10_000),
    updatedAt: optDate(o, 'updatedAt'),
    deletedAt: optDate(o, 'deletedAt'),
  }))

export const checkWeight = (raw: unknown): Check<WeightEntry> =>
  record(raw, (o) => {
    if (typeof o.date !== 'string' || !DAY_RE.test(o.date) || Number.isNaN(Date.parse(o.date))) fail('date must be YYYY-MM-DD')
    return {
      id: id(o, 'id'),
      date: o.date,
      weightKg: num(o, 'weightKg', 1, 1000),
      createdAt: date(o, 'createdAt'),
      updatedAt: optDate(o, 'updatedAt'),
      deletedAt: optDate(o, 'deletedAt'),
    }
  })

export const checkChallenge = (raw: unknown): Check<ChallengeProgress> =>
  record(raw, (o) => ({
    challengeId: id(o, 'challengeId', SLUG_RE),
    completedDays: dayMap(o, 'completedDays'),
    clearedDays: dayMap(o, 'clearedDays'),
    startedAt: date(o, 'startedAt'),
    updatedAt: optDate(o, 'updatedAt'),
    deletedAt: optDate(o, 'deletedAt'),
  }))

export type SettingsPush = {
  value: Omit<UserSettings, 'unitSystem' | 'exerciseImages'> & { exerciseImages?: UserSettings['exerciseImages'] }
  updatedAt: string
}
const EXERCISE_IMAGES = ['photos', 'illustrations'] as const
export const checkSettings = (raw: unknown): Check<SettingsPush> =>
  record(raw, (o) => {
    if (!isObject(o.value)) fail('value must be an object')
    const v = o.value
    return {
      value: {
        defaultWorkSeconds: num(v, 'defaultWorkSeconds', 1, 3600),
        defaultRestSeconds: num(v, 'defaultRestSeconds', 0, 3600),
        defaultRounds: num(v, 'defaultRounds', 1, 100),
        countdownSeconds: num(v, 'countdownSeconds', 0, 600),
        audioCuesEnabled: bool(v, 'audioCuesEnabled'),
        // Optional: older clients do not send it, and the stored value stays.
        exerciseImages: (() => {
          if (v.exerciseImages === undefined) return undefined
          if (!EXERCISE_IMAGES.includes(v.exerciseImages as never)) fail('exerciseImages must be photos or illustrations')
          return v.exerciseImages as UserSettings['exerciseImages']
        })(),
      },
      updatedAt: date(o, 'updatedAt'),
    }
  })

export const checkBodyProfile = (raw: unknown): Check<BodyProfile> =>
  record(raw, (o) => ({
    heightCm: optNum(o, 'heightCm', 30, 300),
    goalWeightKg: optNum(o, 'goalWeightKg', 1, 1000),
    updatedAt: date(o, 'updatedAt'),
  }))

export interface SkipDayRecord {
  id: string
  date: string
  createdAt: string
  updatedAt?: string
  deletedAt?: string
}

export const checkSkipDay = (raw: unknown): Check<SkipDayRecord> =>
  record(raw, (o) => {
    if (typeof o.date !== 'string' || !DAY_RE.test(o.date) || Number.isNaN(Date.parse(o.date))) fail('date must be YYYY-MM-DD')
    if (o.id !== o.date) fail('id must be the date')
    return { id: o.date, date: o.date, createdAt: date(o, 'createdAt'), updatedAt: optDate(o, 'updatedAt'), deletedAt: optDate(o, 'deletedAt') }
  })

const GOALS = new Set(['habit', 'strength', 'cardio'])
const LEVELS = new Set(['beginner', 'intermediate', 'advanced'])
const TIERS = new Set(['easier', 'standard', 'harder'])

export const checkTrainingProfile = (raw: unknown): Check<TrainingProfile> =>
  record(raw, (o) => {
    if (o.goal !== undefined && o.goal !== null && !GOALS.has(o.goal as string)) fail('goal is not a known goal')
    if (o.level !== undefined && o.level !== null && !LEVELS.has(o.level as string)) fail('level is not a known level')
    if (o.onboardingDone !== undefined && typeof o.onboardingDone !== 'boolean') fail('onboardingDone must be true or false')
    const variations: Record<string, VariationTier> = {}
    if (o.variations !== undefined && o.variations !== null) {
      if (!isObject(o.variations)) fail('variations must be a map of exercise to tier')
      const entries = Object.entries(o.variations)
      if (entries.length > 200) fail('variations has too many moves')
      for (const [id, tier] of entries) {
        if (!SLUG_RE.test(id) || !TIERS.has(tier as string)) fail('variations must be a map of exercise to tier')
        variations[id] = tier as VariationTier
      }
    }
    return {
      goal: (o.goal ?? undefined) as Goal | undefined,
      level: (o.level ?? undefined) as Level | undefined,
      planStartedAt: optDate(o, 'planStartedAt'),
      onboardingDone: o.onboardingDone === true,
      variations,
      updatedAt: date(o, 'updatedAt'),
    }
  })

/** The record's id for a rejection report, or '' when it has none worth echoing. */
export function rejectedId(raw: unknown, key: string): string {
  const v = isObject(raw) ? raw[key] : undefined
  return typeof v === 'string' ? v.slice(0, 100) : ''
}
