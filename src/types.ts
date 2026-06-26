// Shared data contracts for FitFlow 7. All modules code against these types.
// Do not change shapes without updating PLAN.md — multiple agents depend on them.

export type Category =
  | 'cardio'
  | 'core'
  | 'upper_body'
  | 'lower_body'
  | 'mobility'
  | 'stretching'
  | 'full_body'

export type Difficulty = 'beginner' | 'intermediate' | 'advanced'

export type Exercise = {
  id: string
  slug: string
  name: string
  description: string
  instructions: string[]
  category: Category
  primaryMuscles: string[]
  secondaryMuscles: string[]
  equipment: string[]
  difficulty: Difficulty
  impactLevel: 'low' | 'medium' | 'high'
  isWeighted: boolean
  isBodyweight: boolean
  tags: string[]
  /** A concise (≤8-word) one-liner for outlines/cards; falls back to `instructions[0]`. */
  cue?: string
  easierVariationId?: string
  harderVariationId?: string
  commonMistake?: string
  /** MVP visual placeholder: an emoji rendered large in the player/cards. */
  icon: string
  /** Optional bundled movement photo (public/exercises/<slug>.jpg); `icon` is the fallback. */
  imageUrl?: string
  /** Optional second frame (end position); when present the two alternate as an animation. */
  imageUrl2?: string
}

export type Routine = {
  id: string
  name: string
  description?: string
  /** Ordered exercise ids; duplicates allowed. */
  exerciseIds: string[]
  workSeconds: number
  restSeconds: number
  rounds: number
  /** System routines ship with the app and cannot be deleted (but can be duplicated). */
  isSystem: boolean
  createdAt: string
  updatedAt: string
  /** Sync groundwork (Phase 0): soft-delete tombstone. Set => record is deleted. */
  deletedAt?: string
  /** Sync groundwork (Phase 0): true when local changes await push to a server. */
  dirty?: boolean
}

export type WorkoutSession = {
  id: string
  routineId?: string
  routineName: string
  startedAt: string
  completedAt?: string
  durationSeconds: number
  completed: boolean
  exercisesCompleted: number
  totalExercises: number
  /** Sync groundwork (Phase 0): last-write timestamp for LWW reconciliation. */
  updatedAt?: string
  /** Sync groundwork: soft-delete tombstone so deletes propagate across devices. */
  deletedAt?: string
  /** Sync groundwork (Phase 0): true when local changes await push to a server. */
  dirty?: boolean
}

/** Display unit system for body stats. Storage is always canonical (kg/cm). */
export type UnitSystem = 'imperial' | 'metric'

export type UserSettings = {
  defaultWorkSeconds: number
  defaultRestSeconds: number
  defaultRounds: number
  /** Prepare-phase countdown before the first exercise. */
  countdownSeconds: number
  audioCuesEnabled: boolean
  /** Display units for weight/height/BMI. Rides the existing settings sync. */
  unitSystem: UnitSystem
}

export const DEFAULT_SETTINGS: UserSettings = {
  defaultWorkSeconds: 30,
  defaultRestSeconds: 10,
  defaultRounds: 1,
  countdownSeconds: 5,
  audioCuesEnabled: true,
  unitSystem: 'imperial',
}

// ---------------------------------------------------------------------------
// Body stats (weight, height, BMI, goal) — local-first, canonical kg/cm.
// ---------------------------------------------------------------------------

/** Standing body profile: the values that don't change day-to-day. Singleton. */
export type BodyProfile = {
  /** Height in centimeters (canonical; convert for display). */
  heightCm?: number
  /** Target/goal weight in kilograms (canonical). */
  goalWeightKg?: number
  updatedAt: string
  /** Sync groundwork: true when local changes await a future push. */
  dirty?: boolean
}

/** A single dated weight measurement. One entry per local calendar day (upsert). */
export type WeightEntry = {
  id: string
  /** Local calendar day 'YYYY-MM-DD' the measurement is for. */
  date: string
  /** Weight in kilograms (canonical). */
  weightKg: number
  createdAt: string
  /** Sync groundwork: last-write timestamp for future LWW reconciliation. */
  updatedAt?: string
  /** Sync groundwork: soft-delete tombstone. */
  deletedAt?: string
  /** Sync groundwork: true when local changes await a future push. */
  dirty?: boolean
}

// ---------------------------------------------------------------------------
// Challenges — static content (data/challenges.ts) + per-user progress.
// ---------------------------------------------------------------------------

export type ChallengeDay = {
  /** 1-based day number. */
  day: number
  /** Routine to perform that day; omitted on a rest day. */
  routineId?: string
  /** Round multiplier for intensity scaling (defaults to the routine's rounds). */
  rounds?: number
  /** Short label, e.g. "Rest day" or "Abs ×2". */
  label?: string
}

export type Challenge = {
  id: string
  name: string
  description: string
  icon: string
  /** Ordered days; `days.length` is the challenge duration. */
  days: ChallengeDay[]
}

/** Per-user progress through one challenge. */
export type ChallengeProgress = {
  challengeId: string
  /** Day-number (1-based) -> ISO timestamp it was completed. */
  completedDays: Record<number, string>
  startedAt: string
  updatedAt?: string
  /** Soft-delete tombstone (used by resetChallenge). */
  deletedAt?: string
  dirty?: boolean
}

export type WorkoutPhase = 'idle' | 'prepare' | 'work' | 'rest' | 'complete'

export type Stats = {
  totalWorkouts: number
  totalMinutes: number
  currentStreak: number
  longestStreak: number
  workoutsThisWeek: number
  workoutsThisMonth: number
  lastWorkoutDate?: string
}
