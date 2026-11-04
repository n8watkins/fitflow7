import Dialog from './Dialog'

// For the few actions that cannot be undone (clearing all history): names what
// is lost, with the destructive button on the right in danger red.
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog open={open} onClose={onCancel} variant="narrow" labelledBy="confirm-title">
      <div className="p-6 pt-7">
        <h2 id="confirm-title" className="pr-8 text-lg font-bold text-slate-100">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-edge bg-card px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-card-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
