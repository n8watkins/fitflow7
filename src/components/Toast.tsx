import { useEffect } from 'react'
import { useUiStore } from '../store/uiStore'
import { IconClose } from './icons'

// Bottom toast for actions that can be taken back: "Routine deleted · Undo".
// It stays about six seconds (paused while hovered or focused); after that the
// change simply stands. Polite live region, so screen readers hear it without
// losing their place, and the Undo button is in the tab order.
const SHOW_MS = 6000

export default function ToastHost() {
  const toast = useUiStore((s) => s.toast)
  const dismiss = useUiStore((s) => s.dismissToast)

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => dismiss(toast.id), SHOW_MS)
    return () => clearTimeout(id)
  }, [toast, dismiss])

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[70] flex justify-center px-4 md:bottom-6"
    >
      {toast && (
        <div
          role="status"
          data-testid="toast"
          className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-edge bg-card px-4 py-3 text-sm text-slate-200 shadow-xl shadow-black/40 light:shadow-slate-300/60"
        >
          <span className="min-w-0 flex-1">{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                toast.undo?.()
                dismiss(toast.id)
              }}
              className="shrink-0 rounded-lg px-3 py-1.5 font-semibold text-accent transition hover:bg-accent/10"
            >
              Undo
            </button>
          )}
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            aria-label="Dismiss"
            className="-mr-1 shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-card-hover hover:text-slate-200"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
