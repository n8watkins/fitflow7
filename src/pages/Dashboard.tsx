import { useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useSyncStore } from '../store/syncStore'
import { CLASSIC_7, SYSTEM_ROUTINES } from '../data/routines'
import { CHALLENGE_MAP } from '../data/challenges'
import { EXERCISE_MAP } from '../data/exercises'
import {
  getChallengeProgressAll,
  getLastRoutineId,
  getLatestWeight,
  getRoutine,
  getRoutines,
  getSessions,
  getSettings,
} from '../lib/storage'
import { computeStats } from '../lib/stats'
import { formatWeight } from '../lib/body'
import ExerciseVisual from '../components/ExerciseVisual'
import ScheduleWorkout from '../components/ScheduleWorkout'
import type { Exercise, Routine } from '../types'

// ---------------------------------------------------------------------------
// Derivations
// ---------------------------------------------------------------------------

/** Rough wall-clock minutes for a routine (work + rest across all rounds). */
function estimateMinutes(r: Routine): number {
  const slots = r.exerciseIds.length * r.rounds
  const secs = slots * r.workSeconds + Math.max(0, slots - 1) * r.restSeconds
  return Math.max(1, Math.round(secs / 60))
}

/** The challenge to surface on the home page: an in-progress one, else null. */
function activeChallenge() {
  const progress = getChallengeProgressAll()
    .map((p) => {
      const c = CHALLENGE_MAP[p.challengeId]
      if (!c) return null
      const done = Object.keys(p.completedDays).length
      return { progress: p, challenge: c, done, total: c.days.length }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  if (progress.length === 0) return null
  // Prefer not-yet-complete, then most recently touched.
  progress.sort(
    (a, b) =>
      Number(a.done >= a.total) - Number(b.done >= b.total) ||
      (b.progress.updatedAt ?? '').localeCompare(a.progress.updatedAt ?? ''),
  )
  const best = progress[0]
  const nextDay = best.challenge.days.find((d) => d.routineId && !best.progress.completedDays[d.day])
  return { ...best, nextDay }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatChip({ to, value, label, icon }: { to: string; value: string | number; label: string; icon?: string }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center justify-center gap-0.5 rounded-2xl border border-edge bg-card px-2 py-4 text-center transition active:scale-95 hover:bg-card-hover"
    >
      <span className="text-2xl font-bold leading-none tabular-nums text-slate-100">
        {icon && <span className="mr-0.5">{icon}</span>}
        {value}
      </span>
      <span className="text-[11px] leading-tight text-slate-400">{label}</span>
    </Link>
  )
}

function ChallengeWidget() {
  const active = activeChallenge()

  if (!active) {
    return (
      <Link
        to="/challenges"
        className="flex items-center gap-4 rounded-2xl border border-accent/30 bg-accent/10 p-4 transition active:scale-[0.99]"
      >
        <span className="text-3xl">🏆</span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-100">Start a Challenge</div>
          <div className="text-sm text-slate-400">Take on the 30-Day Challenge and build the habit.</div>
        </div>
        <span className="shrink-0 text-accent">›</span>
      </Link>
    )
  }

  const { challenge, done, total, nextDay } = active
  const pct = total ? Math.round((done / total) * 100) : 0
  const href =
    nextDay?.routineId
      ? nextDay.rounds && nextDay.rounds > 1
        ? `/workout/${nextDay.routineId}?rounds=${nextDay.rounds}`
        : `/workout/${nextDay.routineId}`
      : '/challenges'

  return (
    <div className="rounded-2xl border border-edge bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <Link to="/challenges" className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">{challenge.icon}</span>
            <span className="truncate font-semibold text-slate-100">{challenge.name}</span>
          </div>
          <div className="mt-0.5 text-sm text-slate-400">
            Day {Math.min(done + 1, total)} of {total} · {done} done
          </div>
        </Link>
        <Link
          to={href}
          className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-slate-900 transition active:scale-95 hover:brightness-110"
        >
          {nextDay ? `Day ${nextDay.day}` : 'View'}
        </Link>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function OutlineRow({ index, exercise }: { index: number; exercise: Exercise }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-edge bg-card p-3">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface">
        <ExerciseVisual
          exercise={exercise}
          imgClassName="h-14 w-14 object-cover"
          emojiClassName="text-3xl leading-none"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-100">
          <span className="text-slate-500">{index + 1}.</span> {exercise.name}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-400">
          {exercise.instructions[0]}
        </p>
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const location = useLocation()
  const dataVersion = useSyncStore((s) => s.dataVersion)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sessions = useMemo(() => getSessions(), [location.key, dataVersion])
  const stats = useMemo(() => computeStats(sessions), [sessions])
  const settings = useMemo(() => getSettings(), [location.key, dataVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const latestWeight = useMemo(() => getLatestWeight(), [location.key, dataVersion])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const userRoutines = useMemo(() => getRoutines(), [location.key, dataVersion])

  // Featured workout: the last one played, else Classic 7.
  const featured = useMemo(() => {
    const lastId = getLastRoutineId()
    return (lastId && getRoutine(lastId)) || CLASSIC_7
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, dataVersion])

  // Unique exercises of the featured workout, in order, for the outline.
  const outline = useMemo(() => {
    const seen = new Set<string>()
    const list: Exercise[] = []
    for (const id of featured.exerciseIds) {
      if (seen.has(id)) continue
      seen.add(id)
      const ex = EXERCISE_MAP[id]
      if (ex) list.push(ex)
    }
    return list
  }, [featured])

  const allRoutines = [...SYSTEM_ROUTINES, ...userRoutines]
  const weightLabel = latestWeight ? formatWeight(latestWeight.weightKg, settings.unitSystem) : '—'

  return (
    <div className="space-y-6">
      {/* ---- Featured workout: big Start ---- */}
      <Link
        to={`/workout/${featured.id}`}
        className="block rounded-3xl bg-accent p-6 text-center text-slate-900 shadow-lg transition active:scale-[0.98] hover:brightness-105"
      >
        <div className="text-xs font-bold uppercase tracking-widest text-slate-900/70">
          {getLastRoutineId() && featured.id !== 'classic-7' ? 'Continue' : "Today's workout"}
        </div>
        <div className="mt-1 text-2xl font-extrabold">{featured.name}</div>
        <div className="mt-0.5 text-sm font-medium text-slate-900/80">
          {outline.length} exercises · ~{estimateMinutes(featured)} min
        </div>
        <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-900 px-7 py-3 text-base font-bold text-white">
          <span className="text-lg">▶</span> Start
        </span>
      </Link>

      {/* ---- Stat chips ---- */}
      <section className="grid grid-cols-3 gap-3">
        <StatChip to="/stats" icon="🔥" value={stats.currentStreak} label="day streak" />
        <StatChip to="/stats" value={weightLabel} label="weight" />
        <StatChip to="/history" value={stats.workoutsThisWeek} label="this week" />
      </section>

      {/* ---- Challenge progress / banner ---- */}
      <ChallengeWidget />

      {/* ---- Workout outline ---- */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">
            {featured.name} · outline
          </h2>
          <Link to="/library" className="text-xs font-medium text-accent hover:underline">
            All exercises
          </Link>
        </div>
        <ul className="space-y-2">
          {outline.map((ex, i) => (
            <OutlineRow key={ex.id} index={i} exercise={ex} />
          ))}
        </ul>
        <Link
          to={`/workout/${featured.id}`}
          className="block rounded-2xl border border-edge bg-card py-3 text-center text-sm font-semibold text-accent transition active:scale-[0.99] hover:bg-card-hover"
        >
          ▶ Start {featured.name}
        </Link>
      </section>

      {/* ---- All workouts ---- */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">All workouts</h2>
          <Link
            to="/routines/new/edit"
            className="rounded-lg border border-edge bg-card px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-card-hover"
          >
            + New
          </Link>
        </div>

        <div className="space-y-2">
          {allRoutines.map((routine) => (
            <div
              key={routine.id}
              className="flex items-center gap-3 rounded-2xl border border-edge bg-card px-4 py-3"
            >
              <Link to={`/workout/${routine.id}`} className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold text-slate-100">{routine.name}</span>
                  {routine.isSystem && (
                    <span className="shrink-0 rounded-full border border-edge px-2 py-0.5 text-[10px] text-slate-500">
                      built-in
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {routine.exerciseIds.length} exercises · ~{estimateMinutes(routine)} min
                </div>
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  to={`/workout/${routine.id}`}
                  className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-slate-900 transition active:scale-95 hover:brightness-110"
                >
                  Start
                </Link>
                <Link
                  to={`/routines/${routine.id}/edit`}
                  className="hidden rounded-lg border border-edge bg-card px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-card-hover sm:block"
                >
                  Edit
                </Link>
                <span className="hidden sm:block">
                  <ScheduleWorkout routine={routine} />
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
