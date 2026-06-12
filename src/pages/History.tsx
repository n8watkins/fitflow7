import { getSessions } from '../lib/storage'
import { computeStats } from '../lib/stats'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(isoString: string): string {
  const d = new Date(isoString)
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-edge bg-card p-5">
      <span className="text-3xl font-bold tabular-nums leading-none text-slate-100">{value}</span>
      <span className="text-sm text-slate-400">{label}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function History() {
  const sessions = getSessions()
  const stats = computeStats(sessions)

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Workout History</h1>
        <p className="mt-1 text-sm text-slate-500">All your workouts, newest first.</p>
      </div>

      {/* Summary tiles */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="total workouts" value={stats.totalWorkouts} />
        <SummaryTile label="total minutes" value={stats.totalMinutes} />
        <SummaryTile label="this week" value={stats.workoutsThisWeek} />
        <SummaryTile label="this month" value={stats.workoutsThisMonth} />
      </section>

      {/* Session list */}
      {sessions.length === 0 ? (
        <section className="rounded-2xl border border-edge bg-card p-10 text-center">
          <div className="mb-3 text-5xl">📋</div>
          <h2 className="mb-1 text-xl font-semibold text-slate-100">No workouts yet</h2>
          <p className="text-slate-400">Complete your first workout and it will appear here.</p>
        </section>
      ) : (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">Sessions</h2>

          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-edge bg-card px-5 py-4 transition hover:bg-card-hover"
            >
              {/* Date + name */}
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-100">{session.routineName}</div>
                <div className="mt-0.5 text-sm text-slate-400">{formatDateTime(session.startedAt)}</div>
              </div>

              {/* Stats */}
              <div className="flex shrink-0 flex-wrap items-center gap-4 text-sm text-slate-400">
                <span className="tabular-nums text-slate-200 font-medium">
                  {formatDuration(session.durationSeconds)}
                </span>
                <span>
                  {session.exercisesCompleted}/{session.totalExercises} exercises
                </span>

                {session.completed ? (
                  <span className="flex items-center gap-1 rounded-full border border-emerald-800 bg-emerald-950 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                    <span>✓</span> completed
                  </span>
                ) : (
                  <span className="rounded-full border border-amber-800 bg-amber-950 px-2.5 py-0.5 text-xs font-medium text-amber-400">
                    ended early
                  </span>
                )}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
