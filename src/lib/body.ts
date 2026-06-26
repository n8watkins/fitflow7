// Pure body-metric math: unit conversions, BMI, categories. No React, no deps,
// fully unit-testable (matches the lib/ convention alongside stats.ts/calendar.ts).
// Canonical storage is metric (kg/cm); these helpers convert for display + input.

import type { UnitSystem } from '../types'

const LB_PER_KG = 2.2046226218
const CM_PER_IN = 2.54

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG
}

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG
}

export function cmToIn(cm: number): number {
  return cm / CM_PER_IN
}

export function inToCm(inches: number): number {
  return inches * CM_PER_IN
}

/** Centimeters -> { feet, inches } (inches rounded, carrying to feet at 12). */
export function cmToFtIn(cm: number): { feet: number; inches: number } {
  const totalIn = cm / CM_PER_IN
  let feet = Math.floor(totalIn / 12)
  let inches = Math.round(totalIn - feet * 12)
  if (inches === 12) {
    feet += 1
    inches = 0
  }
  return { feet, inches }
}

/** { feet, inches } -> centimeters. */
export function ftInToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * CM_PER_IN
}

// ---------------------------------------------------------------------------
// BMI
// ---------------------------------------------------------------------------

/** Body Mass Index = kg / m². Returns 0 for non-positive inputs. */
export function computeBmi(weightKg: number, heightCm: number): number {
  if (weightKg <= 0 || heightCm <= 0) return 0
  const m = heightCm / 100
  return weightKg / (m * m)
}

/** Standard WHO adult BMI categories with a color hint for the UI. */
export function bmiCategory(bmi: number): { label: string; color: string } {
  if (bmi <= 0) return { label: '—', color: 'slate' }
  if (bmi < 18.5) return { label: 'Underweight', color: 'sky' }
  if (bmi < 25) return { label: 'Normal', color: 'emerald' }
  if (bmi < 30) return { label: 'Overweight', color: 'amber' }
  return { label: 'Obese', color: 'red' }
}

/** Healthy weight range (BMI 18.5–24.9) for a given height, in kilograms. */
export function healthyWeightRangeKg(heightCm: number): { minKg: number; maxKg: number } {
  if (heightCm <= 0) return { minKg: 0, maxKg: 0 }
  const m = heightCm / 100
  return { minKg: 18.5 * m * m, maxKg: 24.9 * m * m }
}

// ---------------------------------------------------------------------------
// Display formatting
// ---------------------------------------------------------------------------

/** Canonical kg -> a display string in the chosen unit, e.g. "165.3 lb" / "75.0 kg". */
export function formatWeight(kg: number, unit: UnitSystem): string {
  if (unit === 'imperial') return `${kgToLb(kg).toFixed(1)} lb`
  return `${kg.toFixed(1)} kg`
}

/** Canonical cm -> a display string in the chosen unit, e.g. `5'10"` / "178 cm". */
export function formatHeight(cm: number, unit: UnitSystem): string {
  if (unit === 'imperial') {
    const { feet, inches } = cmToFtIn(cm)
    return `${feet}'${inches}"`
  }
  return `${Math.round(cm)} cm`
}

/** Weight unit suffix for input labels. */
export function weightUnitLabel(unit: UnitSystem): string {
  return unit === 'imperial' ? 'lb' : 'kg'
}

/** Signed weight delta -> display string with a leading sign, e.g. "+1.1 kg" /
 *  "−2.3 lb" (a real minus sign). Exactly-zero shows as "±0.0". */
export function formatWeightDelta(deltaKg: number, unit: UnitSystem): string {
  const v = unit === 'imperial' ? kgToLb(deltaKg) : deltaKg
  const rounded = Math.round(v * 10) / 10
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '±'
  return `${sign}${Math.abs(rounded).toFixed(1)} ${weightUnitLabel(unit)}`
}

// ---------------------------------------------------------------------------
// Trend + goal progress (pure; operates on {date,weightKg} measurements)
// ---------------------------------------------------------------------------

/** Shift a 'YYYY-MM-DD' day key by `deltaDays` (may be negative), local calendar. */
function shiftDayKey(date: string, deltaDays: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + deltaDays)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Signed weight change (kg) over the trailing `days` window: the latest
 *  measurement minus the baseline. The baseline is the most recent entry at or
 *  before the window start; if every entry is newer than that (all data falls
 *  inside the window), the earliest entry is used. Negative = weight lost.
 *  Returns null when fewer than two measurements exist. */
export function weightChangeKg(
  entries: readonly { date: string; weightKg: number }[],
  days: number,
): number | null {
  if (entries.length < 2) return null
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  const latest = sorted[sorted.length - 1]
  const cutoff = shiftDayKey(latest.date, -days)
  let baseline = sorted[0]
  for (const e of sorted) {
    if (e.date <= cutoff) baseline = e
    else break
  }
  return latest.weightKg - baseline.weightKg
}

/** Signed remaining distance to the goal weight (kg): latest minus goal.
 *  Positive = still above goal; ≤0 = goal reached or passed. */
export function weightToGoalKg(latestKg: number, goalKg: number): number {
  return latestKg - goalKg
}
