import { describe, it, expect } from 'vitest'
import { computeStats, computeInsights } from '../src/lib/stats'
import type { WorkoutSession } from '../src/types'

// Sessions are built relative to "now" so streak assertions are date-agnostic.
function sessionOn(daysAgo: number, completed = true): WorkoutSession {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(12, 0, 0, 0)
  return {
    id: `s-${daysAgo}-${Math.random()}`,
    routineName: 'Test',
    startedAt: d.toISOString(),
    durationSeconds: 420,
    completed,
    exercisesCompleted: 12,
    totalExercises: 12,
  }
}

describe('computeStats', () => {
  it('counts only completed sessions', () => {
    const s = computeStats([sessionOn(0), sessionOn(0, false)])
    expect(s.totalWorkouts).toBe(1)
  })

  it('rounds totalMinutes from seconds', () => {
    const s = computeStats([sessionOn(0), sessionOn(1)]) // 840s -> 14 min
    expect(s.totalMinutes).toBe(14)
  })

  it('current streak counts consecutive days ending today', () => {
    expect(computeStats([sessionOn(0), sessionOn(1), sessionOn(2)]).currentStreak).toBe(3)
  })

  it('current streak survives a missing today when yesterday is present', () => {
    expect(computeStats([sessionOn(1), sessionOn(2)]).currentStreak).toBe(2)
  })

  it('breaks the current streak on a gap', () => {
    expect(computeStats([sessionOn(0), sessionOn(1), sessionOn(3)]).currentStreak).toBe(2)
  })

  it('collapses multiple sessions on one day into a single streak day', () => {
    const s = computeStats([sessionOn(0), sessionOn(0), sessionOn(1)])
    expect(s.currentStreak).toBe(2)
    expect(s.totalWorkouts).toBe(3)
  })

  it('finds the longest streak in history', () => {
    // a 4-day run 10-13 days ago, plus a lone recent day
    const s = computeStats([
      sessionOn(0),
      sessionOn(10),
      sessionOn(11),
      sessionOn(12),
      sessionOn(13),
    ])
    expect(s.longestStreak).toBe(4)
  })

  it('returns zeros for empty history', () => {
    const s = computeStats([])
    expect(s.totalWorkouts).toBe(0)
    expect(s.currentStreak).toBe(0)
    expect(s.longestStreak).toBe(0)
    expect(s.lastWorkoutDate).toBeUndefined()
  })
})

function todayKeyLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('computeInsights', () => {
  it('weekly has 12 buckets oldest->newest, counting the current week last', () => {
    const ins = computeInsights([sessionOn(0), sessionOn(0)])
    expect(ins.weekly).toHaveLength(12)
    expect(ins.weekly[11].workouts).toBe(2)
  })

  it('weekday distribution has 7 entries summing to completed count', () => {
    const ins = computeInsights([sessionOn(0), sessionOn(1), sessionOn(2), sessionOn(0, false)])
    expect(ins.weekdayCounts).toHaveLength(7)
    expect(ins.weekdayCounts.reduce((a, b) => a + b, 0)).toBe(3) // abandoned excluded
  })

  it('completion rate is completed / all sessions', () => {
    const ins = computeInsights([sessionOn(0), sessionOn(1, false)])
    expect(ins.completionRate).toBe(0.5)
    expect(ins.totalSessions).toBe(2)
  })

  it('heatmap is week-aligned and ends on today', () => {
    const ins = computeInsights([sessionOn(0)], { heatmapWeeks: 4 })
    const last = ins.heatmap[ins.heatmap.length - 1]
    expect(last.date).toBe(todayKeyLocal())
    expect(last.count).toBe(1)
    expect(ins.heatmap.length).toBeGreaterThanOrEqual(7)
  })

  it('top routines are ranked by completed count', () => {
    const named = (name: string): WorkoutSession => ({ ...sessionOn(0), routineName: name })
    const ins = computeInsights(
      [named('A'), named('A'), named('A'), named('B'), named('B'), named('C')],
      { topN: 2 },
    )
    expect(ins.topRoutines.map((r) => r.name)).toEqual(['A', 'B'])
    expect(ins.topRoutines[0].count).toBe(3)
  })
})
