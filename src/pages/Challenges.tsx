import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useSyncStore } from '../store/syncStore'
import { CHALLENGES, CHALLENGE_MAP } from '../data/challenges'
import { SYSTEM_ROUTINES } from '../data/routines'
import {
  getChallengeProgressFor,
  markChallengeDay,
  resetChallenge,
  unmarkChallengeDay,
} from '../lib/storage'
import type { Challenge } from '../types'

const ROUTINE_NAME: Record<string, string> = Object.fromEntries(
  SYSTEM_ROUTINES.map((r) => [r.id, r.name]),
)

// ---------------------------------------------------------------------------
// Progress ring
// ---------------------------------------------------------------------------

function Ring({ pct, size = 72 }: { pct: number; size?: number }) {
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-edge" strokeWidth={6} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        className="stroke-accent"
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="fill-slate-100" fontSize={15} fontWeight="bold">
        {Math.round(pct * 100)}%
      </text>
    </svg>
  )
}

function completedCount(challengeId: string): number {
  const p = getChallengeProgressFor(challengeId)
  return p ? Object.keys(p.completedDays).length : 0
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Challenges() {
  const location = useLocation()
  const dataVersion = useSyncStore((s) => s.dataVersion)
  const [rev, setRev] = useState(0)
  const refresh = () => setRev((r) => r + 1)
  const [openId, setOpenId] = useState<string | null>(null)

  // List view — recompute counts on rev/dataVersion/navigation. Computed
  // unconditionally (before any early return) to satisfy the rules of hooks.
  const cards = useMemo(
    () =>
      CHALLENGES.map((c) => ({
        challenge: c,
        done: completedCount(c.id),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rev, dataVersion, location.key],
  )

  const open = openId ? CHALLENGE_MAP[openId] : undefined
  if (open) {
    return <ChallengeDetail challenge={open} onBack={() => setOpenId(null)} rev={rev} onChange={refresh} />
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Challenges</h1>
        <p className="mt-1 text-sm text-slate-500">
          Multi-day programs that string the workouts together. Tap one to see the plan.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map(({ challenge, done }) => {
          const total = challenge.days.length
          return (
            <button
              key={challenge.id}
              onClick={() => setOpenId(challenge.id)}
              className="flex items-center gap-4 rounded-2xl border border-edge bg-card p-5 text-left transition hover:bg-card-hover"
            >
              <span className="text-4xl">{challenge.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-100">{challenge.name}</div>
                <p className="mt-0.5 line-clamp-2 text-sm text-slate-400">{challenge.description}</p>
                <div className="mt-1 text-xs text-slate-500">
                  {done} / {total} days
                </div>
              </div>
              <Ring pct={total ? done / total : 0} size={56} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Challenge detail
// ---------------------------------------------------------------------------

function ChallengeDetail({
  challenge,
  onBack,
  rev,
  onChange,
}: {
  challenge: Challenge
  onBack: () => void
  rev: number
  onChange: () => void
}) {
  const progress = useMemo(
    () => getChallengeProgressFor(challenge.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [challenge.id, rev],
  )
  const completed = progress?.completedDays ?? {}
  const done = Object.keys(completed).length
  const total = challenge.days.length

  // The next day that has a workout and isn't done yet — the suggested pick.
  const nextDay = challenge.days.find((d) => d.routineId && !completed[d.day])

  function toggle(day: number) {
    if (completed[day]) unmarkChallengeDay(challenge.id, day)
    else markChallengeDay(challenge.id, day)
    onChange()
  }

  function handleReset() {
    if (confirm(`Reset your progress on "${challenge.name}"? This cannot be undone.`)) {
      resetChallenge(challenge.id)
      onChange()
    }
  }

  function workoutHref(routineId: string, rounds?: number): string {
    return rounds && rounds > 1 ? `/workout/${routineId}?rounds=${rounds}` : `/workout/${routineId}`
  }

  return (
    <div className="space-y-8">
      <button onClick={onBack} className="text-sm text-slate-400 transition hover:text-slate-200 active:scale-95">
        ‹ All challenges
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-center gap-5 rounded-2xl border border-edge bg-card p-5">
        <span className="text-5xl">{challenge.icon}</span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-slate-100">{challenge.name}</h1>
          <p className="mt-1 text-sm text-slate-400">{challenge.description}</p>
          <div className="mt-2 text-sm text-slate-300">
            <span className="font-semibold text-accent">{done}</span> of {total} days complete
          </div>
        </div>
        <Ring pct={total ? done / total : 0} />
      </div>

      {/* Suggested next day */}
      {nextDay?.routineId && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-accent/10 px-5 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-accent">Up next</div>
            <div className="mt-0.5 font-medium text-slate-100">
              Day {nextDay.day} · {ROUTINE_NAME[nextDay.routineId] ?? 'Workout'}
              {nextDay.rounds && nextDay.rounds > 1 ? ` · ×${nextDay.rounds}` : ''}
            </div>
          </div>
          <Link
            to={workoutHref(nextDay.routineId, nextDay.rounds)}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-slate-900 transition hover:brightness-110 active:scale-95"
          >
            Start day {nextDay.day}
          </Link>
        </div>
      )}

      {/* Day grid */}
      <div className="grid gap-2 sm:grid-cols-2">
        {challenge.days.map((d) => {
          const isDone = !!completed[d.day]
          const name = d.routineId ? ROUTINE_NAME[d.routineId] ?? 'Workout' : 'Rest'
          return (
            <div
              key={d.day}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition ${
                isDone ? 'border-accent/40 bg-accent/10' : 'border-edge bg-card'
              }`}
            >
              <button
                onClick={() => toggle(d.day)}
                aria-label={isDone ? `Mark day ${d.day} not done` : `Mark day ${d.day} done`}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-sm transition ${
                  isDone
                    ? 'border-accent bg-accent text-slate-900'
                    : 'border-edge text-slate-500 hover:border-slate-400'
                }`}
              >
                {isDone ? '✓' : ''}
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-100">Day {d.day}</div>
                <div className="truncate text-xs text-slate-400">
                  {name}
                  {d.label ? ` · ${d.label}` : ''}
                </div>
              </div>
              {d.routineId && (
                <Link
                  to={workoutHref(d.routineId, d.rounds)}
                  className="shrink-0 rounded-lg border border-edge bg-card px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-card-hover active:scale-95"
                >
                  Start
                </Link>
              )}
            </div>
          )
        })}
      </div>

      {done > 0 && (
        <button
          onClick={handleReset}
          className="rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-900/30 active:scale-95"
        >
          Reset progress
        </button>
      )}
    </div>
  )
}
