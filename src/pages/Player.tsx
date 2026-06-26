import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTimerStore } from '../store/timerStore'
import { getRoutine, getSettings, markChallengeDay } from '../lib/storage'
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

  const {
    routine,
    exercises,
    phase,
    currentIndex,
    secondsLeft,
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
    const resolved = getRoutine(rId) ?? CLASSIC_7
    const roundsToUse = roundsOverride && roundsOverride > 0 ? roundsOverride : resolved.rounds
    const repeated: Exercise[] = []
    for (let r = 0; r < roundsToUse; r++) {
      for (const id of resolved.exerciseIds) {
        const ex = EXERCISE_MAP[id]
        if (ex) repeated.push(ex)
      }
    }
    // Guard: refuse to start a routine with no playable exercises. Otherwise the
    // timer would instantly "complete" and log a junk 0-exercise session (B3).
    if (repeated.length === 0) return
    start(resolved, repeated, settings)
  }, [start])

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
  }, [routineId, roundsParam])

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
  const lastCueSeqRef = useRef<number>(-1)
  useEffect(() => {
    if (!cueEvent) return
    if (cueEvent.seq === lastCueSeqRef.current) return
    lastCueSeqRef.current = cueEvent.seq

    if (isMuted) return

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
  }, [cueEvent, isMuted])

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

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------
  const currentExercise = exercises[currentIndex] ?? null
  const nextExercise = exercises[currentIndex + 1] ?? null
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
    // Finding 3: elapsed from the timestamps captured at completion (pure during render)
    const completedElapsed = startedAt && completedAt
      ? Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000)
      : 0
    const endedEarly = exercisesCompleted < totalExercises
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg rounded-2xl border border-violet-500/30 bg-violet-950/40 p-8 text-center light:border-violet-300 light:bg-violet-50">
          <div className="mb-3 text-6xl">🎉</div>
          <h1 className="mb-1 text-3xl font-bold text-violet-300 light:text-violet-700">
            {endedEarly ? 'Workout Ended' : 'Workout Complete!'}
          </h1>
          <p className="mb-1 text-slate-400">{routine?.name ?? 'Workout'}</p>
          {endedEarly && (
            <p className="mb-5 text-xs text-amber-400 light:text-amber-600">Ended early</p>
          )}
          {!endedEarly && <div className="mb-5" />}

          <div className="mb-8 grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-card p-4">
              <p className="text-2xl font-bold tabular-nums text-slate-100">
                {fmtDuration(completedElapsed)}
              </p>
              <p className="mt-1 text-xs text-slate-400">Duration</p>
            </div>
            <div className="rounded-xl bg-card p-4">
              <p className="text-2xl font-bold tabular-nums text-slate-100">
                {exercisesCompleted}/{totalExercises}
              </p>
              <p className="mt-1 text-xs text-slate-400">Exercises</p>
            </div>
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
            {currentExercise.icon} {currentExercise.name}
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

      {/* ---- Phase label + timer ---- */}
      <div className="flex flex-col items-center">
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
          {isPaused && (
            <span className="absolute -right-2 -top-2 rounded-full bg-slate-700 px-2 py-0.5 text-xs font-bold tracking-wider text-slate-300">
              PAUSED
            </span>
          )}
        </div>
      </div>

      {/* ---- Current exercise tile ---- */}
      {currentExercise && phase !== 'complete' && (
        <div className="mx-auto mt-6 w-full max-w-sm">
          <div
            className={`rounded-2xl border p-5 text-center transition-colors ${phaseBg[phase]}`}
          >
            <ExerciseVisual
              exercise={currentExercise}
              autoPlay
              imgClassName="mx-auto mb-3 max-h-44 w-full rounded-2xl bg-surface object-contain"
              emojiClassName="mb-3 inline-block text-7xl leading-none"
            />
            <h2 className="text-xl font-bold text-slate-100">{currentExercise.name}</h2>
            {currentExercise.instructions[0] && (
              <p className="mt-2 text-sm leading-relaxed text-slate-400 line-clamp-2">
                {currentExercise.instructions[0]}
              </p>
            )}
            {currentExercise.instructions[1] && (
              <p className="mt-1 text-sm leading-relaxed text-slate-400 line-clamp-1">
                {currentExercise.instructions[1]}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ---- Up next (prominent during REST) ---- */}
      {phase === 'rest' && nextExercise && (
        <div className="mx-auto mt-4 w-full max-w-sm">
          <div className="rounded-2xl border border-edge bg-card p-4 text-center">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Up Next
            </p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-4xl leading-none">{nextExercise.icon}</span>
              <span className="text-lg font-semibold text-slate-200">{nextExercise.name}</span>
            </div>
          </div>
        </div>
      )}

      {/* ---- Next exercise preview during WORK (smaller) ---- */}
      {phase === 'work' && nextExercise && (
        <div className="mx-auto mt-4 w-full max-w-sm">
          <div className="rounded-xl border border-edge bg-card/60 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl leading-none">{nextExercise.icon}</span>
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
      <div className="mx-auto mt-6 grid w-full max-w-sm grid-cols-4 gap-2">
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
      <div className="mx-auto mt-6 hidden w-full max-w-sm sm:block">
        <p className="text-center text-[10px] text-slate-400">
          Space: pause &nbsp;·&nbsp; ← → navigate &nbsp;·&nbsp; M: mute &nbsp;·&nbsp; F: focus
        </p>
      </div>
    </div>
  )
}
