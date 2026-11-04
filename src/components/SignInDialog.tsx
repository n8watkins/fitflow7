import { loginWith } from '../lib/sync'
import { useSyncStore } from '../store/syncStore'
import { useUiStore } from '../store/uiStore'
import Dialog from './Dialog'

// Sign-in as a dialog over the current page: provider buttons, what happens to
// the data on this device, and a clear way to carry on without an account.
// After the provider, the app comes back to the page you were on.
export default function SignInDialog() {
  const open = useUiStore((s) => s.signInOpen)
  const setOpen = useUiStore((s) => s.setSignInOpen)
  const providers = useSyncStore((s) => s.providers)
  const label = (p: string) => (p === 'github' ? 'GitHub' : p === 'google' ? 'Google' : p)

  return (
    <Dialog open={open} onClose={() => setOpen(false)} variant="narrow" labelledBy="signin-title">
      <div className="p-6 pt-7">
        <h2 id="signin-title" className="text-xl font-bold text-slate-100">Sign in to FitFlow 7</h2>
        <p className="mt-2 text-sm text-slate-400">
          Keep your workouts, routines and settings in your account and on every device.
        </p>
        <div className="mt-5 space-y-2.5">
          {providers.length === 0 ? (
            <p className="rounded-xl border border-edge bg-surface px-4 py-3 text-sm text-slate-400">
              Sign-in isn’t available right now. Everything still saves on this device.
            </p>
          ) : (
            providers.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => loginWith(p as 'github' | 'google')}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-semibold text-slate-900 transition hover:brightness-110 active:scale-[0.98]"
              >
                Continue with {label(p)}
              </button>
            ))
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full rounded-xl border border-edge bg-card px-4 py-3 font-medium text-slate-300 transition hover:bg-card-hover"
          >
            Continue without an account
          </button>
        </div>
        <p className="mt-5 text-xs leading-relaxed text-slate-500">
          What you saved on this device is added to your account when you sign in, and what’s already in your account comes here.
          Without an account, everything stays in this browser.
        </p>
      </div>
    </Dialog>
  )
}
