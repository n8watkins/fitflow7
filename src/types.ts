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
  easierVariationId?: string
  harderVariationId?: string
  commonMistake?: string
  /** MVP visual placeholder: an emoji rendered large in the player/cards. */
  icon: string
  /** Optional bundled movement photo (public/exercises/<slug>.jpg); `icon` is the fallback. */
  imageUrl?: string
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

export type UserSettings = {
  defaultWorkSeconds: number
  defaultRestSeconds: number
  defaultRounds: number
  /** Prepare-phase countdown before the first exercise. */
  countdownSeconds: number
  audioCuesEnabled: boolean
}

export const DEFAULT_SETTINGS: UserSettings = {
  defaultWorkSeconds: 30,
  defaultRestSeconds: 10,
  defaultRounds: 1,
  countdownSeconds: 5,
  audioCuesEnabled: true,
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
