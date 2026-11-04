// Small workout arithmetic shared by the dashboard and the finish screen.

type Timing = { exerciseIds: string[]; workSeconds: number; restSeconds: number; rounds: number }

/** Rough wall-clock minutes for a routine (work + rest across all rounds). */
export function estimateMinutes(r: Timing, rounds = r.rounds): number {
  const slots = r.exerciseIds.length * rounds
  const secs = slots * r.workSeconds + Math.max(0, slots - 1) * r.restSeconds
  return Math.max(1, Math.round(secs / 60))
}

export interface LengthPreset {
  /** How many times through the routine. */
  times: 1 | 2 | 3
  /** The rounds to play (the routine's own rounds × times). */
  rounds: number
  minutes: number
}

/** One, two or three times through: the classic 7-minute circuit becomes
 *  about 8, 16 or 24 minutes. */
export function lengthPresets(r: Timing): LengthPreset[] {
  return ([1, 2, 3] as const).map((times) => {
    const rounds = r.rounds * times
    return { times, rounds, minutes: estimateMinutes(r, rounds) }
  })
}

/** MET for vigorous calisthenics (Compendium of Physical Activities, 02020). */
const CIRCUIT_MET = 8

/** Estimated kcal for a workout: MET × weight (kg) × hours. Null without a
 *  usable weight, so the screen never shows a guess based on nothing. */
export function estimateCalories(durationSeconds: number, weightKg: number | undefined): number | null {
  if (!weightKg || weightKg <= 0) return null
  return Math.round(CIRCUIT_MET * weightKg * (durationSeconds / 3600))
}
