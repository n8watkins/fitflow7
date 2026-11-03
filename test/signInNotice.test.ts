import { describe, it, expect } from 'vitest'
import { SIGN_IN_NOTICES, parseSignInNotice } from '../src/lib/signInNotice'

describe('sign-in notice', () => {
  it('reads every notice the OAuth callback sends', () => {
    for (const notice of ['expired', 'cancelled', 'failed', 'unavailable', 'not_allowed'] as const) {
      expect(parseSignInNotice(notice)).toBe(notice)
      expect(SIGN_IN_NOTICES[notice].title).not.toBe('')
    }
  })

  it('treats an unknown value as a failed sign-in and no value as nothing to show', () => {
    expect(parseSignInNotice('something-else')).toBe('failed')
    expect(parseSignInNotice('toString')).toBe('failed')
    expect(parseSignInNotice(null)).toBeNull()
  })
})
