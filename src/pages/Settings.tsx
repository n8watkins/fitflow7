import { useEffect, useRef, useState } from 'react'
import { type UserSettings, DEFAULT_SETTINGS } from '../types'
import { getSettings, saveSettings } from '../lib/storage'

// ---------------------------------------------------------------------------
// Stepper input
// ---------------------------------------------------------------------------

interface StepperProps {
  label: string
  description?: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (v: number) => void
}

function Stepper({ label, description, value, min, max, step = 1, unit, onChange }: StepperProps) {
  function decrement() {
    onChange(Math.max(min, value - step))
  }
  function increment() {
    onChange(Math.min(max, value + step))
  }
  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const parsed = parseInt(e.target.value, 10)
    if (!isNaN(parsed)) {
      onChange(Math.min(max, Math.max(min, parsed)))
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="font-medium text-slate-200">{label}</div>
        {description && <div className="mt-0.5 text-sm text-slate-500">{description}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={decrement}
          disabled={value <= min}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge bg-card text-slate-300 transition hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <div className="flex w-20 items-center justify-center">
          <input
            type="number"
            value={value}
            min={min}
            max={max}
            onChange={handleInput}
            className="w-14 rounded-lg border border-edge bg-card px-2 py-1 text-center text-slate-100 tabular-nums focus:border-accent focus:outline-none"
          />
          {unit && <span className="ml-1 text-sm text-slate-500">{unit}</span>}
        </div>
        <button
          onClick={increment}
          disabled={value >= max}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge bg-card text-slate-300 transition hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Settings() {
  const [settings, setSettings] = useState<UserSettings>(() => getSettings())
  const [savedVisible, setSavedVisible] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-save whenever settings change (after initial mount)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    saveSettings(settings)

    // Show "Saved" flash
    setSavedVisible(true)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => setSavedVisible(false), 1800)
  }, [settings])

  function update<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  function handleClearHistory() {
    if (confirm('This will permanently delete all your workout history. This cannot be undone. Continue?')) {
      try {
        localStorage.removeItem('fitflow.sessions')
      } catch {
        // ignore
      }
    }
  }

  function handleResetDefaults() {
    setSettings(DEFAULT_SETTINGS)
  }

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Settings</h1>
          <p className="mt-1 text-sm text-slate-500">
            Defaults for new routines. Routines and history live only in this browser.
          </p>
        </div>
        <span
          className={`mt-1 rounded-full border border-emerald-800 bg-emerald-950 px-3 py-1 text-sm font-medium text-emerald-400 transition-opacity duration-300 ${savedVisible ? 'opacity-100' : 'opacity-0'}`}
          aria-live="polite"
        >
          Saved
        </span>
      </div>

      {/* Workout defaults */}
      <section>
        <div className="rounded-2xl border border-edge bg-card">
          <div className="border-b border-edge px-5 py-4">
            <h2 className="font-semibold text-slate-200">Workout Defaults</h2>
            <p className="mt-0.5 text-sm text-slate-500">Applied when creating a new routine.</p>
          </div>

          <div className="divide-y divide-edge px-5">
            <Stepper
              label="Work duration"
              description="Seconds of activity per exercise"
              value={settings.defaultWorkSeconds}
              min={10}
              max={120}
              step={5}
              unit="s"
              onChange={(v) => update('defaultWorkSeconds', v)}
            />
            <Stepper
              label="Rest duration"
              description="Seconds of rest between exercises"
              value={settings.defaultRestSeconds}
              min={0}
              max={60}
              step={5}
              unit="s"
              onChange={(v) => update('defaultRestSeconds', v)}
            />
            <Stepper
              label="Rounds"
              description="How many times to repeat the exercise list"
              value={settings.defaultRounds}
              min={1}
              max={5}
              onChange={(v) => update('defaultRounds', v)}
            />
            <Stepper
              label="Countdown"
              description="Prepare-phase seconds before the first exercise"
              value={settings.countdownSeconds}
              min={0}
              max={15}
              unit="s"
              onChange={(v) => update('countdownSeconds', v)}
            />
          </div>
        </div>
      </section>

      {/* Audio */}
      <section>
        <div className="rounded-2xl border border-edge bg-card">
          <div className="border-b border-edge px-5 py-4">
            <h2 className="font-semibold text-slate-200">Audio</h2>
          </div>
          <div className="px-5 py-3">
            <label className="flex cursor-pointer items-center justify-between gap-4 py-1">
              <div>
                <div className="font-medium text-slate-200">Audio cues</div>
                <div className="mt-0.5 text-sm text-slate-500">
                  Beep sounds for phase transitions and countdown
                </div>
              </div>
              <button
                role="switch"
                aria-checked={settings.audioCuesEnabled}
                onClick={() => update('audioCuesEnabled', !settings.audioCuesEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors focus:outline-none ${
                  settings.audioCuesEnabled
                    ? 'border-accent bg-accent'
                    : 'border-edge bg-card-hover'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    settings.audioCuesEnabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </label>
          </div>
        </div>
      </section>

      {/* Reset defaults */}
      <section>
        <div className="rounded-2xl border border-edge bg-card">
          <div className="border-b border-edge px-5 py-4">
            <h2 className="font-semibold text-slate-200">Reset</h2>
          </div>
          <div className="px-5 py-4">
            <button
              onClick={handleResetDefaults}
              className="rounded-lg border border-edge bg-card px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-card-hover"
            >
              Reset to defaults
            </button>
          </div>
        </div>
      </section>

      {/* Danger zone */}
      <section>
        <div className="rounded-2xl border border-red-900 bg-card">
          <div className="border-b border-red-900 px-5 py-4">
            <h2 className="font-semibold text-red-400">Danger Zone</h2>
          </div>
          <div className="px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="font-medium text-slate-200">Clear workout history</div>
                <div className="mt-0.5 text-sm text-slate-500">
                  Permanently deletes all session records. Routines are not affected.
                </div>
              </div>
              <button
                onClick={handleClearHistory}
                className="rounded-lg border border-red-800 bg-red-950 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-900 active:scale-95"
              >
                Clear history
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
