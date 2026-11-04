// Achievements: twelve badges derived from your history, so they need no
// storage of their own and come back on any device after sync. A badge has a
// target and a current value; it is earned once current reaches target.

import type { ChallengeProgress, WorkoutSession } from '../types'
import { CHALLENGE_MAP } from '../data/challenges'
import { dayKey, todayKey } from './format'
import { activeDays, challengeStatus, longestRun, type SkipDay } from './skipDays'

export interface BadgeContext {
  sessions: WorkoutSession[]
  challenges: Pick<ChallengeProgress, 'challengeId' | 'startedAt' | 'completedDays'>[]
  skips: SkipDay[]
}

export interface BadgeDef {
  id: string
  icon: string
  name: string
  /** What earns it, shown while locked. */
  goal: string
  target: number
  current: (c: Derived) => number
}

export interface BadgeStatus extends Omit<BadgeDef, 'current'> {
  current: number
  earned: boolean
}

/** Facts the rules read, computed once per check. */
interface Derived {
  full: WorkoutSession[]
  longestStreak: number
  minutes: number
  challengesDone: number
}

const count = (full: WorkoutSession[], pred: (s: WorkoutSession) => boolean) => full.filter(pred).length

export const BADGES: BadgeDef[] = [
  { id: 'first-workout', icon: '👟', name: 'First workout', goal: 'Finish a workout', target: 1, current: (c) => c.full.length },
  { id: 'streak-3', icon: '🔥', name: '3 days in a row', goal: 'Work out 3 days in a row', target: 3, current: (c) => c.longestStreak },
  { id: 'streak-7', icon: '🔥', name: 'One week strong', goal: '7 days in a row', target: 7, current: (c) => c.longestStreak },
  { id: 'workouts-10', icon: '🏅', name: '10 workouts', goal: 'Finish 10 workouts', target: 10, current: (c) => c.full.length },
  { id: 'minutes-100', icon: '⏱️', name: '100 minutes', goal: '100 minutes of workouts', target: 100, current: (c) => c.minutes },
  { id: 'early-bird', icon: '🌅', name: 'Early bird', goal: '5 workouts before 8 am', target: 5, current: (c) => count(c.full, (s) => new Date(s.startedAt).getHours() < 8) },
  { id: 'streak-14', icon: '🔥', name: 'Two weeks strong', goal: '14 days in a row', target: 14, current: (c) => c.longestStreak },
  { id: 'challenge-finisher', icon: '🏆', name: 'Challenge finisher', goal: 'Finish any challenge', target: 1, current: (c) => c.challengesDone },
  { id: 'workouts-50', icon: '💯', name: '50 workouts', goal: 'Finish 50 workouts', target: 50, current: (c) => c.full.length },
  { id: 'leg-day', icon: '🦵', name: 'Leg day', goal: 'Finish Leg Workout 5 times', target: 5, current: (c) => count(c.full, (s) => s.routineId === 'leg-workout') },
  { id: 'stretch-it-out', icon: '🧘', name: 'Stretch it out', goal: 'Finish Stretching 3 times', target: 3, current: (c) => count(c.full, (s) => s.routineId === 'stretch-workout') },
  { id: 'three-rounds', icon: '⚡', name: 'Three rounds', goal: 'Finish 36 moves in one workout', target: 1, current: (c) => count(c.full, (s) => s.totalExercises >= 36) },
]

/** A full workout: completed, every move done, not deleted. */
export function isFullWorkout(s: WorkoutSession): boolean {
  return s.completed && !s.deletedAt && s.exercisesCompleted >= s.totalExercises
}

function derive(ctx: BadgeContext, today: string): Derived {
  const full = ctx.sessions.filter(isFullWorkout)
  const workoutDays = new Set(full.map((s) => dayKey(new Date(s.startedAt))))
  return {
    full,
    longestStreak: longestRun(activeDays(workoutDays, ctx.skips)),
    minutes: Math.floor(full.reduce((sum, s) => sum + s.durationSeconds, 0) / 60),
    challengesDone: ctx.challenges.filter((p) => {
      const c = CHALLENGE_MAP[p.challengeId]
      return c && challengeStatus(c.days.length, p, ctx.skips, today).complete
    }).length,
  }
}

export function badgeStatus(ctx: BadgeContext, today = todayKey()): BadgeStatus[] {
  const d = derive(ctx, today)
  return BADGES.map(({ current, ...def }) => {
    const value = Math.min(current(d), def.target)
    return { ...def, current: value, earned: value >= def.target }
  })
}

/** Badges earned in `after` that were not earned in `before`, in list order. */
export function newlyEarned(before: BadgeContext, after: BadgeContext, today = todayKey()): string[] {
  const had = new Set(badgeStatus(before, today).filter((b) => b.earned).map((b) => b.id))
  return badgeStatus(after, today).filter((b) => b.earned && !had.has(b.id)).map((b) => b.id)
}
