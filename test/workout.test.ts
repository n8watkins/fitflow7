import { describe, it, expect } from 'vitest'
import { estimateCalories, estimateMinutes, lengthPresets } from '../src/lib/workout'

const classic = { exerciseIds: Array.from({ length: 12 }, (_, i) => `e${i}`), workSeconds: 30, restSeconds: 10, rounds: 1 }

describe('workout length', () => {
  it('estimates minutes from work, rest and rounds', () => {
    expect(estimateMinutes(classic)).toBe(8) // 12×30 + 11×10 = 470 s
    expect(estimateMinutes(classic, 2)).toBe(16) // 24×30 + 23×10 = 950 s
    expect(estimateMinutes(classic, 3)).toBe(24)
  })

  it('offers 1, 2 and 3 times the routine as presets, with their rounds and minutes', () => {
    expect(lengthPresets(classic)).toEqual([
      { times: 1, rounds: 1, minutes: 8 },
      { times: 2, rounds: 2, minutes: 16 },
      { times: 3, rounds: 3, minutes: 24 },
    ])
    expect(lengthPresets({ ...classic, rounds: 2 }).map((p) => p.rounds)).toEqual([2, 4, 6])
  })
})

describe('calorie estimate', () => {
  it('uses MET 8 (vigorous calisthenics) × body weight × hours', () => {
    expect(estimateCalories(480, 80)).toBe(85) // 8 × 80 × 0.1333 = 85.3
    expect(estimateCalories(0, 80)).toBe(0)
  })
  it('gives nothing without a sensible weight', () => {
    expect(estimateCalories(480, undefined)).toBeNull()
    expect(estimateCalories(480, 0)).toBeNull()
  })
})
