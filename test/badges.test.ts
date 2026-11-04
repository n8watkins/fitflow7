import { describe, it, expect } from 'vitest'
import { BADGES, badgeStatus, newlyEarned } from '../src/lib/badges'
import type { WorkoutSession } from '../src/types'

let n = 0
function s(at: string, over: Partial<WorkoutSession> = {}): WorkoutSession {
  return { id: `s${n++}`, routineName: 'Classic 7', routineId: 'classic-7', startedAt: at, durationSeconds: 470, completed: true, exercisesCompleted: 12, totalExercises: 12, ...over }
}
const daily = (count: number, from = '2026-11-01', hour = 18) =>
  Array.from({ length: count }, (_, i) => { const d = new Date(`${from}T00:00:00`); d.setDate(d.getDate() + i); d.setHours(hour); return s(d.toISOString()) })
const status = (sessions: WorkoutSession[], extra = {}) =>
  Object.fromEntries(badgeStatus({ sessions, challenges: [], skips: [], ...extra }).map((b) => [b.id, b]))

describe('badges', () => {
  it('has the twelve previewed badges', () => {
    expect(BADGES.map((b) => b.id)).toEqual([
      'first-workout', 'streak-3', 'streak-7', 'workouts-10', 'minutes-100', 'early-bird',
      'streak-14', 'challenge-finisher', 'workouts-50', 'leg-day', 'stretch-it-out', 'three-rounds',
    ])
  })

  it('earns workout, streak and minute badges at their thresholds', () => {
    const b = status(daily(7))
    expect(b['first-workout'].earned).toBe(true)
    expect(b['streak-3'].earned).toBe(true)
    expect(b['streak-7'].earned).toBe(true)
    expect(b['streak-14']).toMatchObject({ earned: false, current: 7, target: 14 })
    expect(b['workouts-10']).toMatchObject({ earned: false, current: 7 })
    expect(b['minutes-100']).toMatchObject({ earned: false, current: 54 }) // 7 × 470 s
  })

  it('does not count ended-early or deleted workouts', () => {
    const b = status([s('2026-11-01T10:00:00', { completed: false, exercisesCompleted: 3 }), s('2026-11-02T10:00:00', { deletedAt: 'x' })])
    expect(b['first-workout'].earned).toBe(false)
  })

  it('counts a skip day toward streak badges', () => {
    const sessions = [...daily(2, '2026-11-01'), ...daily(1, '2026-11-04')]
    expect(status(sessions)['streak-3'].earned).toBe(false)
    expect(status(sessions, { skips: [{ id: '2026-11-03', date: '2026-11-03', createdAt: 'x' }] })['streak-3'].earned).toBe(true)
  })

  it('earns early bird, leg day, stretching and three rounds from what the workout was', () => {
    const b = status([
      ...daily(5, '2026-11-01', 7),
      ...Array.from({ length: 5 }, (_, i) => s(`2026-11-1${i}T18:00:00`, { routineId: 'leg-workout', routineName: 'Leg Workout' })),
      ...Array.from({ length: 3 }, (_, i) => s(`2026-11-2${i}T18:00:00`, { routineId: 'stretch-workout', routineName: 'Stretching' })),
      s('2026-11-25T18:00:00', { exercisesCompleted: 36, totalExercises: 36, durationSeconds: 1430 }),
    ])
    expect(b['early-bird'].earned).toBe(true)
    expect(b['leg-day'].earned).toBe(true)
    expect(b['stretch-it-out'].earned).toBe(true)
    expect(b['three-rounds'].earned).toBe(true)
  })

  it('earns challenge finisher for a finished challenge', () => {
    const completedDays = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i + 1, 'x']))
    const b = status([], { challenges: [{ challengeId: 'seven-day', startedAt: '2026-11-01T10:00:00', completedDays }] })
    expect(b['challenge-finisher'].earned).toBe(true)
  })

  it('names what a workout just earned', () => {
    const before = daily(2)
    const after = [...before, ...daily(1, '2026-11-03')]
    expect(newlyEarned({ sessions: before, challenges: [], skips: [] }, { sessions: after, challenges: [], skips: [] })).toEqual(['streak-3'])
  })
})
