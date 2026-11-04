import { useEffect, useRef, type ReactNode } from 'react'
import { IconClose } from './icons'

// The one modal primitive, on the native <dialog> with showModal(): focus is
// trapped, Escape (and Android back) closes through onClose, the page behind
// does not scroll, and focus returns to whatever opened it.
export default function Dialog({
  open,
  onClose,
  title,
  children,
  variant = 'card',
  labelledBy,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** card: centered; narrow: small centered; sheet: full screen on phones. */
  variant?: 'card' | 'narrow' | 'sheet'
  labelledBy?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef<Element | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      opener.current = document.activeElement
      dialog.showModal()
      document.documentElement.style.overflow = 'hidden'
    } else if (!open && dialog.open) {
      dialog.close()
    }
    return () => {
      if (!open) return
      document.documentElement.style.overflow = ''
    }
  }, [open])

  function handleClose() {
    document.documentElement.style.overflow = ''
    if (opener.current instanceof HTMLElement) opener.current.focus()
    onClose()
  }

  const size =
    variant === 'sheet'
      ? 'h-full max-h-full w-full max-w-full rounded-none sm:h-[min(640px,88vh)] sm:max-w-3xl sm:rounded-[20px]'
      : variant === 'narrow'
        ? 'w-[calc(100%-2rem)] max-w-md rounded-[20px]'
        : 'w-[calc(100%-2rem)] max-w-xl rounded-[20px]'

  return (
    <dialog
      ref={ref}
      onClose={handleClose}
      onCancel={(e) => {
        e.preventDefault()
        handleClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) handleClose()
      }}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : title}
      className={`m-auto border border-edge bg-card p-0 text-slate-100 shadow-2xl shadow-black/50 backdrop:bg-black/60 light:shadow-slate-400/40 ${size}`}
    >
      {open && (
        <div className="relative flex h-full flex-col pb-[env(safe-area-inset-bottom)]">
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="absolute top-3 right-3 z-10 rounded-lg p-2 text-slate-400 transition hover:bg-card-hover hover:text-slate-200"
          >
            <IconClose className="h-5 w-5" />
          </button>
          {children}
        </div>
      )}
    </dialog>
  )
}
