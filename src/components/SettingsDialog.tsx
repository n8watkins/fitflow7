import { lazy, Suspense } from 'react'
import { useUiStore, type SettingsSection } from '../store/uiStore'
import Dialog from './Dialog'

const Settings = lazy(() => import('../pages/Settings'))

// Settings as one dialog, opened from anywhere (header gear, account menu,
// the save chip): a section list on the left on desktop, tabs across the top
// on phones, and a fixed height so switching sections never resizes it.
// Changes save as you go, with a "Saved" note at the top.
const SECTIONS: { id: SettingsSection; label: string; blurb: string }[] = [
  { id: 'account', label: 'Account', blurb: 'Sign-in, sync and where your data is kept.' },
  { id: 'training', label: 'Training', blurb: 'Your level, goal and four-week plan.' },
  { id: 'workout', label: 'Workout', blurb: 'Defaults for new routines.' },
  { id: 'audio', label: 'Audio', blurb: 'Beeps and the voice coach.' },
  { id: 'display', label: 'Display', blurb: 'Theme, units and exercise images.' },
  { id: 'data', label: 'Data', blurb: 'Backups, reset and clearing history.' },
]

export default function SettingsDialog() {
  const section = useUiStore((s) => s.settingsSection)
  const open = useUiStore((s) => s.openSettings)
  const close = useUiStore((s) => s.closeSettings)
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]

  return (
    <Dialog open={section !== null} onClose={close} variant="sheet" labelledBy="settings-title">
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <div className="shrink-0 border-b border-edge sm:w-52 sm:border-r sm:border-b-0">
          <h2 id="settings-title" className="px-5 pt-5 pb-3 text-lg font-bold text-slate-100">Settings</h2>
          <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto px-3 pb-3 sm:flex-col sm:overflow-visible">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-current={s.id === current.id ? 'page' : undefined}
                onClick={() => open(s.id)}
                className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                  s.id === current.id ? 'bg-accent/10 text-accent' : 'text-slate-400 hover:bg-card-hover hover:text-slate-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
          <div className="mb-5 pr-10">
            <h3 className="text-lg font-semibold text-slate-100">{current.label}</h3>
            <p className="mt-0.5 text-sm text-slate-500">{current.blurb}</p>
          </div>
          <Suspense fallback={<div className="h-40" role="status" aria-label="Loading" />}>
            <Settings section={current.id} embedded />
          </Suspense>
        </div>
      </div>
    </Dialog>
  )
}
