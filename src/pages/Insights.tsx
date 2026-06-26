import { useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useSyncStore } from '../store/syncStore'
import { getSessions } from '../lib/storage'
import { computeStats, computeInsights, type HeatmapDay } from '../lib/stats'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthNum = (key: string) => Number(key.split('-')[1])

// ---------------------------------------------------------------------------
// Hand-rolled SVG charts (no chart dependency)
// ---------------------------------------------------------------------------

function VBars({ data, ariaLabel }: { data: { label: string; value: number }[]; ariaLabel: string }) {
  const W = 680
  const H = 190
  const padT = 16
  const padB = 24
  const max = Math.max(1, ...data.map((d) => d.value))
  const n = data.length
  if (n === 0) return null
  const gap = 8
  const bw = (W - gap * (n - 1)) / n

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={ariaLabel}>
      {data.map((d, i) => {
        const barH = (d.value / max) * (H - padT - padB)
        const x = i * (bw + gap)
        const yTop = H - padB - barH
        const cx = x + bw / 2
        return (
          <g key={i}>
            <rect
              x={x}
              y={d.value ? yTop : H - padB - 2}
              width={bw}
              height={d.value ? barH : 2}
              rx={3}
              className="fill-accent"
              opacity={d.value ? 0.9 : 0.2}
            >
              <title>{`${d.label || `#${i + 1}`}: ${d.value}`}</title>
            </rect>
            {d.value > 0 && (
              <text x={cx} y={yTop - 5} textAnchor="middle" fontSize={14} className="fill-slate-300">
                {d.value}
              </text>
            )}
            {d.label && (
              <text x={cx} y={H - 8} textAnchor="middle" fontSize={14} className="fill-slate-500">
                {d.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function Heatmap({ days }: { days: HeatmapDay[] }) {
  const cell = 13
  const gap = 3
  const leftPad = 26
  const cols = Math.ceil(days.length / 7)
  const W = leftPad + cols * (cell + gap)
  const H = 7 * (cell + gap)
  const max = Math.max(1, ...days.map((d) => d.count))
  const rowLabels = ['Mon', '', 'Wed', '', 'Fri', '', '']

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-2xl" role="img" aria-label="Workout activity calendar">
      {rowLabels.map((lbl, r) =>
        lbl ? (
          <text key={r} x={0} y={r * (cell + gap) + cell - 2} fontSize={11} className="fill-slate-500">
            {lbl}
          </text>
        ) : null,
      )}
      {days.map((d, i) => {
        const col = Math.floor(i / 7)
        const row = i % 7
        const opacity = d.count === 0 ? 0.07 : 0.3 + 0.7 * (d.count / max)
        return (
          <rect
            key={d.date}
            x={leftPad + col * (cell + gap)}
            y={row * (cell + gap)}
            width={cell}
            height={cell}
            rx={2}
            className="fill-accent"
            opacity={opacity}
          >
            <title>{`${d.date}: ${d.count} workout${d.count === 1 ? '' : 's'}`}</title>
          </rect>
        )
      })}
    </svg>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">{title}</h2>
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Insights() {
  const location = useLocation()
  const dataVersion = useSyncStore((s) => s.dataVersion)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sessions = useMemo(() => getSessions(), [location.key, dataVersion])
  const stats = useMemo(() => computeStats(sessions), [sessions])
  const insights = useMemo(() => computeInsights(sessions), [sessions])

  if (stats.totalWorkouts === 0) {
    return (
      <div className="space-y-8">
        <Header />
        <section className="rounded-2xl border border-edge bg-card p-10 text-center">
          <div className="mb-3 text-5xl">📊</div>
          <h2 className="mb-1 text-xl font-semibold text-slate-100">No insights yet</h2>
          <p className="text-slate-400">Complete a workout and your trends will show up here.</p>
          <Link
            to="/workout/classic-7"
            className="mt-5 inline-block rounded-xl bg-accent px-5 py-2.5 font-semibold text-slate-900 transition hover:brightness-110"
          >
            Start Classic 7
          </Link>
        </section>
      </div>
    )
  }

  const weeklyData = insights.weekly.map((w, i, arr) => ({
    value: w.workouts,
    label: i === 0 || monthNum(w.weekStart) !== monthNum(arr[i - 1].weekStart) ? MONTHS[monthNum(w.weekStart) - 1] : '',
  }))
  const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const weekdayData = insights.weekdayCounts.map((value, i) => ({ value, label: weekdayLabels[i] }))
  const completionPct = Math.round(insights.completionRate * 100)
  const maxRoutine = Math.max(1, ...insights.topRoutines.map((r) => r.count))

  return (
    <div className="space-y-10">
      <Header />

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="total workouts" value={stats.totalWorkouts} />
        <StatTile label="total minutes" value={stats.totalMinutes} />
        <StatTile label="current streak" value={`${stats.currentStreak}d`} />
        <StatTile label="longest streak" value={`${stats.longestStreak}d`} />
        <StatTile label="completion rate" value={`${completionPct}%`} />
      </div>

      <Card title="Weekly activity (last 12 weeks)">
        <VBars data={weeklyData} ariaLabel="Workouts per week" />
      </Card>

      <Card title="Activity calendar">
        <Heatmap days={insights.heatmap} />
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <span>Less</span>
          {[0.07, 0.35, 0.6, 0.85, 1].map((o) => (
            <span key={o} className="inline-block h-3 w-3 rounded-sm fill-accent" style={{ backgroundColor: 'var(--color-accent)', opacity: o }} />
          ))}
          <span>More</span>
        </div>
      </Card>

      <div className="grid gap-10 lg:grid-cols-2">
        <Card title="By weekday">
          <VBars data={weekdayData} ariaLabel="Workouts by weekday" />
        </Card>

        <Card title="Top routines">
          <div className="space-y-3">
            {insights.topRoutines.map((r) => (
              <div key={r.name} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate text-slate-200">{r.name}</span>
                  <span className="tabular-nums text-slate-400">{r.count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(r.count / maxRoutine) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-100">Insights</h1>
      <p className="mt-1 text-sm text-slate-500">Your workout trends over time. Computed on this device from your history.</p>
    </div>
  )
}
