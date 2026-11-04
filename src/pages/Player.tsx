import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTimerStore } from '../store/timerStore'
import { getCoachTone, getLatestWeight, getRoutine, getSessions, getSettings, getTrainingProfile, markChallengeDay, saveTrainingProfile } from '../lib/storage'
import { planWorkout, resolveVariation, TIER_LABEL } from '../lib/plan'
import type { VariationTier } from '../types'
import { computeStats } from '../lib/stats'
import { estimateCalories } from '../lib/workout'
import { CHALLENGE_MAP } from '../data/challenges'
import { coachLine, speak, speechAvailable, stopSpeaking, type CoachMoment } from '../lib/coach'
import { EXERCISE_MAP } from '../data/exercises'
import { CLASSIC_7 } from '../data/routines'
import ExerciseVisual from '../components/ExerciseVisual'
import {
  cueStart,
  cueWorkStart,
  cueRestStart,
  cueCountdownTick,
  cueComplete,
} from '../lib/audio'
import { fmtDuration } from '../lib/format'
import type { Exercise, WorkoutPhase } from '../types'

// ---------------------------------------------------------------------------
// Phase display helpers
// ---------------------------------------------------------------------------
const PHASE_LABEL: Record<WorkoutPhase, string> = {
  idle: '',
  prepare: 'PREPARE',
  work: 'WORK',
  rest: 'REST',
  complete: 'DONE',
}

const PHASE_COLOR: Record<WorkoutPhase, string> = {
  idle: 'text-slate-400',
  prepare: 'text-amber-400',
  work: 'text-accent',
  rest: 'text-emerald-400',
  complete: 'text-violet-400',
}

const PHASE_BG: Record<WorkoutPhase, string> = {
  idle: 'bg-card',
  prepare: 'bg-amber-950/40 border-amber-500/30',
  work: 'bg-cyan-950/40 border-cyan-500/30',
  rest: 'bg-emerald-950/40 border-emerald-500/30',
  complete: 'bg-violet-950/40 border-violet-500/30',
}

// Light-theme variants. The dark phase tints (*-950/40) + the slate-100 heading
// (which the light remap turns near-black) would be dark-text-on-dark-panel; in
// light mode use pale tints + darker phase text instead. Picked at render via
// the resolved theme so a toggle takes effect on the next tick.
const PHASE_BG_LIGHT: Record<WorkoutPhase, string> = {
  idle: 'bg-card',
  prepare: 'bg-amber-100 border-amber-300',
  work: 'bg-cyan-100 border-cyan-300',
  rest: 'bg-emerald-100 border-emerald-300',
  complete: 'bg-violet-100 border-violet-300',
}

const PHASE_COLOR_LIGHT: Record<WorkoutPhase, string> = {
  idle: 'text-slate-400',
  prepare: 'text-amber-600',
  work: 'text-accent',
  rest: 'text-emerald-600',
  complete: 'text-violet-600',
}

// ---------------------------------------------------------------------------
// Progress segment bar
// ---------------------------------------------------------------------------
function ProgressBar({
  total,
  currentIndex,
  phase,
}: {
  total: number
  currentIndex: number
  phase: WorkoutPhase
}) {
  if (total === 0) return null
  return (
    <div className="flex w-full gap-0.5">
      {Array.from({ length: total }).map((_, i) => {
        const isDone = i < currentIndex || phase === 'complete'
        const isCurrent = i === currentIndex && phase !== 'complete'
        return (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              isDone
                ? 'bg-accent'
                : isCurrent
                  ? 'bg-accent opacity-60'
                  : 'bg-edge'
            }`}
          />
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Player component
// ---------------------------------------------------------------------------
export default function Player() {
  const { routineId } = useParams<{ routineId: string }>()
  const [searchParams] = useSearchParams()
  // Optional rounds override (challenges pass ?rounds=N to scale intensity).
  // Coerce to a positive integer and clamp so a hand-typed fractional/huge value
  // can't build a fractional loop count or thousands of rounds.
  const roundsRaw = Math.floor(Number(searchParams.get('rounds')))
  const roundsParam = Number.isFinite(roundsRaw) && roundsRaw > 0 ? Math.min(roundsRaw, 20) : undefined
  // Optional challenge context (challenges launch a day via ?challenge=&day=)
  // so finishing the workout auto-marks that day complete.
  const challengeId = searchParams.get('challenge') || undefined
  const challengeDay = Math.floor(Number(searchParams.get('day')))
  const planMode = searchParams.get('plan') === '1'

  const {
    routine,
    exercises,
    baseIds,
    phase,
    currentIndex,
    secondsLeft,
    totalSeconds,
    isPaused,
    isMuted,
    exercisesCompleted,
    startedAt,
    completedAt,
    cueEvent,
    start,
    reset,
    togglePause,
    skip,
    previous,
    endWorkout,
    toggleMute,
    replaceExercises,
  } = useTimerStore()

  const [focusMode, setFocusMode] = useState(false)
  const [isFsNative, setIsFsNative] = useState(false)

  // Derived (not eff't state): true when the resolved routine has no playable
  // exercises (e.g. an import/clone whose ids no longer exist). When blocked we
  // never start the timer, so no junk session is logged. See B3.
  const blocked = useMemo(() => {
    const resolved = getRoutine(routineId ?? '') ?? CLASSIC_7
    return !resolved.exerciseIds.some((id) => EXERCISE_MAP[id])
  }, [routineId])

  // Finding 5: Screen Wake Lock ref
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  // ---------------------------------------------------------------------------
  // Finding 16: Extract buildAndStart helper to avoid duplicated loop
  // ---------------------------------------------------------------------------
  const buildAndStart = useCallback((rId: string, roundsOverride?: number) => {
    const settings = getSettings()
    const profile = getTrainingProfile()
    // A plan workout (?plan=1) takes its rounds, timing and move difficulty
    // from the starter plan (lib/plan.ts).
    const plan = planMode ? planWorkout(profile, getSessions()) : null
    const base = getRoutine(rId) ?? CLASSIC_7
    const resolved = plan ? { ...base, workSeconds: plan.workSeconds, restSeconds: plan.restSeconds } : base
    const roundsToUse = plan ? plan.rounds : roundsOverride && roundsOverride > 0 ? roundsOverride : resolved.rounds
    const repeated: Exercise[] = []
    const baseIds: string[] = []
    for (let r = 0; r < roundsToUse; r++) {
      for (const id of resolved.exerciseIds) {
        const ex = EXERCISE_MAP[id]
        if (!ex) continue
        // Your own easier/harder choice for a move wins; then the plan's tier.
        const tier = profile.variations?.[id] ?? plan?.tier ?? 'standard'
        repeated.push(resolveVariation(ex, tier, EXERCISE_MAP))
        baseIds.push(id)
      }
    }
    // Guard: refuse to start a routine with no playable exercises. Otherwise the
    // timer would instantly "complete" and log a junk 0-exercise session (B3).
    if (repeated.length === 0) return
    start(resolved, repeated, settings, baseIds)
  }, [start, planMode])

  // ---------------------------------------------------------------------------
  // Mount: resolve routine + start timer
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (blocked) return
    buildAndStart(routineId ?? '', roundsParam)

    return () => {
      reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routineId, roundsParam, planMode])

  // ---------------------------------------------------------------------------
  // Finding 5: Screen Wake Lock. Keyed on whether the workout is *active* (not
  // idle/complete) rather than `phase`, so it acquires once when the workout
  // starts and releases once when it completes or unmounts — instead of churning
  // the lock + listener on every work/rest transition. Re-acquires on "Go Again"
  // (active flips back true) and when the tab returns to the foreground.
  // ---------------------------------------------------------------------------
  const wakeActive = phase !== 'idle' && phase !== 'complete'
  useEffect(() => {
    if (!('wakeLock' in navigator) || !wakeActive) return

    // `released` guards the async race: if cleanup runs while a request() is
    // still pending, the resolved sentinel would otherwise be stored after the
    // cleanup's release() ran (a no-op on the then-null ref) and leak. When
    // released, drop any late-arriving sentinel immediately.
    let released = false
    const acquireWakeLock = async () => {
      try {
        const sentinel = await navigator.wakeLock.request('screen')
        if (released) void sentinel.release().catch(() => {})
        else wakeLockRef.current = sentinel
      } catch {
        // Ignore — wake lock is a best-effort feature
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void acquireWakeLock()
    }

    void acquireWakeLock()
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      released = true
      document.removeEventListener('visibilitychange', handleVisibility)
      wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
    }
  }, [wakeActive])

  // ---------------------------------------------------------------------------
  // Audio cue subscription
  // ---------------------------------------------------------------------------
  // Beeps follow Settings → Audio cues, read once per workout.
  const [beepsOn] = useState(() => getSettings().audioCuesEnabled)
  const lastCueSeqRef = useRef<number>(-1)
  useEffect(() => {
    if (!cueEvent) return
    if (cueEvent.seq === lastCueSeqRef.current) return
    lastCueSeqRef.current = cueEvent.seq

    if (isMuted || !beepsOn) return

    switch (cueEvent.type) {
      case 'start':
        void cueStart()
        break
      case 'work':
        void cueWorkStart()
        break
      case 'rest':
        void cueRestStart()
        break
      case 'countdown':
        void cueCountdownTick()
        break
      case 'complete':
        void cueComplete()
        break
    }
  }, [cueEvent, isMuted, beepsOn])

  // ---------------------------------------------------------------------------
  // Voice coach: speaks the move, halfway, ten seconds left, what's next and
  // the finish (lib/coach.ts). Device-local tone, read once per workout; Mute
  // silences it with the beeps, and pausing cuts it off.
  // ---------------------------------------------------------------------------
  const [coachTone] = useState(() => getCoachTone())
  const coachMoment = useCallback(
    (seconds: number): CoachMoment => ({
      phase,
      secondsLeft: seconds,
      phaseSeconds: totalSeconds,
      exercise: exercises[currentIndex] ?? null,
      nextExercise: exercises[currentIndex + 1] ?? null,
      isLast: currentIndex >= exercises.length - 1,
    }),
    [phase, totalSeconds, exercises, currentIndex],
  )
  const spokenKeyRef = useRef('')
  useEffect(() => {
    if (coachTone === 'off' || phase === 'idle') return
    if (isPaused || isMuted) {
      stopSpeaking()
      return
    }
    const key = `${phase}:${currentIndex}:${secondsLeft}`
    if (key === spokenKeyRef.current) return
    spokenKeyRef.current = key
    const line = coachLine(coachMoment(secondsLeft), coachTone)
    if (line) speak(line, coachTone)
  }, [coachTone, phase, currentIndex, secondsLeft, isPaused, isMuted, coachMoment])
  useEffect(() => () => stopSpeaking(), [])

  // The caption holds the coach's latest line in this phase: visible while
  // muted, and always read to screen readers (aria-live).
  const coachCaption = useMemo(() => {
    if (coachTone === 'off' || phase === 'idle') return null
    if (phase === 'complete') return coachLine(coachMoment(0), coachTone)
    for (let s = secondsLeft; s <= totalSeconds; s++) {
      const line = coachLine(coachMoment(s), coachTone)
      if (line) return line
    }
    return null
  }, [coachTone, phase, secondsLeft, totalSeconds, coachMoment])
  const showCaption = isMuted || !speechAvailable()

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------------------------
  const toggleFocusMode = useCallback(async () => {
    if (focusMode) {
      // Exit
      if (isFsNative) {
        try {
          await document.exitFullscreen()
          setIsFsNative(false)
        } catch {
          // ignore
        }
      }
      setFocusMode(false)
    } else {
      // Enter
      try {
        await document.documentElement.requestFullscreen()
        setIsFsNative(true)
      } catch {
        // Fullscreen not available — use state-based focus
      }
      setFocusMode(true)
    }
  }, [focusMode, isFsNative])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.repeat) return
      // Ignore when typing in an input
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          togglePause()
          break
        case 'ArrowRight':
          skip()
          break
        case 'ArrowLeft':
          previous()
          break
        case 'm':
        case 'M':
          toggleMute()
          break
        case 'f':
        case 'F':
          void toggleFocusMode()
          break
        case 'Escape':
          if (focusMode) void toggleFocusMode()
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [togglePause, skip, previous, toggleMute, toggleFocusMode, focusMode])

  // Listen for native fullscreen exit (e.g. user pressed Escape via browser)
  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) {
        setIsFsNative(false)
        setFocusMode(false)
      }
    }
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // ---------------------------------------------------------------------------
  // Finding 20: Update document title during workout
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Check `complete` first — at completion the last exercise is still the
    // current one, so the generic branch would otherwise win and the "Done"
    // title was never reached.
    if (phase === 'complete') {
      document.title = 'Done | FitFlow 7'
    } else {
      const exercise = exercises[currentIndex]
      if (phase !== 'idle' && exercise) {
        document.title = `${PHASE_LABEL[phase]} — ${exercise.name} | FitFlow 7`
      }
    }
    return () => {
      document.title = 'FitFlow 7'
    }
  }, [phase, currentIndex, exercises])

  // ---------------------------------------------------------------------------
  // Challenge auto-completion: when a challenge-launched workout finishes in
  // full (not ended early), mark that challenge day done. Fires once.
  // ---------------------------------------------------------------------------
  const challengeMarkedRef = useRef(false)
  useEffect(() => {
    if (phase !== 'complete' || challengeMarkedRef.current) return
    if (!challengeId || !(challengeDay > 0)) return
    if (exercisesCompleted < exercises.length) return // ended early — leave it manual
    challengeMarkedRef.current = true
    markChallengeDay(challengeId, challengeDay)
  }, [phase, challengeId, challengeDay, exercisesCompleted, exercises.length])

  // Finish-screen facts, read once when the workout completes (the session is
  // already saved by then, so the streak includes today).
  const finish = useMemo(() => {
    if (phase !== 'complete' || !startedAt || !completedAt) return null
    const seconds = Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000)
    return {
      seconds,
      streak: computeStats(getSessions()).currentStreak,
      calories: estimateCalories(seconds, getLatestWeight()?.weightKg),
    }
  }, [phase, startedAt, completedAt])

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------
  const currentExercise = exercises[currentIndex] ?? null
  const nextExercise = exercises[currentIndex + 1] ?? null
  // Rest shows the move coming up, not the one just finished.
  const shownExercise = phase === 'rest' ? nextExercise : currentExercise
  const shownLabel = phase === 'prepare' ? 'First up' : phase === 'rest' ? 'Up next' : 'Now'
  // Easier/harder swap for the move coming up (prepare and rest only).
  const shownIndex = phase === 'rest' ? currentIndex + 1 : currentIndex
  const shownBase = (phase === 'prepare' || phase === 'rest') && shownExercise ? EXERCISE_MAP[baseIds[shownIndex] ?? ''] : undefined
  const swapOptions = shownBase
    ? (['easier', 'standard', 'harder'] as VariationTier[])
        .map((tier) => ({ tier, exercise: resolveVariation(shownBase, tier, EXERCISE_MAP) }))
        .filter((o) => o.tier === 'standard' || o.exercise.id !== shownBase.id)
    : []
  function chooseTier(tier: VariationTier) {
    if (!shownBase) return
    const exercise = resolveVariation(shownBase, tier, EXERCISE_MAP)
    const indices = baseIds.map((id, i) => (id === shownBase.id && i >= shownIndex ? i : -1)).filter((i) => i >= 0)
    replaceExercises(indices, exercise)
    const variations = { ...(getTrainingProfile().variations ?? {}) }
    if (tier === 'standard') delete variations[shownBase.id]
    else variations[shownBase.id] = tier
    saveTrainingProfile({ variations })
  }
  const totalExercises = exercises.length

  // currentPhase keeps the full WorkoutPhase union type after the complete early-return below
  // so later JSX comparisons against it remain valid to the type checker.
  const currentPhase: WorkoutPhase = phase

  // Phase colors/tints depend on the resolved theme (read at render — re-evaluated
  // each timer tick, so a theme toggle is reflected within ~1s).
  const isLight = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light'
  const phaseColor = isLight ? PHASE_COLOR_LIGHT : PHASE_COLOR
  const phaseBg = isLight ? PHASE_BG_LIGHT : PHASE_BG

  // ---------------------------------------------------------------------------
  // Empty-routine guard — nothing playable resolved, so we never started the
  // timer (and never logged a session). Offer a way out.
  // ---------------------------------------------------------------------------
  if (blocked) {
    const blockedRoutine = getRoutine(routineId ?? '')
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg rounded-2xl border border-amber-500/30 bg-amber-950/30 p-8 text-center light:border-amber-300 light:bg-amber-50">
          <div className="mb-3 text-6xl">🫥</div>
          <h1 className="mb-2 text-2xl font-bold text-amber-200 light:text-amber-700">Nothing to play here</h1>
          <p className="mb-6 text-sm leading-relaxed text-slate-400">
            {blockedRoutine?.name ? `"${blockedRoutine.name}"` : 'This routine'} has no exercises we
            recognize — it may have been imported or cloned with exercises this version doesn't include.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              to="/"
              className="rounded-xl border border-edge bg-card px-6 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-card-hover"
            >
              Back to Dashboard
            </Link>
            {blockedRoutine && !blockedRoutine.isSystem && (
              <Link
                to={`/routines/${blockedRoutine.id}/edit`}
                className="rounded-xl bg-accent px-6 py-3 text-sm font-bold text-slate-900 transition-opacity hover:opacity-90"
              >
                Edit routine
              </Link>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Complete phase
  // ---------------------------------------------------------------------------
  if (currentPhase === 'complete') {
    const endedEarly = exercisesCompleted < totalExercises
    const challenge = challengeId ? CHALLENGE_MAP[challengeId] : undefined
    const challengeDone = !endedEarly && challenge && challengeDay > 0
    const tiles: { value: string; label: string }[] = [
      { value: fmtDuration(finish?.seconds ?? 0), label: 'Duration' },
      { value: `${exercisesCompleted}/${totalExercises}`, label: 'Exercises' },
      ...(finish && finish.streak > 0 ? [{ value: `${finish.streak}`, label: 'day streak' }] : []),
      ...(finish?.calories ? [{ value: `≈${finish.calories}`, label: 'kcal (estimate)' }] : []),
    ]
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg rounded-2xl border border-violet-500/30 bg-violet-950/40 p-8 text-center light:border-violet-300 light:bg-violet-50">
          <div className="mb-3 text-6xl" aria-hidden="true">{endedEarly ? '👍' : '🎉'}</div>
          <h1 className="mb-1 text-3xl font-bold text-violet-300 light:text-violet-700">
            {endedEarly ? 'Workout Ended' : 'Workout Complete!'}
          </h1>
          <p className="text-slate-400">{routine?.name ?? 'Workout'}</p>
          {endedEarly && (
            <p className="mt-1 text-xs text-amber-400 light:text-amber-600">Ended early</p>
          )}

          {challengeDone && (
            <Link
              to="/challenges"
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-violet-400/40 bg-violet-500/15 px-4 py-1.5 text-sm font-semibold text-violet-200 transition hover:bg-violet-500/25 light:border-violet-300 light:bg-violet-100 light:text-violet-800"
            >
              <span aria-hidden="true">✓</span> {challenge.name}: day {challengeDay} done
            </Link>
          )}

          <div className="mt-6 mb-8 grid grid-cols-2 gap-3">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-xl bg-card p-4">
                <p className="text-2xl font-bold tabular-nums text-slate-100">{t.value}</p>
                <p className="mt-1 text-xs text-slate-400">{t.label}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              to="/"
              className="rounded-xl border border-edge bg-card px-6 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-card-hover"
            >
              Back to Dashboard
            </Link>
            <button
              onClick={() => buildAndStart(routineId ?? '', roundsParam)}
              className="rounded-xl bg-accent px-6 py-3 text-sm font-bold text-slate-900 transition-opacity hover:opacity-90"
            >
              Go Again
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Focus mode — minimal overlay
  // ---------------------------------------------------------------------------
  if (focusMode) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-4">
        {/* Phase label */}
        <p className={`mb-2 text-lg font-bold tracking-widest ${phaseColor[phase]}`}>
          {PHASE_LABEL[phase]}
        </p>

        {/* Giant timer */}
        <div
          className={`font-mono text-9xl font-black tabular-nums leading-none transition-colors ${phaseColor[phase]} ${isPaused ? 'opacity-40' : ''}`}
        >
          {secondsLeft}
        </div>

        {/* Exercise name */}
        {currentExercise && (
          <p className="mt-6 text-center text-2xl font-semibold text-slate-200">
            {currentExercise.name}
          </p>
        )}

        {isPaused && (
          <div className="mt-4 rounded-full bg-slate-700 px-4 py-1 text-xs font-bold uppercase tracking-wider text-slate-300">
            PAUSED
          </div>
        )}

        {/* Minimal controls */}
        <div className="mt-8 flex gap-4">
          <button
            onClick={togglePause}
            className="rounded-xl bg-accent px-6 py-3 text-sm font-bold text-slate-900"
          >
            {isPaused ? 'Resume' : 'Pause'}
          </button>
          <button
            onClick={() => void toggleFocusMode()}
            className="rounded-xl border border-edge bg-card px-4 py-3 text-sm font-medium text-slate-300 hover:bg-card-hover"
          >
            Exit Focus
          </button>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Main player layout
  // ---------------------------------------------------------------------------
  return (
    <div className="flex min-h-screen flex-col bg-surface px-4 py-4 sm:px-6">
      {/* ---- Top bar ---- */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-300">
            {routine?.name ?? '…'}
          </p>
          {phase !== 'idle' && phase !== 'prepare' && (
            <p className="text-xs text-slate-500">
              Exercise {currentIndex + 1}/{totalExercises}
            </p>
          )}
        </div>
        <button
          onClick={endWorkout}
          className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-900/40 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500 light:border-red-300 light:bg-red-50 light:text-red-600 light:hover:bg-red-100"
        >
          End Workout
        </button>
      </div>

      {/* ---- Progress bar ---- */}
      <div className="mb-6">
        <ProgressBar total={totalExercises} currentIndex={currentIndex} phase={phase} />
      </div>

      {/* Phone: timer, the move, up next, controls in one column. Desktop: the
          move on the left, the timer and controls on the right. */}
      <div className="mx-auto grid w-full max-w-sm grid-cols-1 lg:my-auto lg:max-w-5xl lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:grid-rows-[1fr_auto_auto_1fr] lg:items-center lg:gap-x-14">
        {/* ---- Phase label + timer ---- */}
          <div className="flex flex-col items-center lg:col-start-2 lg:row-start-1 lg:self-end">
          <p
            className={`mb-1 text-sm font-bold tracking-[0.2em] uppercase ${phaseColor[phase]}`}
          >
            {PHASE_LABEL[phase]}
          </p>

          <div
            className={`relative font-mono font-black tabular-nums leading-none transition-colors
              text-8xl sm:text-9xl
              ${phaseColor[phase]}
              ${isPaused ? 'opacity-40' : ''}
            `}
          >
            {secondsLeft}
          </div>
          {/* Paused badge sits under the number (it used to overlap the digits),
              and the coach caption below it: fixed height, so neither shifts the
              layout when it appears. */}
          <div className="mt-3 flex min-h-6 items-center justify-center">
            {isPaused ? (
              <span className="rounded-full bg-slate-700 px-3 py-0.5 text-xs font-bold tracking-wider text-slate-300">
                PAUSED
              </span>
            ) : (
              // The coach's words show on screen only while muted (or when the
              // browser can't speak); otherwise they'd repeat the card below.
              // Screen readers always get them through the live region.
              <p aria-live="polite" className={showCaption ? 'max-w-sm text-center text-sm text-slate-400' : 'sr-only'}>
                {coachCaption ?? ''}
              </p>
            )}
          </div>
        </div>

        {/* ---- The move on screen: the current one while working, the next one
            during prepare and rest so you can get into position. ---- */}
        {shownExercise && (
          <div className="mt-6 lg:col-start-1 lg:row-span-4 lg:row-start-1 lg:mt-0">
            <div className={`rounded-2xl border p-5 text-center transition-colors lg:p-7 ${phaseBg[phase]}`}>
              <p className={`mb-3 text-xs font-bold uppercase tracking-[0.2em] ${phaseColor[phase]}`}>
                {shownLabel}
              </p>
              <ExerciseVisual
                key={shownExercise.id}
                exercise={shownExercise}
                autoPlay
                imgClassName="mx-auto mb-3 max-h-44 w-full rounded-2xl bg-surface object-contain lg:max-h-80"
                emojiClassName="mb-3 inline-block text-7xl leading-none lg:text-9xl"
              />
              <h2 className="text-xl font-bold text-slate-100 lg:text-2xl">{shownExercise.name}</h2>
              {shownExercise.cue && (
                <p className="mt-1.5 text-sm leading-relaxed text-slate-300 lg:text-base">{shownExercise.cue}</p>
              )}
              {swapOptions.length > 1 && (
                <div className="mt-4">
                  <div
                    role="radiogroup"
                    aria-label={`Difficulty for ${shownBase?.name ?? 'this move'}`}
                    className={`mx-auto grid max-w-sm rounded-full border border-edge bg-surface p-1 text-sm font-semibold ${swapOptions.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}
                  >
                    {swapOptions.map((o) => {
                      const active = o.exercise.id === shownExercise.id
                      return (
                        <button
                          key={o.tier}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => chooseTier(o.tier)}
                          className={`min-h-11 rounded-full px-2 py-1 leading-tight transition ${active ? 'bg-card text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                          {TIER_LABEL[o.tier]}
                          <span className="block truncate text-[11px] font-normal text-slate-500">{o.exercise.name}</span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">Your choice sticks for this move until you change it.</p>
                </div>
              )}
              {shownExercise.instructions.length > 0 && (
                <ol className="mx-auto mt-4 hidden max-w-md list-decimal space-y-1 pl-5 text-left text-sm leading-relaxed text-slate-400 lg:block">
                  {shownExercise.instructions.slice(0, 3).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}

        {/* ---- Next exercise preview during WORK (smaller) ---- */}
        {phase === 'work' && nextExercise && (
          <div className="mt-4 lg:col-start-2">
            <div className="rounded-xl border border-edge bg-card/60 px-4 py-3">
              <div className="flex items-center gap-3">
                <ExerciseVisual exercise={nextExercise} imgClassName="h-9 w-9 rounded-md object-cover" emojiClassName="inline-flex h-9 w-9 items-center justify-center text-2xl leading-none" />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                    Up Next
                  </p>
                  <p className="text-sm font-medium text-slate-300">{nextExercise.name}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ---- Controls ---- */}
        {/* Mobile-first: big Pause on top, four 44px icon buttons in a row below. */}
        <div className="mt-6 grid w-full grid-cols-4 gap-2 lg:col-start-2 lg:self-start">
          {/* Pause / Resume (full-width primary) */}
          <button
            onClick={togglePause}
            disabled={phase === 'idle' || phase === 'complete'}
            className="col-span-4 min-h-12 w-full rounded-xl bg-accent px-8 text-base font-bold text-slate-900 shadow-lg shadow-cyan-900/30 transition hover:opacity-90 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-30"
            title="Pause/Resume (Space)"
            aria-label={isPaused ? 'Resume workout' : 'Pause workout'}
          >
            {isPaused ? 'Resume' : 'Pause'}
          </button>

          {/* Previous */}
          <button
            onClick={previous}
            disabled={phase === 'idle' || phase === 'complete'}
            className="flex min-h-11 items-center justify-center rounded-xl border border-edge bg-card text-slate-300 transition-colors hover:bg-card-hover active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-30"
            title="Previous (←)"
            aria-label="Previous exercise"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Skip */}
          <button
            onClick={skip}
            disabled={phase === 'idle' || phase === 'complete'}
            className="flex min-h-11 items-center justify-center rounded-xl border border-edge bg-card text-slate-300 transition-colors hover:bg-card-hover active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-30"
            title="Skip (→)"
            aria-label="Skip exercise"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Mute toggle */}
          <button
            onClick={toggleMute}
            className="flex min-h-11 items-center justify-center rounded-xl border border-edge bg-card text-slate-300 transition-colors hover:bg-card-hover active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            title="Mute (M)"
            aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
          >
            {isMuted ? (
              <svg className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-3.536-9.536a5 5 0 000 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            )}
          </button>

          {/* Focus mode toggle */}
          <button
            onClick={() => void toggleFocusMode()}
            className="flex min-h-11 items-center justify-center rounded-xl border border-edge bg-card text-slate-300 transition-colors hover:bg-card-hover active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            title="Focus mode (F)"
            aria-label="Toggle focus mode"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        </div>

        {/* ---- Keyboard hints (desktop only) ---- */}
        <div className="mt-6 hidden sm:block lg:col-start-2 lg:self-start">
          <p className="text-center text-[10px] text-slate-400">
            Space: pause &nbsp;·&nbsp; ← → navigate &nbsp;·&nbsp; M: mute &nbsp;·&nbsp; F: focus
          </p>
        </div>
      </div>
    </div>
  )
}
