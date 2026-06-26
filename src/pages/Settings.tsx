import { useEffect, useRef, useState } from 'react'
import { type ThemePref, type UserSettings, DEFAULT_SETTINGS } from '../types'
import {
  getSettings,
  getThemePref,
  saveSettings,
  setThemePref,
  clearSessions,
  exportData,
  importData,
  isExportBundle,
} from '../lib/storage'
import { applyTheme } from '../lib/theme'
import { dayKey } from '../lib/format'
import { useSyncStore } from '../store/syncStore'
import { loginWith, logout, requestAccessToken } from '../lib/sync'

// ---------------------------------------------------------------------------
// Account / cloud sync
// ---------------------------------------------------------------------------

function AccountSection() {
  const user = useSyncStore((s) => s.user)
  const authLoaded = useSyncStore((s) => s.authLoaded)
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt)
  const providers = useSyncStore((s) => s.providers)
  const [token, setToken] = useState<string | null>(null)
  const [tokenBusy, setTokenBusy] = useState(false)

  async function handleGenerateToken() {
    setTokenBusy(true)
    const t = await requestAccessToken()
    setTokenBusy(false)
    setToken(t ?? 'Could not create a token — try signing in again.')
  }

  return (
    <section>
      <div className="rounded-2xl border border-edge bg-card">
        <div className="border-b border-edge px-5 py-4">
          <h2 className="font-semibold text-slate-200">Account &amp; Sync</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Optional. Sign in to back up routines, history, and settings and sync across devices.
            The app works fully without an account.
          </p>
        </div>
        <div className="px-5 py-4">
          {!authLoaded ? (
            <div className="text-sm text-slate-500">Checking sign-in…</div>
          ) : user ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-200">
                    {user.name ?? user.email ?? 'Signed in'}
                  </div>
                  <div className="mt-0.5 text-sm text-slate-500">
                    {lastSyncedAt
                      ? `Last synced ${new Date(lastSyncedAt).toLocaleTimeString()}`
                      : 'Syncing…'}
                  </div>
                </div>
                <button
                  onClick={() => void logout()}
                  className="rounded-lg border border-edge bg-card px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-card-hover"
                >
                  Sign out
                </button>
              </div>

              {/* MCP access token */}
              <div className="border-t border-edge pt-4">
                <div className="font-medium text-slate-200">AI access token</div>
                <p className="mt-0.5 text-sm text-slate-500">
                  For the private MCP server, so an AI assistant can read your stats and log
                  workouts. Treat it like a password.
                </p>
                {token ? (
                  <textarea
                    readOnly
                    value={token}
                    onFocus={(e) => e.currentTarget.select()}
                    rows={3}
                    className="mt-3 w-full resize-none rounded-lg border border-edge bg-surface px-3 py-2 font-mono text-xs break-all text-slate-300 focus:border-accent focus:outline-none"
                  />
                ) : (
                  <button
                    onClick={() => void handleGenerateToken()}
                    disabled={tokenBusy}
                    className="mt-3 rounded-lg border border-edge bg-card px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-card-hover disabled:opacity-50"
                  >
                    {tokenBusy ? 'Generating…' : 'Generate access token'}
                  </button>
                )}
              </div>
            </div>
          ) : providers.length === 0 ? (
            <div className="text-sm text-slate-500">Sign-in isn’t available right now.</div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {providers.map((p) => (
                <button
                  key={p}
                  onClick={() => loginWith(p as 'github' | 'google')}
                  className="rounded-lg border border-edge bg-card px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-card-hover"
                >
                  Sign in with {p === 'github' ? 'GitHub' : p === 'google' ? 'Google' : p}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

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
  const [theme, setTheme] = useState<ThemePref>(() => getThemePref())
  const [savedVisible, setSavedVisible] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [importMsg, setImportMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const bumpData = useSyncStore((s) => s.bumpData)

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

  // Theme is a device-local display pref (not in UserSettings / not synced):
  // persist + apply to the DOM immediately so the switch is instant.
  function chooseTheme(pref: ThemePref) {
    setThemePref(pref)
    setTheme(pref)
    applyTheme(pref)
  }

  function handleClearHistory() {
    if (confirm('This will permanently delete all your workout history. This cannot be undone. Continue?')) {
      clearSessions()
    }
  }

  function handleResetDefaults() {
    setSettings(DEFAULT_SETTINGS)
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fitflow-backup-${dayKey(new Date())}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // let the same file be re-selected later
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed: unknown = JSON.parse(String(reader.result))
        if (!isExportBundle(parsed)) {
          setImportMsg({ text: 'That file is not a FitFlow backup.', ok: false })
          return
        }
        const result = importData(parsed)
        if (result.settings) setSettings(getSettings())
        bumpData() // refresh Dashboard/History reads
        const extras: string[] = []
        if (result.weightEntries) extras.push(`${result.weightEntries} weigh-in${result.weightEntries === 1 ? '' : 's'}`)
        if (result.challenges) extras.push(`${result.challenges} challenge${result.challenges === 1 ? '' : 's'}`)
        if (result.bodyProfile) extras.push('your body profile')
        setImportMsg({
          text: `Imported ${result.routines} routine${result.routines === 1 ? '' : 's'} and ${result.sessions} session${result.sessions === 1 ? '' : 's'}${extras.length ? `, plus ${extras.join(' and ')}` : ''}.`,
          ok: true,
        })
      } catch {
        setImportMsg({ text: 'Could not read that file.', ok: false })
      }
    }
    reader.readAsText(file)
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

      {/* Account & sync */}
      <AccountSection />

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

      {/* Appearance */}
      <section>
        <div className="rounded-2xl border border-edge bg-card">
          <div className="border-b border-edge px-5 py-4">
            <h2 className="font-semibold text-slate-200">Appearance</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Color theme. “System” follows your device setting. Saved on this device.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-5 py-4">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button
                key={t}
                onClick={() => chooseTheme(t)}
                aria-pressed={theme === t}
                className={`rounded-lg border px-4 py-2 text-sm font-medium capitalize transition ${
                  theme === t
                    ? 'border-accent bg-accent text-slate-900'
                    : 'border-edge bg-card text-slate-300 hover:bg-card-hover'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Units */}
      <section>
        <div className="rounded-2xl border border-edge bg-card">
          <div className="border-b border-edge px-5 py-4">
            <h2 className="font-semibold text-slate-200">Units</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Display units for weight, height, and BMI on the Stats page.
            </p>
          </div>
          <div className="flex items-center gap-2 px-5 py-4">
            {(['imperial', 'metric'] as const).map((u) => (
              <button
                key={u}
                onClick={() => update('unitSystem', u)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium capitalize transition ${
                  settings.unitSystem === u
                    ? 'border-accent bg-accent text-slate-900'
                    : 'border-edge bg-card text-slate-300 hover:bg-card-hover'
                }`}
              >
                {u === 'imperial' ? 'Imperial (lb, ft/in)' : 'Metric (kg, cm)'}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Data backup */}
      <section>
        <div className="rounded-2xl border border-edge bg-card">
          <div className="border-b border-edge px-5 py-4">
            <h2 className="font-semibold text-slate-200">Data</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Export a JSON backup of your routines, history, and settings, or restore one.
              Importing merges by most-recent edit and never overwrites newer data.
            </p>
          </div>
          <div className="px-5 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleExport}
                className="rounded-lg border border-edge bg-card px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-card-hover"
              >
                Export backup
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg border border-edge bg-card px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-card-hover"
              >
                Import backup
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleImportFile}
                className="hidden"
              />
              {importMsg && (
                <span
                  className={`text-sm ${importMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}
                  aria-live="polite"
                >
                  {importMsg.text}
                </span>
              )}
            </div>
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
