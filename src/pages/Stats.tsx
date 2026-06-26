import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useSyncStore } from '../store/syncStore'
import {
  getBodyProfile,
  getSessions,
  getSettings,
  getWeightEntries,
  saveBodyProfile,
  saveWeightEntry,
  deleteWeightEntry,
} from '../lib/storage'
import { computeStats, statsForLastDays, workoutsLastNDays } from '../lib/stats'
import {
  bmiCategory,
  cmToFtIn,
  computeBmi,
  formatWeightDelta,
  ftInToCm,
  formatHeight,
  formatWeight,
  healthyWeightRangeKg,
  kgToLb,
  lbToKg,
  weightChangeKg,
  weightToGoalKg,
  weightUnitLabel,
} from '../lib/body'
import { dayKey } from '../lib/format'
import type { UnitSystem, WeightEntry } from '../types'

// ---------------------------------------------------------------------------
// Small shared building blocks (match the Insights/History visual language)
// ---------------------------------------------------------------------------

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
      </div>
      <div className="rounded-2xl border border-edge bg-card p-5">{children}</div>
    </section>
  )
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-edge bg-card p-5">
      <span className="text-3xl font-bold leading-none tabular-nums text-slate-100">{value}</span>
      <span className="text-sm text-slate-400">{label}</span>
    </div>
  )
}

const CAT_TEXT: Record<string, string> = {
  sky: 'text-sky-400',
  emerald: 'text-emerald-400',
  amber: 'text-amber-400',
  red: 'text-red-400',
  slate: 'text-slate-400',
}

// BMI category color zones across the 15–40 display scale.
const BMI_MIN = 15
const BMI_MAX = 40
// Each zone: [fromBMI, toBMI, colorClass]. Boundaries 18.5 / 25 / 30.
const ZONES: [number, number, string][] = [
  [BMI_MIN, 18.5, 'bg-sky-500/70'],
  [18.5, 25, 'bg-emerald-500/70'],
  [25, 30, 'bg-amber-500/70'],
  [30, BMI_MAX, 'bg-red-500/70'],
]

function BmiScale({ bmi }: { bmi: number }) {
  const pct = (v: number) => ((Math.min(BMI_MAX, Math.max(BMI_MIN, v)) - BMI_MIN) / (BMI_MAX - BMI_MIN)) * 100
  return (
    <div className="space-y-1.5">
      <div className="relative h-3 w-full overflow-hidden rounded-full">
        <div className="flex h-full w-full">
          {ZONES.map(([from, to, cls]) => (
            <div key={to} className={cls} style={{ width: `${pct(to) - pct(from)}%` }} />
          ))}
        </div>
        {bmi > 0 && (
          <div
            className="absolute top-1/2 h-5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-100 shadow ring-2 ring-surface"
            style={{ left: `${pct(bmi)}%` }}
          />
        )}
      </div>
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>15</span>
        <span>18.5</span>
        <span>25</span>
        <span>30</span>
        <span>40</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Unit-aware input helpers
// ---------------------------------------------------------------------------

/** Canonical kg -> the number shown in a weight input for the chosen unit. */
function weightToDisplay(kg: number, unit: UnitSystem): number {
  return Math.round((unit === 'imperial' ? kgToLb(kg) : kg) * 10) / 10
}
/** Input number (in display unit) -> canonical kg. */
function displayToKg(value: number, unit: UnitSystem): number {
  return unit === 'imperial' ? lbToKg(value) : value
}

function num(v: string): number {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Stats() {
  const location = useLocation()
  const dataVersion = useSyncStore((s) => s.dataVersion)
  // Local bump forces a storage re-read after our own writes.
  const [rev, setRev] = useState(0)
  const refresh = () => setRev((r) => r + 1)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const settings = useMemo(() => getSettings(), [rev, dataVersion])
  const unit = settings.unitSystem
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const profile = useMemo(() => getBodyProfile(), [rev, dataVersion, location.key])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weights = useMemo(() => getWeightEntries(), [rev, dataVersion, location.key])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sessions = useMemo(() => getSessions(), [rev, dataVersion, location.key])

  const latest = weights.length ? weights[weights.length - 1] : undefined
  const stats = useMemo(() => computeStats(sessions), [sessions])
  const last7 = useMemo(() => statsForLastDays(sessions, 7), [sessions])
  const last30 = useMemo(() => statsForLastDays(sessions, 30), [sessions])
  const last3 = useMemo(() => workoutsLastNDays(sessions, 3), [sessions])

  const currentBmi = latest && profile.heightCm ? computeBmi(latest.weightKg, profile.heightCm) : 0
  const cat = bmiCategory(currentBmi)

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Stats &amp; Body</h1>
        <p className="mt-1 text-sm text-slate-500">
          Track your weight, BMI, and workout activity. Stored on this device; switch units in Settings.
        </p>
      </div>

      {/* First-run prompt: no height + no weigh-ins yet. */}
      {!profile.heightCm && weights.length === 0 && (
        <div className="rounded-2xl border border-accent/30 bg-accent/10 p-4 text-sm text-slate-300">
          <span className="font-semibold text-slate-100">Set up your stats.</span> Add your height and a
          first weigh-in below to unlock BMI and weight trends. You're in{' '}
          <span className="font-medium text-accent">{unit === 'imperial' ? 'imperial (lb / ft·in)' : 'metric (kg / cm)'}</span>{' '}
          — <Link to="/settings" className="font-medium text-accent hover:underline">switch units</Link> any time.
        </div>
      )}

      {/* key on unit so the inputs re-seed (and re-convert) if units change. */}
      <BodySection key={unit} unit={unit} onChange={refresh} />

      {/* BMI from saved data */}
      <Card title="Body Mass Index">
        {currentBmi > 0 ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
              <div>
                <div className="text-5xl font-bold tabular-nums leading-none text-slate-100">
                  {currentBmi.toFixed(1)}
                </div>
                <div className={`mt-1 text-sm font-medium ${CAT_TEXT[cat.color]}`}>{cat.label}</div>
              </div>
              <div className="text-sm text-slate-400">
                from {formatWeight(latest!.weightKg, unit)} at {formatHeight(profile.heightCm!, unit)}
              </div>
            </div>
            <BmiScale bmi={currentBmi} />
            <HealthyRange heightCm={profile.heightCm!} goalKg={profile.goalWeightKg} unit={unit} />
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            Add your height and a weigh-in above to see your BMI.
          </p>
        )}
      </Card>

      {/* Re-key on saved stats so the calculator always pre-fills from the
          height + latest weigh-in you've entered (and re-converts on unit change). */}
      <BmiCalculator
        key={`${unit}|${profile.heightCm ?? ''}|${latest?.weightKg ?? ''}`}
        unit={unit}
        initialHeightCm={profile.heightCm}
        initialWeightKg={latest?.weightKg}
      />

      {/* Weight trend */}
      <Card title="Weight trend">
        <WeightSummary entries={weights} goalKg={profile.goalWeightKg} unit={unit} />
        {weights.length >= 2 ? (
          <WeightChart entries={weights} unit={unit} />
        ) : (
          <p className="text-sm text-slate-400">Log at least two weigh-ins to see your trend.</p>
        )}
        {weights.length > 0 && (
          <ul className="mt-4 divide-y divide-edge">
            {[...weights].reverse().slice(0, 8).map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-400">{e.date}</span>
                <span className="flex items-center gap-3">
                  <span className="font-medium tabular-nums text-slate-200">
                    {formatWeight(e.weightKg, unit)}
                  </span>
                  <button
                    onClick={() => {
                      deleteWeightEntry(e.id)
                      refresh()
                    }}
                    className="-m-1 p-2 text-xs text-slate-500 transition hover:text-red-400 active:scale-95"
                    aria-label={`Delete weigh-in from ${e.date}`}
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Workout activity windows */}
      <Card title="Workout activity">
        <div className="space-y-5">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Last 7 days</h3>
            <div className="grid grid-cols-3 gap-3">
              <StatTile label="workouts" value={last7.workouts} />
              <StatTile label="minutes" value={last7.minutes} />
              <StatTile label="active days" value={last7.activeDays} />
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Last 30 days</h3>
            <div className="grid grid-cols-3 gap-3">
              <StatTile label="workouts" value={last30.workouts} />
              <StatTile label="minutes" value={last30.minutes} />
              <StatTile label="active days" value={last30.activeDays} />
            </div>
          </div>
        </div>
      </Card>

      {/* Streaks */}
      <Card title="Streaks">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex items-center gap-3 rounded-2xl border border-edge bg-card p-5">
            <span className="text-4xl">🔥</span>
            <div>
              <div className="text-3xl font-bold tabular-nums leading-none text-accent">{stats.currentStreak}</div>
              <div className="mt-1 text-sm text-slate-400">current</div>
            </div>
          </div>
          <StatTile label="longest (max)" value={`${stats.longestStreak}d`} />
          <StatTile label="total workouts" value={stats.totalWorkouts} />
          <StatTile label="last 3 days" value={last3} />
        </div>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Body profile + add-weight form
// ---------------------------------------------------------------------------

function BodySection({ unit, onChange }: { unit: UnitSystem; onChange: () => void }) {
  const profile = getBodyProfile()
  const initFtIn = profile.heightCm ? cmToFtIn(profile.heightCm) : { feet: 5, inches: 8 }

  const [feet, setFeet] = useState(String(initFtIn.feet))
  const [inches, setInches] = useState(String(initFtIn.inches))
  const [cm, setCm] = useState(profile.heightCm ? String(Math.round(profile.heightCm)) : '')
  const [goal, setGoal] = useState(
    profile.goalWeightKg ? String(weightToDisplay(profile.goalWeightKg, unit)) : '',
  )
  const [weighIn, setWeighIn] = useState('')

  function saveHeight() {
    const heightCm = unit === 'imperial' ? ftInToCm(num(feet), num(inches)) : num(cm)
    if (heightCm <= 0) return
    saveBodyProfile({ heightCm })
    onChange()
  }
  function saveGoal() {
    const g = num(goal)
    saveBodyProfile({ goalWeightKg: g > 0 ? displayToKg(g, unit) : undefined })
    onChange()
  }
  function addWeight() {
    const w = num(weighIn)
    if (w <= 0) return
    saveWeightEntry(dayKey(new Date()), displayToKg(w, unit))
    setWeighIn('')
    onChange()
  }

  const input =
    'w-20 rounded-lg border border-edge bg-surface px-3 py-2 text-slate-100 outline-none focus:border-accent'
  const btn =
    'inline-flex min-h-11 items-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-slate-900 transition hover:brightness-110 active:scale-95'

  return (
    <Card title="Body" subtitle="Stored in your chosen units; BMI uses these.">
      <div className="grid gap-6 sm:grid-cols-3">
        {/* Height */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">Height</label>
          {unit === 'imperial' ? (
            <div className="flex items-center gap-2">
              <input className={input} type="number" min={0} value={feet} onChange={(e) => setFeet(e.target.value)} />
              <span className="text-sm text-slate-500">ft</span>
              <input className={input} type="number" min={0} max={11} value={inches} onChange={(e) => setInches(e.target.value)} />
              <span className="text-sm text-slate-500">in</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input className={input} type="number" min={0} value={cm} onChange={(e) => setCm(e.target.value)} />
              <span className="text-sm text-slate-500">cm</span>
            </div>
          )}
          <button onClick={saveHeight} className="inline-flex min-h-11 items-center text-xs font-medium text-accent hover:underline active:scale-95">
            Save height
          </button>
        </div>

        {/* Goal weight */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">Goal weight</label>
          <div className="flex items-center gap-2">
            <input className={input} type="number" min={0} value={goal} onChange={(e) => setGoal(e.target.value)} />
            <span className="text-sm text-slate-500">{weightUnitLabel(unit)}</span>
          </div>
          <button onClick={saveGoal} className="inline-flex min-h-11 items-center text-xs font-medium text-accent hover:underline active:scale-95">
            Save goal
          </button>
        </div>

        {/* Today's weigh-in */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">Add today's weight</label>
          <div className="flex items-center gap-2">
            <input
              className={input}
              type="number"
              min={0}
              value={weighIn}
              onChange={(e) => setWeighIn(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addWeight()}
            />
            <span className="text-sm text-slate-500">{weightUnitLabel(unit)}</span>
            <button onClick={addWeight} className={btn}>
              Add
            </button>
          </div>
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Healthy range + goal progress
// ---------------------------------------------------------------------------

/** Trailing weight deltas + distance to goal. Renders nothing with no data. */
function WeightSummary({ entries, goalKg, unit }: { entries: WeightEntry[]; goalKg?: number; unit: UnitSystem }) {
  const latest = entries.length ? entries[entries.length - 1] : undefined
  const change7 = weightChangeKg(entries, 7)
  const change30 = weightChangeKg(entries, 30)
  const toGoal = latest && goalKg ? weightToGoalKg(latest.weightKg, goalKg) : null

  const items: { label: string; value: string; tone: string }[] = []
  if (change7 !== null) items.push({ label: '7-day', value: formatWeightDelta(change7, unit), tone: 'text-slate-100' })
  if (change30 !== null) items.push({ label: '30-day', value: formatWeightDelta(change30, unit), tone: 'text-slate-100' })
  if (toGoal !== null) {
    const reached = Math.abs(toGoal) < 0.05
    items.push({
      label: 'to goal',
      value: reached ? 'Reached 🎉' : `${formatWeight(Math.abs(toGoal), unit)} ${toGoal > 0 ? 'to go' : 'under'}`,
      tone: reached ? 'text-emerald-400' : 'text-slate-100',
    })
  }
  if (items.length === 0) return null

  // Match the column count to the items so 1–2 entries don't leave an empty cell.
  const cols = items.length === 1 ? 'grid-cols-1' : items.length === 2 ? 'grid-cols-2' : 'grid-cols-3'

  return (
    <div className={`mb-4 grid ${cols} gap-3`}>
      {items.map((it) => (
        <div key={it.label} className="rounded-xl border border-edge bg-surface px-3 py-2.5 text-center">
          <div className={`text-base font-bold leading-tight tabular-nums ${it.tone}`}>{it.value}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">{it.label}</div>
        </div>
      ))}
    </div>
  )
}

function HealthyRange({ heightCm, goalKg, unit }: { heightCm: number; goalKg?: number; unit: UnitSystem }) {
  const { minKg, maxKg } = healthyWeightRangeKg(heightCm)
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-400">
      <span>
        Healthy range:{' '}
        <span className="text-slate-200">
          {formatWeight(minKg, unit)} – {formatWeight(maxKg, unit)}
        </span>
      </span>
      {goalKg ? (
        <span>
          Goal: <span className="text-slate-200">{formatWeight(goalKg, unit)}</span>
        </span>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Standalone BMI calculator (does not persist)
// ---------------------------------------------------------------------------

function BmiCalculator({
  unit,
  initialHeightCm,
  initialWeightKg,
}: {
  unit: UnitSystem
  initialHeightCm?: number
  initialWeightKg?: number
}) {
  const init = initialHeightCm ? cmToFtIn(initialHeightCm) : { feet: 5, inches: 8 }
  const [feet, setFeet] = useState(String(init.feet))
  const [inches, setInches] = useState(String(init.inches))
  const [cm, setCm] = useState(initialHeightCm ? String(Math.round(initialHeightCm)) : '170')
  const [weight, setWeight] = useState(
    initialWeightKg ? String(weightToDisplay(initialWeightKg, unit)) : '',
  )

  const heightCm = unit === 'imperial' ? ftInToCm(num(feet), num(inches)) : num(cm)
  const weightKg = displayToKg(num(weight), unit)
  const bmi = computeBmi(weightKg, heightCm)
  const cat = bmiCategory(bmi)

  const input =
    'w-20 rounded-lg border border-edge bg-surface px-3 py-2 text-slate-100 outline-none focus:border-accent'

  return (
    <Card title="BMI calculator" subtitle="Pre-filled from your saved height and latest weigh-in — tweak it for a what-if (nothing here is saved).">
      <div className="flex flex-wrap items-end gap-6">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">Height</label>
          {unit === 'imperial' ? (
            <div className="flex items-center gap-2">
              <input className={input} type="number" value={feet} onChange={(e) => setFeet(e.target.value)} />
              <span className="text-sm text-slate-500">ft</span>
              <input className={input} type="number" value={inches} onChange={(e) => setInches(e.target.value)} />
              <span className="text-sm text-slate-500">in</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input className={input} type="number" value={cm} onChange={(e) => setCm(e.target.value)} />
              <span className="text-sm text-slate-500">cm</span>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">Weight</label>
          <div className="flex items-center gap-2">
            <input className={input} type="number" value={weight} onChange={(e) => setWeight(e.target.value)} />
            <span className="text-sm text-slate-500">{weightUnitLabel(unit)}</span>
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-4xl font-bold tabular-nums leading-none text-slate-100">
            {bmi > 0 ? bmi.toFixed(1) : '—'}
          </div>
          <div className={`mt-1 text-sm font-medium ${CAT_TEXT[cat.color]}`}>{cat.label}</div>
        </div>
      </div>
      {bmi > 0 && (
        <div className="mt-4">
          <BmiScale bmi={bmi} />
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Weight trend SVG line chart
// ---------------------------------------------------------------------------

function WeightChart({ entries, unit }: { entries: WeightEntry[]; unit: UnitSystem }) {
  const data = entries.slice(-30)
  const values = data.map((e) => (unit === 'imperial' ? kgToLb(e.weightKg) : e.weightKg))
  const W = 680
  const H = 180
  const padX = 8
  const padY = 20
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const n = values.length
  const x = (i: number) => padX + (i / Math.max(1, n - 1)) * (W - padX * 2)
  const y = (v: number) => padY + (1 - (v - min) / span) * (H - padY * 2)
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Weight over time">
      <polyline points={points} fill="none" className="stroke-accent" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={3} className="fill-accent">
          <title>{`${data[i].date}: ${formatWeight(data[i].weightKg, unit)}`}</title>
        </circle>
      ))}
      <text x={padX} y={12} fontSize={11} className="fill-slate-500">
        {max.toFixed(1)} {weightUnitLabel(unit)}
      </text>
      <text x={padX} y={H - 4} fontSize={11} className="fill-slate-500">
        {min.toFixed(1)} {weightUnitLabel(unit)}
      </text>
    </svg>
  )
}
