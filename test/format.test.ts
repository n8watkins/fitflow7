import { describe, it, expect } from 'vitest'
import { fmtDuration, dayKey, formatRelativeDay } from '../src/lib/format'

describe('fmtDuration', () => {
  it('formats seconds as m:ss', () => {
    expect(fmtDuration(437)).toBe('7:17')
    expect(fmtDuration(0)).toBe('0:00')
    expect(fmtDuration(60)).toBe('1:00')
    expect(fmtDuration(5)).toBe('0:05')
  })
  it('clamps negatives and rounds fractional seconds', () => {
    expect(fmtDuration(-10)).toBe('0:00')
    expect(fmtDuration(89.6)).toBe('1:30')
  })
})

describe('dayKey', () => {
  it('zero-pads local Y-M-D', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(dayKey(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

describe('formatRelativeDay', () => {
  it('labels today and yesterday by calendar day', () => {
    const now = new Date()
    expect(formatRelativeDay(now.toISOString())).toBe('Today')

    const y = new Date(now)
    y.setDate(now.getDate() - 1)
    // local noon yesterday, so the ISO->local round-trip stays on the same day
    const yNoon = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 12, 0, 0)
    expect(formatRelativeDay(yNoon.toISOString())).toBe('Yesterday')
  })
  it('uses a weekday label for older dates', () => {
    const label = formatRelativeDay(new Date(2020, 0, 1, 12).toISOString())
    expect(label).not.toBe('Today')
    expect(label).not.toBe('Yesterday')
    expect(label.length).toBeGreaterThan(0)
  })
})
