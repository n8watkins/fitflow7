import { useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CLASSIC_7 } from '../data/routines'
import { getLastRoutineId, getRoutine, getRoutines, getSessions } from '../lib/storage'
import { computeStats } from '../lib/stats'
import { formatRelativeDay } from '../lib/format'

function routineSubtitle(r: { exerciseIds: string[]; workSeconds: number; restSeconds: number; rounds: number }): string {
  return `${r.exerciseIds.length} exercises · ${r.workSeconds}s work / ${r.restSeconds}s rest · ${r.rounds} round${r.rounds > 1 ? 's' : ''}`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatTile({ label, value, hero }: { label: string; value: string | number; hero?: boolean }) {
  return (
    <div className={`bg-card rounded-2xl p-5 flex flex-col gap-1 border border-edge ${hero ? 'col-span-2 sm:col-span-1' : ''}`}>
      <span className={`font-bold tabular-nums leading-none ${hero ? 'text-5xl text-accent' : 'text-3xl text-slate-100'}`}>
        {value}
      </span>
      <span className="text-sm text-slate-400">{label}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const location = useLocation()

  // Re-read localStorage on every navigation (location.key changes per visit)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sessions = useMemo(() => getSessions(), [location.key])
  const stats = useMemo(() => computeStats(sessions), [sessions])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allRoutines = useMemo(() => [CLASSIC_7, ...getRoutines()], [location.key])
  const lastRoutine = useMemo(() => {
    const lastRoutineId = getLastRoutineId()
    return lastRoutineId && lastRoutineId !== 'classic-7'
      ? getRoutine(lastRoutineId)
      : undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  // Last workout info
  const lastSession = sessions.find((s) => s.completed)

  return (
    <div className="space-y-10">
      {/* ------------------------------------------------------------------ */}
      {/* Hero row                                                             */}
      {/* ------------------------------------------------------------------ */}
      <section className="flex flex-wrap items-center gap-4">
        <Link
          to="/workout/classic-7"
          className="inline-flex items-center gap-2 rounded-2xl bg-accent px-8 py-4 text-lg font-bold text-slate-900 shadow-lg transition hover:brightness-110 active:scale-95"
        >
          <span className="text-2xl">▶</span>
          Start Classic 7
        </Link>

        {lastRoutine && (
          <Link
            to={`/workout/${lastRoutine.id}`}
            className="inline-flex items-center gap-2 rounded-2xl border border-edge bg-card px-6 py-4 text-base font-semibold text-slate-200 transition hover:bg-card-hover active:scale-95"
          >
            <span className="text-xl">▶</span>
            Start Last: {lastRoutine.name}
          </Link>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Stats grid                                                           */}
      {/* ------------------------------------------------------------------ */}
      {stats.totalWorkouts === 0 ? (
        <section className="rounded-2xl border border-edge bg-card p-10 text-center">
          <div className="mb-3 text-5xl">🔥</div>
          <h2 className="mb-1 text-xl font-semibold text-slate-100">Your first 7 minutes start now</h2>
          <p className="text-slate-400">Complete your first workout to see stats here.</p>
        </section>
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">Progress</h2>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {/* Streak hero tile */}
            <div className="col-span-2 flex items-center gap-5 rounded-2xl border border-edge bg-card p-5 sm:col-span-1 lg:col-span-1">
              <span className="text-5xl">🔥</span>
              <div>
                <div className="text-5xl font-bold tabular-nums leading-none text-accent">
                  {stats.currentStreak}
                </div>
                <div className="mt-1 text-sm text-slate-400">
                  day streak
                </div>
              </div>
            </div>

            <StatTile label="longest streak" value={`${stats.longestStreak}d`} />
            <StatTile label="total workouts" value={stats.totalWorkouts} />
            <StatTile label="this week" value={stats.workoutsThisWeek} />
            <StatTile label="total minutes" value={stats.totalMinutes} />
          </div>

          {lastSession && (
            <p className="text-sm text-slate-500">
              Last workout:{' '}
              <span className="text-slate-300">{lastSession.routineName}</span>
              {' · '}
              {formatRelativeDay(lastSession.startedAt)}
            </p>
          )}
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* My Routines                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">My Routines</h2>
          <Link
            to="/routines/new/edit"
            className="rounded-lg border border-edge bg-card px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-card-hover"
          >
            + New routine
          </Link>
        </div>

        <div className="space-y-2">
          {allRoutines.map((routine) => (
            <div
              key={routine.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-edge bg-card px-5 py-4 transition hover:bg-card-hover"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-100">{routine.name}</span>
                  {routine.isSystem && (
                    <span className="rounded-full border border-edge px-2 py-0.5 text-xs text-slate-500">
                      built-in
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-sm text-slate-400">{routineSubtitle(routine)}</div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Link
                  to={`/workout/${routine.id}`}
                  className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-slate-900 transition hover:brightness-110 active:scale-95"
                >
                  Start
                </Link>
                <Link
                  to={`/routines/${routine.id}/edit`}
                  className="rounded-lg border border-edge bg-card px-4 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-card-hover"
                >
                  Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
