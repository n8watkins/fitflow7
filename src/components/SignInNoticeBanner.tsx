import { SIGN_IN_NOTICES } from '../lib/signInNotice'
import { loginWith } from '../lib/sync'
import { useSyncStore } from '../store/syncStore'
import { IconClose } from './icons'

// Shown when the OAuth callback sent the browser back with ?signin=<notice>
// (a stale link, a cancelled consent, a provider error). Offers to sign in again
// right here instead of leaving the user on an error page.
export default function SignInNoticeBanner() {
  const notice = useSyncStore((s) => s.signInNotice)
  const user = useSyncStore((s) => s.user)
  const providers = useSyncStore((s) => s.providers)
  const setNotice = useSyncStore((s) => s.setSignInNotice)
  if (!notice || user) return null

  const copy = SIGN_IN_NOTICES[notice]
  const provider = providers.find((p) => p === 'github' || p === 'google') as 'github' | 'google' | undefined

  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-950/30 p-4 light:border-amber-300 light:bg-amber-50"
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-amber-200 light:text-amber-800">{copy.title}</p>
        <p className="mt-1 text-sm text-slate-300">{copy.body}</p>
        {copy.retry && provider && (
          <button
            type="button"
            onClick={() => {
              setNotice(null)
              loginWith(provider)
            }}
            className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-slate-900 transition hover:brightness-110 active:scale-95"
          >
            Sign in again
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => setNotice(null)}
        aria-label="Dismiss"
        className="-m-1 shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-card-hover hover:text-slate-200"
      >
        <IconClose className="h-5 w-5" />
      </button>
    </div>
  )
}
