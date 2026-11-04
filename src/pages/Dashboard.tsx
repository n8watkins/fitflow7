import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useLiveData } from '../hooks/useLiveData'
import { CLASSIC_7, SYSTEM_ROUTINES } from '../data/routines'
import { CHALLENGE_MAP } from '../data/challenges'
import { EXERCISE_MAP } from '../data/exercises'
import {
  getChallengeProgressAll,
  getLastRoutineId,
  getLatestWeight,
  getLengthTimes,
  getTrainingProfile,
  getSkipDays,
  getRoutine,
  getRoutines,
  getSessions,
  getSettings,
  setLengthTimes,
} from '../lib/storage'
import { computeStats } from '../lib/stats'
import { formatWeight } from '../lib/body'
import ExerciseVisual from '../components/ExerciseVisual'
import ExerciseModal from '../components/ExerciseModal'
import ScheduleWorkout from '../components/ScheduleWorkout'
import { estimateMinutes, lengthPresets } from '../lib/workout'
import { planWorkout } from '../lib/plan'
import Onboarding from '../components/Onboarding'
import PlanCard from '../components/PlanCard'
import SkipDayPrompt from '../components/SkipDayPrompt'
import { challengeStatus } from '../lib/skipDays'
import { todayKey } from '../lib/format'
import { IconCalendar, IconChevronRight, IconFlame, IconPlay, IconPlus, IconScale } from '../components/icons'
import type { Exercise } from '../types'

// ---------------------------------------------------------------------------
// Derivations
// ---------------------------------------------------------------------------

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
  // Days covered by a skip day aren't "next" either.
  const skipped = challengeStatus(best.total, best.progress, getSkipDays(), todayKey()).skipped
  const nextDay = best.challenge.days.find((d) => d.routineId && !best.progress.completedDays[d.day] && !skipped.has(d.day))
  return { ...best, nextDay }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatChip({
  to,
  value,
  label,
  icon,
  tint,
  accent,
}: {
  to: string
  value: string | number
  label: string
  icon: ReactNode
  tint: string
  /** Color the value with the accent (used for empty-state call-to-action chips). */
  accent?: boolean
}) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-edge bg-card px-2 py-4 text-center transition active:scale-95 hover:bg-card-hover"
    >
      <span className={`flex h-8 w-8 items-center justify-center rounded-full ${tint}`}>{icon}</span>
      <span className={`text-lg font-bold leading-none tabular-nums ${accent ? 'text-accent' : 'text-slate-100'}`}>{value}</span>
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
        className="flex items-center gap-4 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-4 transition active:scale-[0.99] hover:bg-violet-500/15"
      >
        <span className="text-3xl">🏆</span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-100">Start a Challenge</div>
          <div className="text-sm text-slate-400">Take on the 30-Day Challenge and build the habit.</div>
        </div>
        <IconChevronRight className="h-5 w-5 shrink-0 text-violet-400" />
      </Link>
    )
  }

  const { challenge, done, total, nextDay } = active
  const pct = total ? Math.round((done / total) * 100) : 0
  let href = '/challenges'
  if (nextDay?.routineId) {
    const params = new URLSearchParams()
    if (nextDay.rounds && nextDay.rounds > 1) params.set('rounds', String(nextDay.rounds))
    params.set('challenge', challenge.id)
    params.set('day', String(nextDay.day))
    href = `/workout/${nextDay.routineId}?${params.toString()}`
  }

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
        <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function OutlineRow({ index, exercise, onOpen }: { index: number; exercise: Exercise; onOpen: () => void }) {
  return (
    <li>
      <button
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-2xl border border-edge bg-card p-3 text-left transition hover:border-accent/40 hover:bg-card-hover active:scale-[0.99]"
      >
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface">
          <ExerciseVisual exercise={exercise} imgClassName="h-14 w-14 object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-100">
            <span className="text-slate-500">{index + 1}.</span> {exercise.name}
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-400">{exercise.cue ?? exercise.instructions[0]}</p>
        </div>
        <IconChevronRight className="h-4 w-4 shrink-0 text-slate-600" />
      </button>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const [openId, setOpenId] = useState<string | null>(null)

  const sessions = useLiveData(() => getSessions())
  // Using or undoing a skip day bumps skipRev so the streak re-reads.
  const [skipRev, setSkipRev] = useState(0)
  const skipDates = useLiveData(() => getSkipDays().map((d) => d.date), [skipRev])
  const stats = useMemo(() => computeStats(sessions, skipDates), [sessions, skipDates])
  const settings = useLiveData(() => getSettings())
  const latestWeight = useLiveData(() => getLatestWeight())
  const userRoutines = useLiveData(() => getRoutines())

  // Featured workout: the last one played, else Classic 7.
  const featured = useLiveData(() => {
    const lastId = getLastRoutineId()
    return (lastId && getRoutine(lastId)) || CLASSIC_7
  })

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
  const openExercise = openId ? EXERCISE_MAP[openId] : undefined
  // Brand-new user: no workouts logged and no weigh-ins. Used to nudge a first action.
  const isFresh = sessions.length === 0 && !latestWeight
  // Onboarding and the plan card change the profile in place; bump to re-read.
  const [trainingRev, setTrainingRev] = useState(0)
  const training = useLiveData(() => getTrainingProfile(), [trainingRev])
  const refreshTraining = () => setTrainingRev((r) => r + 1)
  const plan = useMemo(() => planWorkout(training, sessions), [training, sessions])

  // Length presets: once, twice or three times through the featured routine.
  const [lengthTimes, setLengthTimesState] = useState<1 | 2 | 3>(() => getLengthTimes())
  const presets = lengthPresets(featured)
  const preset = presets[lengthTimes - 1]
  const workoutHref = lengthTimes > 1 ? `/workout/${featured.id}?rounds=${preset.rounds}` : `/workout/${featured.id}`
  function chooseLength(times: 1 | 2 | 3) {
    setLengthTimesState(times)
    setLengthTimes(times)
  }

  return (
    <div className="space-y-6">
      {/* ---- First-run welcome (vanishes after the first workout or weigh-in) ---- */}
      {!training.onboardingDone && <Onboarding onDone={refreshTraining} />}
      {isFresh && training.onboardingDone && !plan && (
        <div className="rounded-2xl border border-accent/30 bg-accent/10 p-4">
          <div className="font-semibold text-slate-100">👋 Welcome to FitFlow 7</div>
          <p className="mt-1 text-sm text-slate-400">
            Tap <span className="font-semibold text-accent">Start</span> below for a 7-minute workout, or log a weigh-in to track your progress.
          </p>
        </div>
      )}

      {plan && training.level ? (
        <PlanCard plan={plan} level={training.level} onChange={refreshTraining} />
      ) : (
        <>
          {/* ---- Featured workout: dark card with accent glow, length presets and Start ---- */}
          <section className="relative overflow-hidden rounded-3xl border border-accent/30 bg-gradient-to-br from-card to-surface p-6">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/20 blur-3xl" />
            <div className="relative">
              <div className="text-xs font-bold uppercase tracking-widest text-accent">
                {getLastRoutineId() && featured.id !== 'classic-7' ? 'Continue' : "Today's workout"}
              </div>
              <div className="mt-1 text-2xl font-extrabold text-slate-100">{featured.name}</div>
              <div className="mt-0.5 text-sm text-slate-400">
                {outline.length} exercises{lengthTimes > 1 ? ` × ${lengthTimes} rounds` : ''} · about {preset.minutes} min
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link
                  to={workoutHref}
                  className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-base font-bold text-slate-900 shadow-lg shadow-accent/20 transition hover:brightness-110 active:scale-[0.98]"
                >
                  <IconPlay className="h-4 w-4" /> Start
                </Link>
                <div role="radiogroup" aria-label="Workout length" className="flex rounded-full border border-edge bg-surface/60 p-1 text-sm font-semibold">
                  {presets.map((p) => (
                    <button
                      key={p.times}
                      type="button"
                      role="radio"
                      aria-checked={lengthTimes === p.times}
                      aria-label={`${p.times === 1 ? '1 round' : `${p.times} rounds`}, about ${p.minutes} minutes`}
                      onClick={() => chooseLength(p.times)}
                      className={`min-h-9 rounded-full px-3.5 tabular-nums transition ${
                        lengthTimes === p.times ? 'bg-card text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {p.times === 1 ? '1 round' : `${p.times} rounds`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {/* ---- Stat chips ---- */}
      <section className="grid grid-cols-3 gap-3">
        <StatChip
          to="/stats"
          value={stats.currentStreak}
          label="day streak"
          icon={<IconFlame className="h-4 w-4" />}
          tint="bg-amber-500/15 text-amber-400"
        />
        {latestWeight ? (
          <StatChip
            to="/stats"
            value={weightLabel}
            label="weight"
            icon={<IconScale className="h-4 w-4" />}
            tint="bg-accent/15 text-accent"
          />
        ) : (
          <StatChip
            to="/stats"
            value="Log"
            label="add weight"
            icon={<IconPlus className="h-4 w-4" />}
            tint="bg-accent/15 text-accent"
            accent
          />
        )}
        <StatChip
          to="/history"
          value={stats.workoutsThisWeek}
          label="this week"
          icon={<IconCalendar className="h-4 w-4" />}
          tint="bg-violet-500/15 text-violet-400"
        />
      </section>

      <SkipDayPrompt onChange={() => setSkipRev((r) => r + 1)} />

      {/* ---- Challenge progress / banner ---- */}
      <ChallengeWidget />

      {/* ---- Workout outline ---- */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">{featured.name} · outline</h2>
          <Link to="/library" className="text-xs font-medium text-accent hover:underline">
            All exercises
          </Link>
        </div>
        <ul className="space-y-2">
          {outline.map((ex, i) => (
            <OutlineRow key={ex.id} index={i} exercise={ex} onOpen={() => setOpenId(ex.id)} />
          ))}
        </ul>
        <Link
          to={workoutHref}
          className="flex items-center justify-center gap-2 rounded-2xl border border-edge bg-card py-3 text-center text-sm font-semibold text-accent transition active:scale-[0.99] hover:bg-card-hover"
        >
          <IconPlay className="h-4 w-4" /> Start {featured.name}{lengthTimes > 1 ? ` · ${lengthTimes} rounds` : ''}
        </Link>
      </section>

      {/* ---- All workouts ---- */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">All workouts</h2>
          <Link
            to="/routines/new/edit"
            className="inline-flex items-center gap-1 rounded-lg border border-edge bg-card px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-card-hover"
          >
            <IconPlus className="h-3.5 w-3.5" /> New
          </Link>
        </div>

        <div className="space-y-2">
          {allRoutines.map((routine) => (
            <div key={routine.id} className="flex items-center gap-3 rounded-2xl border border-edge bg-card px-4 py-3">
              <Link to={`/workout/${routine.id}`} className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold text-slate-100">{routine.name}</span>
                  {routine.isSystem && (
                    <span className="shrink-0 rounded-full border border-edge px-2 py-0.5 text-[10px] text-slate-500">built-in</span>
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

      {openExercise && (
        <ExerciseModal exercise={openExercise} onClose={() => setOpenId(null)} onJump={(id) => setOpenId(id)} />
      )}
    </div>
  )
}
