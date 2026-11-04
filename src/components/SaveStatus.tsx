import { useUiStore } from '../store/uiStore'
import { SAVE_DOT } from '../lib/saveState'
import { useSaveState } from '../hooks/useSaveState'

/** Small status chip for the header: where your data is kept right now.
 *  Opens the account settings, which explain it in full. */
export function SaveStatusChip({ compactBelowXl = false }: { compactBelowXl?: boolean }) {
  const state = useSaveState()
  const openSettings = useUiStore((s) => s.openSettings)
  if (!state) return null
  return (
    <button
      type="button"
      onClick={() => openSettings('account')}
      title={state.detail}
      aria-label={`${state.label}. ${state.detail}`}
      data-testid="save-status"
      data-kind={state.kind}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-edge py-1 text-xs font-medium text-slate-400 transition hover:border-accent/50 hover:text-slate-200 ${compactBelowXl ? 'px-2 xl:px-2.5' : 'px-2.5'}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${SAVE_DOT[state.kind]} ${state.kind === 'syncing' ? 'motion-safe:animate-pulse' : ''}`} aria-hidden="true" />
      <span className={compactBelowXl ? 'sr-only xl:not-sr-only' : undefined}>{state.label}</span>
    </button>
  )
}

/** One line with a dot: the full save state, for panels and the finish screen. */
export function SaveStatusLine({ className = '' }: { className?: string }) {
  const state = useSaveState()
  if (!state) return null
  return (
    <p className={`flex items-start gap-2 text-sm text-slate-400 ${className}`} role="status" data-testid="save-status-line" data-kind={state.kind}>
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SAVE_DOT[state.kind]}`} aria-hidden="true" />
      <span>{state.detail}</span>
    </p>
  )
}
