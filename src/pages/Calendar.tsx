import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useSyncStore } from '../store/syncStore'
import { getSessions } from '../lib/storage'
import { dayKey, fmtDuration } from '../lib/format'
import type { WorkoutSession } from '../types'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// ---------------------------------------------------------------------------
// Pure calendar math (local time, Sunday-start)
// ---------------------------------------------------------------------------

/** Day cells for a month, Sunday-start, padded with nulls to whole weeks. */
function monthMatrix(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1)
  const startPad = first.getDay() // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

/** The last `n` { year, month } pairs, oldest -> newest, ending this month. */
function lastNMonths(n: number): { year: number; month: number }[] {
  const now = new Date()
  const out: { year: number; month: number }[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push({ year: d.getFullYear(), month: d.getMonth() })
  }
  return out
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Calendar() {
  const location = useLocation()
  const dataVersion = useSyncStore((s) => s.dataVersion)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sessions = useMemo(() => getSessions(), [location.key, dataVersion])

  // date -> sessions that started that local day
  const byDay = useMemo(() => {
    const m = new Map<string, WorkoutSession[]>()
    for (const s of sessions) {
      const k = dayKey(new Date(s.startedAt))
      const arr = m.get(k)
      if (arr) arr.push(s)
      else m.set(k, [s])
    }
    return m
  }, [sessions])

  const today = new Date()
  const todayKey = dayKey(today)
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [selected, setSelected] = useState<string | null>(todayKey)

  const cells = monthMatrix(view.year, view.month)
  const monthWorkouts = cells.reduce(
    (sum, c) => sum + (c ? (byDay.get(dayKey(c))?.length ?? 0) : 0),
    0,
  )

  function shift(delta: number) {
    const d = new Date(view.year, view.month + delta, 1)
    setView({ year: d.getFullYear(), month: d.getMonth() })
  }

  const selectedSessions = selected ? byDay.get(selected) ?? [] : []

  // Build the 12 month-matrices once per data change, not every render.
  const last12 = useMemo(
    () =>
      lastNMonths(12).map(({ year, month }) => {
        const mCells = monthMatrix(year, month)
        const total = mCells.reduce(
          (sum, c) => sum + (c ? (byDay.get(dayKey(c))?.length ?? 0) : 0),
          0,
        )
        return { year, month, mCells, total }
      }),
    [byDay],
  )

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Calendar</h1>
        <p className="mt-1 text-sm text-slate-500">Your workout days. Tap a day to see what you did.</p>
      </div>

      {/* Month navigator */}
      <section className="rounded-2xl border border-edge bg-card p-3 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => shift(-1)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-edge bg-card px-3 py-1.5 text-slate-300 transition hover:bg-card-hover active:bg-card-hover"
            aria-label="Previous month"
          >
            ‹
          </button>
          <div className="text-center">
            <div className="font-semibold text-slate-100">
              {MONTHS[view.month]} {view.year}
            </div>
            <div className="text-xs text-slate-500">
              {monthWorkouts} workout{monthWorkouts === 1 ? '' : 's'}
            </div>
          </div>
          <button
            onClick={() => shift(1)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-edge bg-card px-3 py-1.5 text-slate-300 transition hover:bg-card-hover active:bg-card-hover"
            aria-label="Next month"
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {WEEKDAYS.map((w, i) => (
            <div key={i} className="pb-1 text-center text-xs font-medium text-slate-500">
              {w}
            </div>
          ))}
          {cells.map((cell, i) => {
            if (!cell) return <div key={i} />
            const k = dayKey(cell)
            const count = byDay.get(k)?.length ?? 0
            const isToday = k === todayKey
            const isSelected = k === selected
            return (
              <button
                key={i}
                onClick={() => setSelected(k)}
                className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border text-sm transition active:scale-95 ${
                  count > 0
                    ? 'border-accent/40 bg-accent/15 text-slate-100 hover:bg-accent/25'
                    : 'border-edge bg-surface text-slate-400 hover:bg-card-hover'
                } ${isSelected ? 'ring-2 ring-accent' : ''} ${isToday ? 'font-bold text-accent' : ''}`}
              >
                <span>{cell.getDate()}</span>
                {count > 0 && (
                  <span className="absolute bottom-1 flex gap-0.5">
                    {Array.from({ length: Math.min(count, 3) }).map((_, d) => (
                      <span key={d} className="h-1 w-1 rounded-full bg-accent" />
                    ))}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </section>

      {/* Selected-day detail */}
      {selected && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">
            {new Date(selected + 'T00:00:00').toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </h2>
          {selectedSessions.length === 0 ? (
            <p className="rounded-2xl border border-edge bg-card px-5 py-4 text-sm text-slate-400">
              No workouts on this day.
            </p>
          ) : (
            <div className="space-y-2">
              {selectedSessions.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-edge bg-card px-5 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-100">{s.routineName}</div>
                    <div className="mt-0.5 text-sm text-slate-400">
                      {new Date(s.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-4 text-sm text-slate-400">
                    <span className="font-medium tabular-nums text-slate-200">{fmtDuration(s.durationSeconds)}</span>
                    {s.completed ? (
                      <span className="rounded-full border border-emerald-800 bg-emerald-950 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                        ✓ completed
                      </span>
                    ) : (
                      <span className="rounded-full border border-amber-800 bg-amber-950 px-2.5 py-0.5 text-xs font-medium text-amber-400">
                        ended early
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Last 12 months overview */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">Last 12 months</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {last12.map(({ year, month, mCells, total }) => {
            return (
              <button
                key={`${year}-${month}`}
                onClick={() => {
                  setView({ year, month })
                  setSelected(null)
                }}
                className="rounded-2xl border border-edge bg-card p-3 text-left transition hover:bg-card-hover"
              >
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-xs font-semibold text-slate-200">
                    {MONTHS_SHORT[month]} <span className="text-slate-500">{String(year).slice(2)}</span>
                  </span>
                  <span className="text-[10px] text-slate-500">{total}</span>
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {mCells.map((c, i) =>
                    c ? (
                      <span
                        key={i}
                        className={`aspect-square rounded-[2px] ${
                          (byDay.get(dayKey(c))?.length ?? 0) > 0 ? 'bg-accent' : 'bg-surface'
                        }`}
                        title={`${dayKey(c)}: ${byDay.get(dayKey(c))?.length ?? 0}`}
                      />
                    ) : (
                      <span key={i} />
                    ),
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
