import type { Stats, WorkoutSession } from '../types'

// ---------------------------------------------------------------------------
// Date helpers (local time, not UTC)
// ---------------------------------------------------------------------------

/** Returns a 'YYYY-MM-DD' string using local time. */
function dayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Returns today's local date key. */
function todayKey(): string {
  return dayKey(new Date())
}

/** Returns yesterday's local date key. */
function yesterdayKey(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return dayKey(d)
}

/** Parse a date-key 'YYYY-MM-DD' back into a JS Date (local midnight). */
function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Subtract one calendar day from a date key, returns new key. */
function prevDayKey(key: string): string {
  const d = parseKey(key)
  d.setDate(d.getDate() - 1)
  return dayKey(d)
}

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
  const yesterday = yesterdayKey()

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
      cursor = prevDayKey(cursor)
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
      if (prev === null || prevDayKey(prev) === key) {
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
