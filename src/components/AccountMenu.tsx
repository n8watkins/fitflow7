import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { logout } from '../lib/sync'
import { useSyncStore } from '../store/syncStore'

// The signed-in user's button in the nav: their avatar (or initials) with a sync
// status dot. It opens a small panel with who is signed in, the sync state,
// a link to account settings and Sign out. Signed-out users see nothing here;
// sign-in lives in Settings.
export default function AccountMenu() {
  const user = useSyncStore((s) => s.user)
  const status = useSyncStore((s) => s.status)
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt)
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user) return null

  const displayName = user.name ?? user.email ?? 'Signed in'
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?'
  const dot = status === 'syncing' ? 'bg-amber-400' : status === 'error' ? 'bg-red-400' : 'bg-emerald-400'
  const statusText =
    status === 'syncing'
      ? 'Syncing…'
      : status === 'error'
        ? 'Sync error, retrying when you come back'
        : lastSyncedAt
          ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
          : 'Synced'
  const shortStatus = status === 'syncing' ? 'syncing' : status === 'error' ? 'sync error' : 'synced'

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await logout()
    } finally {
      setSigningOut(false)
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className="relative ml-auto shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Account: ${displayName}, ${shortStatus}`}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-edge bg-card text-xs font-semibold text-slate-200 transition hover:border-accent/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span aria-hidden="true">{initials}</span>
        )}
        <span
          className={`absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-surface ${dot}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-edge bg-card p-2 shadow-xl shadow-black/40 light:shadow-slate-300/60"
        >
          <div className="px-3 pt-2 pb-3">
            <div className="truncate font-semibold text-slate-100">{displayName}</div>
            {user.email && user.email !== displayName && (
              <div className="truncate text-sm text-slate-400">{user.email}</div>
            )}
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
              <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
              {statusText}
            </div>
          </div>
          <div className="border-t border-edge pt-2">
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-card-hover"
            >
              Account settings
            </Link>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-400 transition hover:bg-card-hover disabled:opacity-60 light:text-red-600"
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
