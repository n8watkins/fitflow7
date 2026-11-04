import { useEffect, useId, useRef, useState } from 'react'
import { logout } from '../lib/sync'
import { useSyncStore } from '../store/syncStore'
import { useUiStore } from '../store/uiStore'
import { SAVE_DOT } from '../lib/saveState'
import { useSaveState } from '../hooks/useSaveState'
import { IconUser } from './icons'

// The account control: an avatar (or a person icon for guests) with a dot for
// where your data is kept. It opens a menu with who is signed in, the save
// state in words, Settings, and Sign out (or Sign in, which opens the sign-in
// dialog). In the header on desktop; the last bottom tab on phones.
export default function AccountMenu({ variant = 'header' }: { variant?: 'header' | 'tab' }) {
  const user = useSyncStore((s) => s.user)
  const save = useSaveState()
  const openSettings = useUiStore((s) => s.openSettings)
  const setSignInOpen = useUiStore((s) => s.setSignInOpen)
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      const items = [...(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
      const at = items.indexOf(document.activeElement as HTMLElement)
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        items[(at + step + items.length) % items.length]?.focus()
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault()
        items[e.key === 'Home' ? 0 : items.length - 1]?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!save) return null

  const displayName = user ? (user.name ?? user.email ?? 'Signed in') : 'Not signed in'
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?'
  const dot = SAVE_DOT[save.kind]

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await logout()
    } finally {
      setSigningOut(false)
      setOpen(false)
    }
  }
  const run = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }

  const avatar = (
    <span
      className={`relative flex items-center justify-center rounded-full border border-edge bg-card font-semibold text-slate-200 ${
        variant === 'tab' ? 'h-6 w-6 text-[9px]' : 'h-9 w-9 text-xs'
      }`}
    >
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" referrerPolicy="no-referrer" />
      ) : user ? (
        <span aria-hidden="true">{initials}</span>
      ) : (
        <IconUser className={variant === 'tab' ? 'h-4 w-4' : 'h-5 w-5 text-slate-400'} />
      )}
      <span
        className={`absolute rounded-full border-2 border-surface ${dot} ${variant === 'tab' ? '-right-1 -bottom-1 h-2.5 w-2.5' : '-right-0.5 -bottom-0.5 h-3 w-3'}`}
        aria-hidden="true"
      />
    </span>
  )
  const item = 'block w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-card-hover focus-visible:bg-card-hover'

  return (
    <div ref={rootRef} className={`relative ${variant === 'tab' ? 'flex flex-1' : 'shrink-0'}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Account: ${displayName}, ${save.label.toLowerCase()}`}
        className={
          variant === 'tab'
            ? `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-xs font-medium transition-colors ${open ? 'text-accent' : 'text-slate-400'}`
            : 'rounded-full transition hover:opacity-90'
        }
      >
        {avatar}
        {variant === 'tab' && <span>{user ? 'You' : 'Account'}</span>}
        <span className="sr-only" data-testid="save-status" data-kind={save.kind}>
          {save.label}
        </span>
      </button>

      {open && (
        <div
          id={panelId}
          ref={panelRef}
          role="menu"
          aria-label="Account"
          className={`absolute z-50 w-72 rounded-2xl border border-edge bg-card p-2 shadow-xl shadow-black/40 light:shadow-slate-300/60 ${
            variant === 'tab' ? 'right-2 bottom-full mb-2' : 'right-0 mt-2'
          }`}
        >
          <div className="px-3 pt-2 pb-3">
            <div className="truncate font-semibold text-slate-100">{displayName}</div>
            {user?.email && user.email !== displayName && <div className="truncate text-sm text-slate-400">{user.email}</div>}
            <p className="mt-2 flex items-start gap-2 text-xs text-slate-400" data-testid="save-status-menu">
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
              <span>{save.detail}</span>
            </p>
          </div>
          <div className="space-y-0.5 border-t border-edge pt-2">
            {!user && (
              <button type="button" role="menuitem" onClick={run(() => setSignInOpen(true))} className={`${item} font-semibold text-accent`}>
                Sign in
              </button>
            )}
            <button type="button" role="menuitem" onClick={run(() => openSettings(user ? 'account' : 'display'))} className={`${item} text-slate-200`}>
              Settings
            </button>
            {user && (
              <button
                type="button"
                role="menuitem"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
                className={`${item} font-medium text-red-400 disabled:opacity-60 light:text-red-600`}
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
