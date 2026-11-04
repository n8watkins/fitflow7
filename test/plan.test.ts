import { describe, it, expect } from 'vitest'
import { PLAN_STAGES, planProgress, planWorkout, resolveVariation, tierFor, timingFor } from '../src/lib/plan'
import type { Exercise, WorkoutSession } from '../src/types'

const START = '2026-11-01T08:00:00.000Z'
let n = 0
function session(at: string, over: Partial<WorkoutSession> = {}): WorkoutSession {
  return { id: `s${n++}`, routineName: 'Classic 7', startedAt: at, durationSeconds: 470, completed: true, exercisesCompleted: 12, totalExercises: 12, ...over }
}
const done = (count: number, from = '2026-11-02T08:00:00.000Z') =>
  Array.from({ length: count }, (_, i) => session(new Date(Date.parse(from) + i * 86_400_000).toISOString()))

describe('plan progress', () => {
  it('starts in week 1 with nothing done', () => {
    expect(planProgress([], START)).toEqual({ stage: 1, doneInStage: 0, totalDone: 0, complete: false })
  })

  it('steps up a week after every three completed workouts', () => {
    expect(planProgress(done(2), START)).toMatchObject({ stage: 1, doneInStage: 2 })
    expect(planProgress(done(3), START)).toMatchObject({ stage: 2, doneInStage: 0 })
    expect(planProgress(done(8), START)).toMatchObject({ stage: 3, doneInStage: 2 })
  })

  it('is complete after twelve, and stays on week 4', () => {
    expect(planProgress(done(11), START)).toMatchObject({ stage: 4, doneInStage: 2, complete: false })
    expect(planProgress(done(12), START)).toMatchObject({ stage: 4, doneInStage: 3, complete: true })
    expect(planProgress(done(20), START)).toMatchObject({ stage: 4, doneInStage: 3, complete: true })
  })

  it('ignores workouts before the plan, ended early, or deleted', () => {
    const sessions = [
      session('2026-10-30T08:00:00.000Z'),
      session('2026-11-02T08:00:00.000Z', { completed: false, exercisesCompleted: 4 }),
      session('2026-11-03T08:00:00.000Z', { deletedAt: '2026-11-03T09:00:00.000Z' }),
      session('2026-11-04T08:00:00.000Z'),
    ]
    expect(planProgress(sessions, START).totalDone).toBe(1)
  })
})

describe('plan stages', () => {
  it('goes easier → standard → two rounds → harder', () => {
    expect(PLAN_STAGES.map((s) => [s.tierOffset, s.rounds])).toEqual([[-1, 1], [0, 1], [0, 2], [1, 2]])
  })

  it('shifts the tier by level and clamps it', () => {
    expect(tierFor('intermediate', 1)).toBe('easier')
    expect(tierFor('intermediate', 2)).toBe('standard')
    expect(tierFor('intermediate', 4)).toBe('harder')
    expect(tierFor('beginner', 2)).toBe('easier')
    expect(tierFor('beginner', 4)).toBe('standard')
    expect(tierFor('advanced', 1)).toBe('standard')
    expect(tierFor('advanced', 4)).toBe('harder')
  })

  it('sets work and rest by level', () => {
    expect(timingFor('beginner')).toEqual({ workSeconds: 20, restSeconds: 15 })
    expect(timingFor('intermediate')).toEqual({ workSeconds: 30, restSeconds: 10 })
    expect(timingFor('advanced')).toEqual({ workSeconds: 40, restSeconds: 10 })
  })
})

describe('plan workout', () => {
  it('builds today\'s workout from goal, level and progress', () => {
    const w = planWorkout({ goal: 'habit', level: 'intermediate', planStartedAt: START, updatedAt: START }, done(6))
    expect(w).toMatchObject({ routineId: 'classic-7', stage: 3, rounds: 2, tier: 'standard', workSeconds: 30, restSeconds: 10 })
  })

  it('rotates routines for strength and shortens rest for cardio', () => {
    const p = { goal: 'strength' as const, level: 'intermediate' as const, planStartedAt: START, updatedAt: START }
    expect([0, 1, 2, 3].map((k) => planWorkout(p, done(k))?.routineId)).toEqual(['classic-7', 'arm-workout', 'leg-workout', 'classic-7'])
    expect(planWorkout({ ...p, goal: 'cardio' }, [])?.restSeconds).toBe(5)
    expect(planWorkout({ ...p, goal: 'cardio', level: 'beginner' }, [])?.restSeconds).toBe(10)
  })

  it('is null without a plan', () => {
    expect(planWorkout({ updatedAt: START }, [])).toBeNull()
    expect(planWorkout({ level: 'beginner', updatedAt: START }, [])).toBeNull()
  })
})

describe('variations', () => {
  const ex = (id: string, easier?: string, harder?: string) => ({ id, easierVariationId: easier, harderVariationId: harder }) as Exercise
  const map = { 'push-ups': ex('push-ups', 'knee-push-up', 'push-up-rotation'), 'knee-push-up': ex('knee-push-up'), 'push-up-rotation': ex('push-up-rotation'), 'wall-sit': ex('wall-sit') }

  it('uses the easier or harder version when there is one', () => {
    expect(resolveVariation(map['push-ups'], 'easier', map).id).toBe('knee-push-up')
    expect(resolveVariation(map['push-ups'], 'harder', map).id).toBe('push-up-rotation')
    expect(resolveVariation(map['push-ups'], 'standard', map).id).toBe('push-ups')
  })

  it('keeps the move when it has no such version', () => {
    expect(resolveVariation(map['wall-sit'], 'harder', map).id).toBe('wall-sit')
    expect(resolveVariation(ex('x', 'missing-id'), 'easier', map).id).toBe('x')
  })
})
