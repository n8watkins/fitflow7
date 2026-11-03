// The `?signin=<notice>` the OAuth callback adds when sign-in did not finish
// (worker/routes/auth/callback.ts). The app reads it once at startup, removes it
// from the address bar and shows a banner with a way to try again.

export type SignInNotice = 'expired' | 'cancelled' | 'failed' | 'unavailable' | 'not_allowed'

export interface SignInNoticeCopy {
  title: string
  body: string
  /** Whether a "Sign in again" button makes sense. */
  retry: boolean
}

export const SIGN_IN_NOTICES: Record<SignInNotice, SignInNoticeCopy> = {
  expired: {
    title: 'Sign-in didn’t finish',
    body: 'That sign-in link expired or was already used. Nothing changed, and your workouts on this device are safe.',
    retry: true,
  },
  cancelled: {
    title: 'Sign-in cancelled',
    body: 'You’re still signed out. The app works fully without an account.',
    retry: true,
  },
  failed: {
    title: 'Sign-in failed',
    body: 'We couldn’t confirm your account with the sign-in provider. Please try again.',
    retry: true,
  },
  unavailable: {
    title: 'Sign-in isn’t available right now',
    body: 'Your workouts still save on this device. Try again later.',
    retry: false,
  },
  not_allowed: {
    title: 'This account can’t sign in here',
    body: 'This deployment only accepts specific accounts. Your workouts still save on this device.',
    retry: false,
  },
}

export function parseSignInNotice(raw: string | null): SignInNotice | null {
  if (raw === null) return null
  return Object.hasOwn(SIGN_IN_NOTICES, raw) ? (raw as SignInNotice) : 'failed'
}

/** Reads `?signin=` from the current URL and removes it, so a reload or a shared
 *  link never shows the banner again. Call once, before the router mounts. */
export function takeSignInNotice(): SignInNotice | null {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)
  const notice = parseSignInNotice(url.searchParams.get('signin'))
  if (notice === null) return null
  url.searchParams.delete('signin')
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  return notice
}
