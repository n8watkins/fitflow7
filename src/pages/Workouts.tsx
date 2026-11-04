import { Link } from 'react-router-dom'
import { useLiveData } from '../hooks/useLiveData'
import { SYSTEM_ROUTINES } from '../data/routines'
import { getRoutines } from '../lib/storage'
import { estimateMinutes } from '../lib/workout'
import ScheduleWorkout from '../components/ScheduleWorkout'
import { IconPlus } from '../components/icons'

// Every workout: the built-in ones and your own, with Start, Edit and Schedule.
// Lives in Library so Today stays short.
export default function Workouts() {
  const userRoutines = useLiveData(() => getRoutines())
  const all = [...userRoutines, ...SYSTEM_ROUTINES]

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Workouts</h1>
          <p className="mt-1 text-sm text-slate-500">
            {userRoutines.length === 0 ? 'Built-in workouts. Make your own from any mix of moves.' : `${userRoutines.length} of yours and ${SYSTEM_ROUTINES.length} built in.`}
          </p>
        </div>
        <Link
          to="/routines/new/edit"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:brightness-110 active:scale-[0.97]"
        >
          <IconPlus className="h-4 w-4" /> New workout
        </Link>
      </div>

      <ul className="grid gap-3 lg:grid-cols-2">
        {all.map((routine) => (
          <li key={routine.id} className="flex items-center gap-3 rounded-2xl border border-edge bg-card px-4 py-3">
            <Link to={`/workout/${routine.id}`} className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold text-slate-100">{routine.name}</span>
                {routine.isSystem && (
                  <span className="shrink-0 rounded-full border border-edge px-2 py-0.5 text-[10px] text-slate-500">built-in</span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-slate-400">
                {routine.exerciseIds.length} exercises · about {estimateMinutes(routine)} min
              </div>
            </Link>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                to={`/workout/${routine.id}`}
                className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-slate-900 transition hover:brightness-110 active:scale-95"
              >
                Start
              </Link>
              <Link
                to={`/routines/${routine.id}/edit`}
                className="rounded-lg border border-edge bg-card px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-card-hover"
              >
                Edit
              </Link>
              <span className="hidden sm:block">
                <ScheduleWorkout routine={routine} />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
