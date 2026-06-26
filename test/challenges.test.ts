import { describe, it, expect } from 'vitest'
import { CHALLENGES, CHALLENGE_MAP } from '../src/data/challenges'
import { SYSTEM_ROUTINES } from '../src/data/routines'

const ROUTINE_IDS = new Set(SYSTEM_ROUTINES.map((r) => r.id))

describe('challenge content', () => {
  it('exposes the expected challenges with correct lengths', () => {
    expect(CHALLENGES.map((c) => c.id).sort()).toEqual(
      ['abs-14', 'fullbody-21', 'seven-day', 'thirty-day'].sort(),
    )
    expect(CHALLENGE_MAP['thirty-day'].days).toHaveLength(30)
    expect(CHALLENGE_MAP['seven-day'].days).toHaveLength(7)
    expect(CHALLENGE_MAP['abs-14'].days).toHaveLength(14)
    expect(CHALLENGE_MAP['fullbody-21'].days).toHaveLength(21)
  })

  it('numbers days 1..N in order', () => {
    for (const c of CHALLENGES) {
      expect(c.days.map((d) => d.day)).toEqual(c.days.map((_, i) => i + 1))
    }
  })

  it('only references real system routines', () => {
    for (const c of CHALLENGES) {
      for (const d of c.days) {
        if (d.routineId) expect(ROUTINE_IDS.has(d.routineId)).toBe(true)
      }
    }
  })

  it('makes every 7th day a recovery stretch day', () => {
    const thirty = CHALLENGE_MAP['thirty-day']
    for (const d of thirty.days) {
      if (d.day % 7 === 0) {
        expect(d.routineId).toBe('stretch-workout')
        expect(d.label).toMatch(/Recovery/)
      }
    }
  })

  it('ramps rounds across the 30-day challenge', () => {
    const days = CHALLENGE_MAP['thirty-day'].days
    expect(days[0].rounds).toBe(1) // day 1
    expect(days[10].rounds).toBe(2) // day 11
    expect(days[24].rounds).toBe(3) // day 25
  })
})
