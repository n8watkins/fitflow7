import type { Challenge, ChallengeDay } from '../types'

// Multi-day programs that schedule the system routines. Progress is tracked
// per-user in storage (ChallengeProgress); this module is static content only.
// Built deterministically (no Date.now / Math.random) so it is stable + testable.

type BuildOpts = {
  /** Every Nth day is a light-recovery (stretch) day. 0 = none. */
  restEvery?: number
  /** Rounds (intensity) for a given day number; defaults to 1. */
  rounds?: (day: number) => number
}

function buildDays(length: number, rotation: string[], opts: BuildOpts = {}): ChallengeDay[] {
  const { restEvery = 0, rounds } = opts
  const days: ChallengeDay[] = []
  let rotIdx = 0
  for (let d = 1; d <= length; d++) {
    if (restEvery && d % restEvery === 0) {
      days.push({ day: d, routineId: 'stretch-workout', label: 'Recovery — light stretch' })
      continue
    }
    const routineId = rotation[rotIdx % rotation.length]
    rotIdx++
    const r = rounds ? rounds(d) : 1
    days.push({ day: d, routineId, rounds: r, label: r > 1 ? `×${r} rounds` : undefined })
  }
  return days
}

const FULL_ROTATION = ['classic-7', 'abs-workout', 'butt-workout', 'leg-workout', 'arm-workout']

export const CHALLENGES: Challenge[] = [
  {
    id: 'thirty-day',
    name: '30-Day Challenge',
    description:
      'A full month of daily 7-minute workouts that rotate through every focus and ramp up the intensity each week. Recovery stretch every 7th day.',
    icon: '🏆',
    days: buildDays(30, FULL_ROTATION, {
      restEvery: 7,
      rounds: (d) => (d <= 10 ? 1 : d <= 20 ? 2 : 3),
    }),
  },
  {
    id: 'seven-day',
    name: '7-Day Kickstart',
    description: 'A gentle one-week intro that samples each workout once. Perfect for building the habit.',
    icon: '🚀',
    days: buildDays(7, FULL_ROTATION, { restEvery: 7 }),
  },
  {
    id: 'abs-14',
    name: '14-Day Abs',
    description: 'Two weeks of focused core work, doubling up in week two, with a stretch day at the end of each week.',
    icon: '🔥',
    days: buildDays(14, ['abs-workout'], {
      restEvery: 7,
      rounds: (d) => (d <= 7 ? 1 : 2),
    }),
  },
  {
    id: 'fullbody-21',
    name: '21-Day Full Body',
    description: 'Three weeks rotating every routine, adding a round each week to keep the challenge climbing.',
    icon: '💪',
    days: buildDays(21, FULL_ROTATION, {
      restEvery: 7,
      rounds: (d) => (d <= 7 ? 1 : d <= 14 ? 2 : 3),
    }),
  },
]

export const CHALLENGE_MAP: Record<string, Challenge> = Object.fromEntries(
  CHALLENGES.map((c) => [c.id, c]),
)
