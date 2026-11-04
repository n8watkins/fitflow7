// Skip days: up to three missed days a month that still count as active, so
// one missed day keeps your streak and keeps a challenge on track. A skip is a
// local calendar date ('YYYY-MM-DD'); its month's budget pays for it, so
// skipping October 31 on November 1 spends October's.

import type { ChallengeProgress } from '../types'
import { dayKey, parseDayKey, shiftDayKey } from './format'

export const SKIPS_PER_MONTH = 3
/** How far back a missed day can still be skipped. */
export const SKIP_WINDOW_DAYS = 7

export type SkipDay = {
  /** Same as `date`: one skip per day per account. */
  id: string
  date: string
  createdAt: string
  updatedAt?: string
  deletedAt?: string
  dirty?: boolean
}

const live = (skips: SkipDay[]) => skips.filter((s) => !s.deletedAt)

export function monthOf(date: string): string {
  return date.slice(0, 7)
}

export function skipsLeftIn(skips: SkipDay[], month: string): number {
  return Math.max(0, SKIPS_PER_MONTH - live(skips).filter((s) => monthOf(s.date) === month).length)
}

export type SkipCheck = { ok: true } | { ok: false; reason: 'not-past' | 'too-old' | 'workout-day' | 'already-skipped' | 'no-skips-left' }

export interface SkipContext {
  today: string
  workoutDays: Set<string>
  skips: SkipDay[]
}

/** Whether `date` can be skipped: a past day within the last week, with no
 *  workout, not skipped yet, and with budget left in its month. Date keys
 *  compare correctly as strings. */
export function canSkip(date: string, ctx: SkipContext): SkipCheck {
  if (date >= ctx.today) return { ok: false, reason: 'not-past' }
  if (date < shiftDayKey(ctx.today, -SKIP_WINDOW_DAYS)) return { ok: false, reason: 'too-old' }
  if (ctx.workoutDays.has(date)) return { ok: false, reason: 'workout-day' }
  if (live(ctx.skips).some((s) => s.date === date)) return { ok: false, reason: 'already-skipped' }
  if (skipsLeftIn(ctx.skips, monthOf(date)) === 0) return { ok: false, reason: 'no-skips-left' }
  return { ok: true }
}

/** Workout days plus live skip days: the days that keep a streak going. */
export function activeDays(workoutDays: Set<string>, skips: SkipDay[]): Set<string> {
  const out = new Set(workoutDays)
  for (const s of live(skips)) out.add(s.date)
  return out
}

/** Consecutive active days ending on `end`. */
export function runEndingAt(active: Set<string>, end: string): number {
  let n = 0
  for (let d = end; active.has(d); d = shiftDayKey(d, -1)) n++
  return n
}

export function longestRun(active: Set<string>): number {
  let best = 0
  for (const d of active) {
    if (active.has(shiftDayKey(d, -1))) continue // not the start of a run
    let n = 0
    for (let c = d; active.has(c); c = shiftDayKey(c, 1)) n++
    best = Math.max(best, n)
  }
  return best
}

/** Yesterday, when it was missed, a streak ran up to the day before, and it
 *  can still be skipped. Otherwise null. */
export function dayToOffer(ctx: SkipContext): string | null {
  const yesterday = shiftDayKey(ctx.today, -1)
  const active = activeDays(ctx.workoutDays, ctx.skips)
  if (active.has(yesterday)) return null
  if (!active.has(shiftDayKey(yesterday, -1))) return null
  return canSkip(yesterday, ctx).ok ? yesterday : null
}

/** The challenge day (1-based) that falls on a local date. Counted between
 *  local midnights and rounded, so a daylight-saving change can't shift it. */
export function challengeDayOn(startedAt: string, date: string): number {
  const start = parseDayKey(dayKey(new Date(startedAt)))
  return Math.round((parseDayKey(date).getTime() - start.getTime()) / 86_400_000) + 1
}

export interface ChallengeStatus {
  /** Days a skip covers (never the last day). */
  skipped: Set<number>
  /** Today's challenge day, which may be past the end. */
  todayDay: number
  /** Every day before today is done or skipped. */
  onTrack: boolean
  /** Days before today that are neither done nor skipped. */
  behindBy: number
  /** Every day done or skipped, and the last day actually done. */
  complete: boolean
}

export function challengeStatus(
  length: number,
  progress: Pick<ChallengeProgress, 'startedAt' | 'completedDays'> & { challengeId: string },
  skips: SkipDay[],
  today: string,
): ChallengeStatus {
  const done = (d: number) => Boolean(progress.completedDays[d])
  const skipped = new Set<number>()
  for (const s of live(skips)) {
    const d = challengeDayOn(progress.startedAt, s.date)
    if (d >= 1 && d < length && !done(d)) skipped.add(d)
  }
  const covered = (d: number) => done(d) || skipped.has(d)
  const todayDay = challengeDayOn(progress.startedAt, today)
  let behindBy = 0
  for (let d = 1; d < Math.min(todayDay, length + 1); d++) if (!covered(d)) behindBy++
  let complete = done(length)
  for (let d = 1; complete && d <= length; d++) complete = covered(d)
  return { skipped, todayDay, onTrack: behindBy === 0, behindBy, complete }
}
