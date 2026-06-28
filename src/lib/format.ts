// Shared display formatters. Use these instead of page-local copies.

/** Seconds -> "m:ss" (e.g. 437 -> "7:17"). */
export function fmtDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

/** Local-calendar day key, 'YYYY-MM-DD'. */
export function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Today's local day key, 'YYYY-MM-DD'. */
export function todayKey(): string {
  return dayKey(new Date())
}

/** Parse a day key 'YYYY-MM-DD' back into a Date at local midnight. */
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Shift a day key by `deltaDays` (may be negative), local calendar. */
export function shiftDayKey(key: string, deltaDays: number): string {
  const d = parseDayKey(key)
  d.setDate(d.getDate() + deltaDays)
  return dayKey(d)
}

/** Friendly date + time, e.g. "Mon, Jun 9 · 7:42 AM". */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${date} · ${time}`
}

/** 'Today' / 'Yesterday' / "Mon, Jun 9" using local calendar days, not elapsed ms. */
export function formatRelativeDay(iso: string): string {
  const d = new Date(iso)
  const key = dayKey(d)
  const now = new Date()
  if (key === dayKey(now)) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (key === dayKey(yesterday)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
