// The four-week starter plan, levels and easier/harder moves. Pure functions
// over the training profile and the session history, so the plan has no state
// of its own beyond when it started: progress is counted from finished workouts.

import type { Exercise, Goal, Level, TrainingProfile, VariationTier, WorkoutSession } from '../types'

/** Finished workouts it takes to move up a week. */
export const WORKOUTS_PER_STAGE = 3

/** Week 1 easier moves, week 2 standard, week 3 a second round, week 4 harder. */
export const PLAN_STAGES: { tierOffset: -1 | 0 | 1; rounds: number }[] = [
  { tierOffset: -1, rounds: 1 },
  { tierOffset: 0, rounds: 1 },
  { tierOffset: 0, rounds: 2 },
  { tierOffset: 1, rounds: 2 },
]

const TIERS: VariationTier[] = ['easier', 'standard', 'harder']
const LEVEL_OFFSET: Record<Level, number> = { beginner: -1, intermediate: 0, advanced: 1 }
const LEVEL_TIMING: Record<Level, { workSeconds: number; restSeconds: number }> = {
  beginner: { workSeconds: 20, restSeconds: 15 },
  intermediate: { workSeconds: 30, restSeconds: 10 },
  advanced: { workSeconds: 40, restSeconds: 10 },
}
const STRENGTH_ROTATION = ['classic-7', 'arm-workout', 'leg-workout']

export function timingFor(level: Level): { workSeconds: number; restSeconds: number } {
  return LEVEL_TIMING[level]
}

/** The move difficulty for a level in a plan week (1-4). */
export function tierFor(level: Level, stage: number): VariationTier {
  const spec = PLAN_STAGES[Math.min(Math.max(stage, 1), PLAN_STAGES.length) - 1]
  const index = Math.min(Math.max(1 + LEVEL_OFFSET[level] + spec.tierOffset, 0), TIERS.length - 1)
  return TIERS[index]
}

export interface PlanProgress {
  /** Plan week, 1-4. */
  stage: number
  /** Finished workouts in this week (0-2, or 3 once the plan is complete). */
  doneInStage: number
  totalDone: number
  complete: boolean
}

/** Counts full, not deleted workouts since the plan began. */
export function planProgress(sessions: WorkoutSession[], planStartedAt: string): PlanProgress {
  const since = Date.parse(planStartedAt)
  const totalDone = sessions.filter(
    (s) => s.completed && !s.deletedAt && s.exercisesCompleted >= s.totalExercises && Date.parse(s.startedAt) >= since,
  ).length
  const last = PLAN_STAGES.length * WORKOUTS_PER_STAGE
  if (totalDone >= last) return { stage: PLAN_STAGES.length, doneInStage: WORKOUTS_PER_STAGE, totalDone, complete: true }
  return {
    stage: Math.floor(totalDone / WORKOUTS_PER_STAGE) + 1,
    doneInStage: totalDone % WORKOUTS_PER_STAGE,
    totalDone,
    complete: false,
  }
}

export interface PlanWorkout extends PlanProgress {
  routineId: string
  rounds: number
  tier: VariationTier
  workSeconds: number
  restSeconds: number
}

/** Today's plan workout, or null when no plan is running. */
export function planWorkout(profile: TrainingProfile, sessions: WorkoutSession[]): PlanWorkout | null {
  if (!profile.planStartedAt || !profile.level) return null
  const progress = planProgress(sessions, profile.planStartedAt)
  const goal: Goal = profile.goal ?? 'habit'
  const timing = timingFor(profile.level)
  return {
    ...progress,
    routineId: goal === 'strength' ? STRENGTH_ROTATION[progress.totalDone % STRENGTH_ROTATION.length] : 'classic-7',
    rounds: PLAN_STAGES[progress.stage - 1].rounds,
    tier: tierFor(profile.level, progress.stage),
    workSeconds: timing.workSeconds,
    restSeconds: goal === 'cardio' ? Math.max(5, timing.restSeconds - 5) : timing.restSeconds,
  }
}

/** The easier or harder version of a move, or the move itself when it has none. */
export function resolveVariation(exercise: Exercise, tier: VariationTier, map: Record<string, Exercise>): Exercise {
  const id = tier === 'easier' ? exercise.easierVariationId : tier === 'harder' ? exercise.harderVariationId : undefined
  return (id && map[id]) || exercise
}

/** Labels for a level, used in onboarding and settings. */
export const LEVEL_LABEL: Record<Level, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' }
export const GOAL_LABEL: Record<Goal, string> = { habit: 'Build a habit', strength: 'Get stronger', cardio: 'Move more, burn more' }
export const TIER_LABEL: Record<VariationTier, string> = { easier: 'Easier', standard: 'Standard', harder: 'Harder' }

/** One level up, for "start again" when a plan is complete. */
export function nextLevel(level: Level): Level {
  return level === 'beginner' ? 'intermediate' : 'advanced'
}
