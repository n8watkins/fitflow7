import { useEffect, useRef, useState, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTimerStore } from '../store/timerStore'
import { getRoutine, getSettings } from '../lib/storage'
import { EXERCISE_MAP } from '../data/exercises'
import { CLASSIC_7 } from '../data/routines'
import {
  cueStart,
  cueWorkStart,
  cueRestStart,
  cueCountdownTick,
  cueComplete,
} from '../lib/audio'
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

// ---------------------------------------------------------------------------
// Format seconds as m:ss
// ---------------------------------------------------------------------------
function fmtDuration(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
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

  // Finding 5: Screen Wake Lock ref
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  // ---------------------------------------------------------------------------
  // Finding 16: Extract buildAndStart helper to avoid duplicated loop
  // ---------------------------------------------------------------------------
  const buildAndStart = useCallback((rId: string) => {
    const settings = getSettings()
    const resolved = getRoutine(rId) ?? CLASSIC_7
    const repeated: Exercise[] = []
    for (let r = 0; r < resolved.rounds; r++) {
      for (const id of resolved.exerciseIds) {
        const ex = EXERCISE_MAP[id]
        if (ex) repeated.push(ex)
      }
    }
    start(resolved, repeated, settings)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start])

  // ---------------------------------------------------------------------------
  // Mount: resolve routine + start timer
  // ---------------------------------------------------------------------------
  useEffect(() => {
    buildAndStart(routineId ?? '')

    return () => {
      reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routineId])

  // ---------------------------------------------------------------------------
  // Finding 5: Screen Wake Lock — acquire on mount, release on complete/unmount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!('wakeLock' in navigator)) return

    const acquireWakeLock = async () => {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen')
      } catch {
        // Ignore — wake lock is a best-effort feature
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && phase !== 'complete') {
        void acquireWakeLock()
      }
    }

    if (phase !== 'complete') {
      void acquireWakeLock()
    } else {
      wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
    }
  }, [phase])

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
    const exercise = exercises[currentIndex]
    if (phase !== 'idle' && exercise) {
      document.title = `${PHASE_LABEL[phase]} — ${exercise.name} | FitFlow 7`
    } else if (phase === 'complete') {
      document.title = 'Done | FitFlow 7'
    }
    return () => {
      document.title = 'FitFlow 7'
    }
  }, [phase, currentIndex, exercises])

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------
  const currentExercise = exercises[currentIndex] ?? null
  const nextExercise = exercises[currentIndex + 1] ?? null
  const totalExercises = exercises.length

  // currentPhase keeps the full WorkoutPhase union type after the complete early-return below
  // so later JSX comparisons against it remain valid to the type checker.
  const currentPhase: WorkoutPhase = phase

  // ---------------------------------------------------------------------------
  // Complete phase
  // ---------------------------------------------------------------------------
  if (currentPhase === 'complete') {
    // Finding 3: compute elapsedSeconds fresh at render time of the complete screen
    const completedElapsed = startedAt
      ? Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)
      : 0
    const endedEarly = exercisesCompleted < totalExercises
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg rounded-2xl border border-violet-500/30 bg-violet-950/40 p-8 text-center">
          <div className="mb-3 text-6xl">🎉</div>
          <h1 className="mb-1 text-3xl font-bold text-violet-300">
            {endedEarly ? 'Workout Ended' : 'Workout Complete!'}
          </h1>
          <p className="mb-1 text-slate-400">{routine?.name ?? 'Workout'}</p>
          {endedEarly && (
            <p className="mb-5 text-xs text-amber-400">Ended early</p>
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
              onClick={() => buildAndStart(routineId ?? '')}
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
        <p className={`mb-2 text-lg font-bold tracking-widest ${PHASE_COLOR[phase]}`}>
          {PHASE_LABEL[phase]}
        </p>

        {/* Giant timer */}
        <div
          className={`font-mono text-9xl font-black tabular-nums leading-none transition-colors ${PHASE_COLOR[phase]} ${isPaused ? 'opacity-40' : ''}`}
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
          className="shrink-0 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500"
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
          className={`mb-1 text-sm font-bold tracking-[0.2em] uppercase ${PHASE_COLOR[phase]}`}
        >
          {PHASE_LABEL[phase]}
        </p>

        <div
          className={`relative font-mono font-black tabular-nums leading-none transition-colors
            text-8xl sm:text-9xl
            ${PHASE_COLOR[phase]}
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
            className={`rounded-2xl border p-5 text-center transition-colors ${PHASE_BG[phase]}`}
          >
            <div className="mb-3 text-7xl leading-none">{currentExercise.icon}</div>
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
      <div className="mx-auto mt-6 flex w-full max-w-sm flex-wrap items-center justify-center gap-3">
        {/* Previous */}
        <button
          onClick={previous}
          disabled={phase === 'idle' || phase === 'complete'}
          className="rounded-xl border border-edge bg-card p-3 text-slate-300 transition-colors hover:bg-card-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-30"
          title="Previous (←)"
          aria-label="Previous exercise"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Pause / Resume */}
        <button
          onClick={togglePause}
          disabled={phase === 'idle' || phase === 'complete'}
          className="rounded-xl bg-accent px-8 py-3 text-sm font-bold text-slate-900 shadow-lg shadow-cyan-900/30 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-30"
          title="Pause/Resume (Space)"
          aria-label={isPaused ? 'Resume workout' : 'Pause workout'}
        >
          {isPaused ? 'Resume' : 'Pause'}
        </button>

        {/* Skip */}
        <button
          onClick={skip}
          disabled={phase === 'idle' || phase === 'complete'}
          className="rounded-xl border border-edge bg-card p-3 text-slate-300 transition-colors hover:bg-card-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-30"
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
          className="rounded-xl border border-edge bg-card p-3 text-slate-300 transition-colors hover:bg-card-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
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
          className="rounded-xl border border-edge bg-card p-3 text-slate-300 transition-colors hover:bg-card-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
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
