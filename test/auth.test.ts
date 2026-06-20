import { describe, it, expect } from 'vitest'
import { sanitizeReturnTo } from '../api/_lib/auth'

describe('sanitizeReturnTo (open-redirect guard)', () => {
  it('allows same-origin absolute paths', () => {
    expect(sanitizeReturnTo('/settings')).toBe('/settings')
    expect(sanitizeReturnTo('/workout/classic-7')).toBe('/workout/classic-7')
    expect(sanitizeReturnTo('/a?b=1#c')).toBe('/a?b=1#c')
  })

  it('falls back to "/" for anything that could escape the origin', () => {
    const bad = [
      undefined,
      '',
      'evil',
      'https://evil.com',
      '//evil.com', // protocol-relative
      '/\\evil.com', // backslash
      '/\t//evil.com', // control char browsers may strip
      '/ /x', // whitespace
    ]
    for (const v of bad) {
      expect(sanitizeReturnTo(v as string | undefined)).toBe('/')
    }
  })
})
