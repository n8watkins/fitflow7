import { describe, it, expect } from 'vitest'
import {
  kgToLb,
  lbToKg,
  cmToFtIn,
  ftInToCm,
  computeBmi,
  bmiCategory,
  healthyWeightRangeKg,
  formatWeight,
  formatHeight,
  weightUnitLabel,
  formatWeightDelta,
  weightChangeKg,
  weightToGoalKg,
} from '../src/lib/body'

describe('weight conversions', () => {
  it('round-trips kg <-> lb', () => {
    expect(kgToLb(lbToKg(150))).toBeCloseTo(150, 6)
    expect(kgToLb(100)).toBeCloseTo(220.462, 2)
  })
})

describe('height conversions', () => {
  it('ftIn -> cm', () => {
    expect(ftInToCm(5, 10)).toBeCloseTo(177.8, 4)
    expect(ftInToCm(5, 0)).toBeCloseTo(152.4, 4)
  })

  it('cm -> ftIn', () => {
    expect(cmToFtIn(177.8)).toEqual({ feet: 5, inches: 10 })
    expect(cmToFtIn(152.4)).toEqual({ feet: 5, inches: 0 })
  })

  it('carries 12 inches up to the next foot when rounding', () => {
    // 181.864 cm = 71.6 in -> 5 ft 11.6 in -> rounds to 12 -> 6 ft 0 in
    expect(cmToFtIn(181.864)).toEqual({ feet: 6, inches: 0 })
  })
})

describe('computeBmi', () => {
  it('computes kg/m^2', () => {
    expect(computeBmi(75, 180)).toBeCloseTo(23.15, 2)
  })
  it('returns 0 for non-positive inputs', () => {
    expect(computeBmi(0, 180)).toBe(0)
    expect(computeBmi(70, 0)).toBe(0)
  })
})

describe('bmiCategory boundaries', () => {
  it('classifies across the WHO boundaries', () => {
    expect(bmiCategory(0).label).toBe('—')
    expect(bmiCategory(18.4).label).toBe('Underweight')
    expect(bmiCategory(18.5).label).toBe('Normal')
    expect(bmiCategory(24.9).label).toBe('Normal')
    expect(bmiCategory(25).label).toBe('Overweight')
    expect(bmiCategory(29.9).label).toBe('Overweight')
    expect(bmiCategory(30).label).toBe('Obese')
  })
})

describe('healthyWeightRangeKg', () => {
  it('spans BMI 18.5 to 24.9 for the height', () => {
    const { minKg, maxKg } = healthyWeightRangeKg(180)
    expect(minKg).toBeCloseTo(59.94, 2)
    expect(maxKg).toBeCloseTo(80.68, 2)
  })
  it('is zero for non-positive height', () => {
    expect(healthyWeightRangeKg(0)).toEqual({ minKg: 0, maxKg: 0 })
  })
})

describe('formatters', () => {
  it('formats weight per unit', () => {
    expect(formatWeight(75, 'metric')).toBe('75.0 kg')
    expect(formatWeight(75, 'imperial')).toBe('165.3 lb')
  })
  it('formats height per unit', () => {
    expect(formatHeight(180, 'metric')).toBe('180 cm')
    expect(formatHeight(180, 'imperial')).toBe('5\'11"')
  })
  it('labels the weight unit', () => {
    expect(weightUnitLabel('imperial')).toBe('lb')
    expect(weightUnitLabel('metric')).toBe('kg')
  })
  it('formats a signed weight delta with a real minus sign', () => {
    expect(formatWeightDelta(-1, 'metric')).toBe('−1.0 kg')
    expect(formatWeightDelta(2, 'metric')).toBe('+2.0 kg')
    expect(formatWeightDelta(0, 'metric')).toBe('±0.0 kg')
    expect(formatWeightDelta(-1, 'imperial')).toBe('−2.2 lb')
  })
})

describe('weightChangeKg', () => {
  const e = (date: string, weightKg: number) => ({ date, weightKg })

  it('returns null with fewer than two entries', () => {
    expect(weightChangeKg([], 30)).toBeNull()
    expect(weightChangeKg([e('2026-06-01', 80)], 30)).toBeNull()
  })

  it('measures latest minus the entry at/before the window start', () => {
    const entries = [
      e('2026-05-01', 82), // older than the 30-day window from the latest
      e('2026-05-27', 80), // ~30 days before latest -> baseline
      e('2026-06-26', 78), // latest
    ]
    // latest (78) - baseline at/before cutoff 2026-05-27 (80) = -2
    expect(weightChangeKg(entries, 30)).toBeCloseTo(-2, 6)
  })

  it('falls back to the earliest entry when all data is inside the window', () => {
    const entries = [e('2026-06-20', 79), e('2026-06-26', 77)]
    expect(weightChangeKg(entries, 30)).toBeCloseTo(-2, 6)
  })

  it('is order-independent', () => {
    const entries = [e('2026-06-26', 77), e('2026-06-20', 79)]
    expect(weightChangeKg(entries, 7)).toBeCloseTo(-2, 6)
  })
})

describe('weightToGoalKg', () => {
  it('is positive above goal and negative below', () => {
    expect(weightToGoalKg(80, 75)).toBe(5)
    expect(weightToGoalKg(73, 75)).toBe(-2)
    expect(weightToGoalKg(75, 75)).toBe(0)
  })
})
