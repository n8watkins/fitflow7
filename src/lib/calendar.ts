import type { Routine } from '../types'

// ---------------------------------------------------------------------------
// Calendar scheduling — standards-based, zero-backend. Builds an iCalendar
// (.ics) file and a Google Calendar template URL for a routine, so a user can
// drop a workout (optionally recurring weekly) onto any calendar — no OAuth,
// no API, no server. Pure functions; the DOM download lives in the UI.
// ---------------------------------------------------------------------------

export interface ScheduleOptions {
  /** Local start datetime chosen by the user. */
  start: Date
  /** Override the auto-estimated duration. */
  durationMinutes?: number
  /** Repeat every week on the same day/time. */
  repeatWeekly?: boolean
}

const APP_URL = 'https://fitflow7.vercel.app'

/** Rough workout length in minutes (>= 7), from the routine's timing. */
export function estimateMinutes(r: Routine): number {
  const seconds = r.exerciseIds.length * r.rounds * (r.workSeconds + r.restSeconds)
  return Math.max(7, Math.ceil(seconds / 60))
}

/** A Date as a UTC iCalendar timestamp: YYYYMMDDTHHMMSSZ. */
export function formatIcsDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  )
}

/** Escape text for an iCalendar value (RFC 5545). */
export function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** Fold a content line to 75 octets with space-prefixed continuations. */
function foldLine(line: string): string {
  if (line.length <= 75) return line
  const out: string[] = [line.slice(0, 75)]
  let rest = line.slice(75)
  while (rest.length > 0) {
    out.push(' ' + rest.slice(0, 74))
    rest = rest.slice(74)
  }
  return out.join('\r\n')
}

function describe(r: Routine, minutes: number): string {
  return (
    `${r.exerciseIds.length} exercises · ${r.workSeconds}s work / ${r.restSeconds}s rest · ` +
    `${r.rounds} round${r.rounds === 1 ? '' : 's'} · ~${minutes} min. ` +
    `Start it: ${APP_URL}/workout/${r.id}`
  )
}

/** Builds a valid VCALENDAR/VEVENT string for the routine. */
export function buildIcs(routine: Routine, opts: ScheduleOptions): string {
  const minutes = opts.durationMinutes ?? estimateMinutes(routine)
  const end = new Date(opts.start.getTime() + minutes * 60_000)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FitFlow 7//Workout//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@fitflow7`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(opts.start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(`${routine.name} — FitFlow 7`)}`,
    `DESCRIPTION:${escapeIcsText(describe(routine, minutes))}`,
    // FREQ=WEEKLY (no BYDAY) recurs on DTSTART's weekday — avoids UTC/local skew.
    ...(opts.repeatWeekly ? ['RRULE:FREQ=WEEKLY'] : []),
    'BEGIN:VALARM',
    'TRIGGER:-PT10M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Workout reminder',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(foldLine).join('\r\n')
}

/** Builds a Google Calendar "create event" template URL. */
export function buildGoogleCalendarUrl(routine: Routine, opts: ScheduleOptions): string {
  const minutes = opts.durationMinutes ?? estimateMinutes(routine)
  const end = new Date(opts.start.getTime() + minutes * 60_000)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${routine.name} — FitFlow 7`,
    dates: `${formatIcsDate(opts.start)}/${formatIcsDate(end)}`,
    details: describe(routine, minutes),
  })
  if (opts.repeatWeekly) params.set('recur', 'RRULE:FREQ=WEEKLY')
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
