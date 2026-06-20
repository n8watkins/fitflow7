import { describe, it, expect } from 'vitest'
import {
  buildIcs,
  buildGoogleCalendarUrl,
  formatIcsDate,
  escapeIcsText,
  estimateMinutes,
} from '../src/lib/calendar'
import type { Routine } from '../src/types'

const routine: Routine = {
  id: 'r1',
  name: 'Morning, Quick',
  exerciseIds: ['a', 'b', 'c'],
  workSeconds: 30,
  restSeconds: 10,
  rounds: 2,
  isSystem: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}
const start = new Date('2026-06-20T12:00:00Z')

describe('formatIcsDate', () => {
  it('emits a UTC iCal stamp', () => {
    expect(formatIcsDate(new Date('2026-06-20T12:34:56Z'))).toBe('20260620T123456Z')
  })
})

describe('escapeIcsText', () => {
  it('escapes backslash, comma, semicolon, newline', () => {
    expect(escapeIcsText('a, b; c\\d\ne')).toBe('a\\, b\\; c\\\\d\\ne')
  })
})

describe('estimateMinutes', () => {
  it('derives from timing with a 7-minute floor', () => {
    expect(estimateMinutes(routine)).toBe(7) // 3*2*40s = 240s -> floor 7
    expect(
      estimateMinutes({ ...routine, exerciseIds: Array(10).fill('x'), workSeconds: 40, restSeconds: 20, rounds: 3 }),
    ).toBe(30) // 10*3*60s = 1800s = 30min
  })
})

describe('buildIcs', () => {
  const ics = buildIcs(routine, { start })

  it('wraps a VEVENT in a VCALENDAR', () => {
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('END:VCALENDAR')
  })
  it('sets DTSTART to the given instant (UTC)', () => {
    expect(ics).toContain('DTSTART:20260620T120000Z')
  })
  it('escapes the summary', () => {
    expect(ics).toContain('SUMMARY:Morning\\, Quick — FitFlow 7')
  })
  it('adds RRULE only when repeating', () => {
    expect(ics).not.toContain('RRULE')
    expect(buildIcs(routine, { start, repeatWeekly: true })).toContain('RRULE:FREQ=WEEKLY')
  })
  it('uses CRLF line breaks', () => {
    expect(ics).toContain('\r\n')
  })
})

describe('buildGoogleCalendarUrl', () => {
  it('builds a Google Calendar template URL', () => {
    const url = buildGoogleCalendarUrl(routine, { start })
    expect(url.startsWith('https://calendar.google.com/calendar/render?')).toBe(true)
    expect(url).toContain('action=TEMPLATE')
    expect(url).toContain('20260620T120000Z')
  })
  it('adds recurrence when repeating', () => {
    expect(buildGoogleCalendarUrl(routine, { start, repeatWeekly: true })).toContain('recur=')
  })
})
