import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useLiveData } from '../hooks/useLiveData'
import { CLASSIC_7 } from '../data/routines'
import { CHALLENGE_MAP } from '../data/challenges'
import { EXERCISE_MAP } from '../data/exercises'
import {
  getChallengeProgressAll,
  getLastRoutineId,
  getLatestWeight,
  getLengthTimes,
  getTrainingProfile,
  saveTrainingProfile,
  getSkipDays,
  getRoutine,
  getSessions,
  getSettings,
  setLengthTimes,
} from '../lib/storage'
import { computeStats } from '../lib/stats'
import { formatWeight } from '../lib/body'
import ExerciseVisual from '../components/ExerciseVisual'
import ExerciseModal from '../components/ExerciseModal'
import { lengthPresets } from '../lib/workout'
import { planWorkout } from '../lib/plan'
import Onboarding from '../components/Onboarding'
import Dialog from '../components/Dialog'
import PlanCard from '../components/PlanCard'
import SkipDayPrompt from '../components/SkipDayPrompt'
import { challengeStatus } from '../lib/skipDays'
import { fmtDuration, formatRelativeDay, todayKey } from '../lib/format'
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

  const weightLabel = latestWeight ? formatWeight(latestWeight.weightKg, settings.unitSystem) : '—'
  const openExercise = openId ? EXERCISE_MAP[openId] : undefined
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

  const recentSessions = [...sessions]
    .sort((x, y) => (y.completedAt ?? y.startedAt).localeCompare(x.completedAt ?? x.startedAt))
    .slice(0, 4)

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Today</h1>
      {/* First run: two questions in a dialog, so returning users never see it in the page. */}
      <Dialog open={!training.onboardingDone} onClose={() => { saveTrainingProfile({ onboardingDone: true }); refreshTraining() }} variant="card" labelledBy="onboarding-title">
        <Onboarding onDone={refreshTraining} />
      </Dialog>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        {/* ---- Left: today's workout and what's in it ---- */}
        <div className="min-w-0 space-y-6">
          {plan && training.level ? (
            <PlanCard plan={plan} level={training.level} onChange={refreshTraining} />
          ) : (
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
          )}

          {/* The moves, as a compact grid: tap one for how to do it. */}
          <section aria-labelledby="moves-title">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="moves-title" className="text-sm font-semibold uppercase tracking-widest text-slate-500">
                The moves · {outline.length}
              </h2>
              <Link to="/library" className="text-xs font-medium text-accent hover:underline">
                All exercises
              </Link>
            </div>
            {/* Phones: one swipeable row, so your week stays close below. */}
            <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 lg:grid-cols-6">
              {outline.map((ex, i) => (
                <li key={ex.id} className="w-24 shrink-0 snap-start sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setOpenId(ex.id)}
                    className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-edge bg-card p-2 text-center transition hover:border-accent/40 hover:bg-card-hover"
                  >
                    <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-surface">
                      <ExerciseVisual exercise={ex} imgClassName="h-full w-full object-cover" />
                    </span>
                    <span className="line-clamp-2 min-h-[2lh] text-[11px] font-medium leading-tight text-slate-300">
                      <span className="text-slate-500">{i + 1}.</span> {ex.name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* ---- Right: your week and recent workouts ---- */}
        <div className="min-w-0 space-y-6">
          <section className="grid grid-cols-3 gap-3" aria-label="This week">
            <StatChip to="/stats" value={stats.currentStreak} label="day streak" icon={<IconFlame className="h-4 w-4" />} tint="bg-amber-500/15 text-amber-400" />
            {latestWeight ? (
              <StatChip to="/stats" value={weightLabel} label="weight" icon={<IconScale className="h-4 w-4" />} tint="bg-accent/15 text-accent" />
            ) : (
              <StatChip to="/stats" value="Log" label="add weight" icon={<IconPlus className="h-4 w-4" />} tint="bg-accent/15 text-accent" accent />
            )}
            <StatChip to="/history" value={stats.workoutsThisWeek} label="this week" icon={<IconCalendar className="h-4 w-4" />} tint="bg-violet-500/15 text-violet-400" />
          </section>

          <SkipDayPrompt onChange={() => setSkipRev((r) => r + 1)} />
          <ChallengeWidget />

          <section aria-labelledby="recent-title" className="rounded-2xl border border-edge bg-card">
            <div className="flex items-center justify-between border-b border-edge px-4 py-3">
              <h2 id="recent-title" className="text-sm font-semibold text-slate-200">Recent workouts</h2>
              <Link to="/history" className="text-xs font-medium text-accent hover:underline">
                History
              </Link>
            </div>
            {recentSessions.length === 0 ? (
              <p className="px-4 py-5 text-sm text-slate-400">Your finished workouts show up here.</p>
            ) : (
              <ul className="divide-y divide-edge">
                {recentSessions.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-100">{s.routineName}</div>
                      <div className="text-xs text-slate-500">
                        {formatRelativeDay(s.completedAt ?? s.startedAt)} · {fmtDuration(s.durationSeconds)}
                        {s.completed ? '' : ' · ended early'}
                      </div>
                    </div>
                    {s.routineId && (
                      <Link
                        to={`/workout/${s.routineId}`}
                        aria-label={`Do ${s.routineName} again`}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent transition hover:bg-accent hover:text-slate-900"
                      >
                        <IconPlay className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {openExercise && (
        <ExerciseModal exercise={openExercise} onClose={() => setOpenId(null)} onJump={(id) => setOpenId(id)} />
      )}
    </div>
  )
}
