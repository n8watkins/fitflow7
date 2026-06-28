import type { Stats, WorkoutSession } from '../types'
import { dayKey, parseDayKey, shiftDayKey, todayKey } from './format'

// ---------------------------------------------------------------------------
// Insights (Phase 3a) — richer aggregations for the /insights page. Derived
// types live here (not in the shared contract) since they are view-model only.
// ---------------------------------------------------------------------------

export interface WeeklyPoint {
  /** Monday (local) of the week, 'YYYY-MM-DD'. */
  weekStart: string
  workouts: number
  minutes: number
}
export interface HeatmapDay {
  date: string
  count: number
}
export interface RoutineCount {
  name: string
  count: number
}
export interface Insights {
  /** Oldest → newest, exactly `weeks` buckets (Monday-started). */
  weekly: WeeklyPoint[]
  /** 7 entries, Monday → Sunday. */
  weekdayCounts: number[]
  /** Week-aligned (starts on a Monday); index i → row i%7 (Mon..Sun), col ⌊i/7⌋. */
  heatmap: HeatmapDay[]
  topRoutines: RoutineCount[]
  /** completed / all sessions, 0..1. */
  completionRate: number
  totalSessions: number
}

// ---------------------------------------------------------------------------
// Date helpers (local time, not UTC). dayKey/todayKey/parseDayKey/shiftDayKey
// are shared from lib/format.ts (Finding L10); only the ISO-week helper, which
// is stats-specific, lives here.
// ---------------------------------------------------------------------------

/**
 * Returns the ISO week number (Monday-start) for a local date.
 * Used internally for workoutsThisWeek.
 */
function isoWeekKey(date: Date): string {
  // Monday-start: find the Monday of this week
  const d = new Date(date)
  const day = d.getDay() // 0 = Sun, 1 = Mon, ...
  const diff = (day === 0 ? -6 : 1 - day)
  d.setDate(d.getDate() + diff)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// ---------------------------------------------------------------------------
// Windowed stats (last N days) — used by the Stats/Body page.
// ---------------------------------------------------------------------------

export interface PeriodStats {
  workouts: number
  minutes: number
  /** Distinct local days with at least one completed workout in the window. */
  activeDays: number
}

/**
 * Completed-workout totals over the last `days` calendar days (inclusive of
 * today). `days = 7` => today and the previous 6 days. Local time.
 */
export function statsForLastDays(sessions: WorkoutSession[], days: number): PeriodStats {
  const cutoff = new Date()
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - (days - 1))

  let workouts = 0
  let seconds = 0
  const activeDayKeys = new Set<string>()
  for (const s of sessions) {
    if (!s.completed) continue
    const d = new Date(s.startedAt)
    if (d >= cutoff) {
      workouts++
      seconds += s.durationSeconds
      activeDayKeys.add(dayKey(d))
    }
  }
  return { workouts, minutes: Math.round(seconds / 60), activeDays: activeDayKeys.size }
}

/** Count of completed workouts in the last `days` days (today inclusive). */
export function workoutsLastNDays(sessions: WorkoutSession[], days: number): number {
  return statsForLastDays(sessions, days).workouts
}

// ---------------------------------------------------------------------------
// computeStats
// ---------------------------------------------------------------------------

export function computeStats(sessions: WorkoutSession[]): Stats {
  // Only completed sessions count toward everything except possibly last date.
  const completed = sessions.filter((s) => s.completed)

  const totalWorkouts = completed.length
  const totalMinutes = Math.round(
    completed.reduce((sum, s) => sum + s.durationSeconds, 0) / 60,
  )

  // Build a Set of workout day keys (local date) from completed sessions.
  const workoutDays = new Set<string>()
  for (const s of completed) {
    workoutDays.add(dayKey(new Date(s.startedAt)))
  }

  // -------------------------------------------------------------------------
  // Current streak
  // Current streak = consecutive workout days ending at today or yesterday.
  // If there was a workout today, count from today backward.
  // If no workout today but there was one yesterday, count from yesterday backward.
  // -------------------------------------------------------------------------
  const today = todayKey()
  const yesterday = shiftDayKey(today, -1)

  const streakStart = workoutDays.has(today)
    ? today
    : workoutDays.has(yesterday)
      ? yesterday
      : null

  let currentStreak = 0
  if (streakStart !== null) {
    let cursor = streakStart
    while (workoutDays.has(cursor)) {
      currentStreak++
      cursor = shiftDayKey(cursor, -1)
    }
  }

  // -------------------------------------------------------------------------
  // Longest streak — scan all days in history
  // -------------------------------------------------------------------------
  let longestStreak = 0

  if (workoutDays.size > 0) {
    // Sort workout day keys descending (newest first) to walk backward easily.
    const sortedDays = Array.from(workoutDays).sort().reverse()

    let run = 0
    let prev: string | null = null
    for (const key of sortedDays) {
      if (prev === null || shiftDayKey(prev, -1) === key) {
        run++
      } else {
        longestStreak = Math.max(longestStreak, run)
        run = 1
      }
      prev = key
    }
    longestStreak = Math.max(longestStreak, run)
  }

  // -------------------------------------------------------------------------
  // Workouts this week (Monday-start)
  // -------------------------------------------------------------------------
  const thisWeekMonday = isoWeekKey(new Date())
  let workoutsThisWeek = 0
  for (const s of completed) {
    if (isoWeekKey(new Date(s.startedAt)) === thisWeekMonday) {
      workoutsThisWeek++
    }
  }

  // -------------------------------------------------------------------------
  // Workouts this month (calendar month, local time)
  // -------------------------------------------------------------------------
  const now = new Date()
  const thisYear = now.getFullYear()
  const thisMonth = now.getMonth() // 0-indexed
  let workoutsThisMonth = 0
  for (const s of completed) {
    const d = new Date(s.startedAt)
    if (d.getFullYear() === thisYear && d.getMonth() === thisMonth) {
      workoutsThisMonth++
    }
  }

  // -------------------------------------------------------------------------
  // Last workout date (from all completed sessions)
  // -------------------------------------------------------------------------
  let lastWorkoutDate: string | undefined
  if (completed.length > 0) {
    const latest = completed.reduce((best, s) =>
      new Date(s.startedAt) > new Date(best.startedAt) ? s : best,
    )
    lastWorkoutDate = dayKey(new Date(latest.startedAt))
  }

  return {
    totalWorkouts,
    totalMinutes,
    currentStreak,
    longestStreak,
    workoutsThisWeek,
    workoutsThisMonth,
    lastWorkoutDate,
  }
}

// ---------------------------------------------------------------------------
// computeInsights
// ---------------------------------------------------------------------------

/** The last `count` Monday date-keys, oldest → newest (this week's Monday last). */
function weekStarts(count: number): string[] {
  const monday = parseDayKey(isoWeekKey(new Date()))
  const out: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(monday)
    d.setDate(monday.getDate() - i * 7)
    out.push(dayKey(d))
  }
  return out
}

/** Day-keys from the Monday `weeks-1` weeks ago through today (week-aligned). */
function heatmapDayKeys(weeks: number): string[] {
  const today = new Date()
  const start = parseDayKey(isoWeekKey(today))
  start.setDate(start.getDate() - (weeks - 1) * 7)
  const out: string[] = []
  const cursor = new Date(start)
  while (cursor <= today) {
    out.push(dayKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

export function computeInsights(
  sessions: WorkoutSession[],
  opts: { weeks?: number; heatmapWeeks?: number; topN?: number } = {},
): Insights {
  const weeks = opts.weeks ?? 12
  const heatmapWeeks = opts.heatmapWeeks ?? 17
  const topN = opts.topN ?? 5
  const completed = sessions.filter((s) => s.completed)

  // Weekly workouts + minutes, bucketed by ISO week (Monday-started).
  const weekBuckets = new Map<string, { workouts: number; minutes: number }>()
  for (const key of weekStarts(weeks)) weekBuckets.set(key, { workouts: 0, minutes: 0 })
  for (const s of completed) {
    const bucket = weekBuckets.get(isoWeekKey(new Date(s.startedAt)))
    if (bucket) {
      bucket.workouts++
      bucket.minutes += s.durationSeconds / 60
    }
  }
  const weekly: WeeklyPoint[] = [...weekBuckets.entries()].map(([weekStart, b]) => ({
    weekStart,
    workouts: b.workouts,
    minutes: Math.round(b.minutes),
  }))

  // Weekday distribution, Monday → Sunday.
  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0]
  for (const s of completed) {
    const day = new Date(s.startedAt).getDay() // 0 = Sun .. 6 = Sat
    weekdayCounts[(day + 6) % 7]++
  }

  // Per-day counts for the heatmap.
  const dayCounts = new Map<string, number>()
  for (const s of completed) {
    const k = dayKey(new Date(s.startedAt))
    dayCounts.set(k, (dayCounts.get(k) ?? 0) + 1)
  }
  const heatmap: HeatmapDay[] = heatmapDayKeys(heatmapWeeks).map((date) => ({
    date,
    count: dayCounts.get(date) ?? 0,
  }))

  // Top routines by completed count.
  const routineCounts = new Map<string, number>()
  for (const s of completed) {
    routineCounts.set(s.routineName, (routineCounts.get(s.routineName) ?? 0) + 1)
  }
  const topRoutines: RoutineCount[] = [...routineCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN)

  return {
    weekly,
    weekdayCounts,
    heatmap,
    topRoutines,
    completionRate: sessions.length ? completed.length / sessions.length : 0,
    totalSessions: sessions.length,
  }
}
