import { create } from 'zustand'
import type { Exercise, Routine, UserSettings, WorkoutPhase, WorkoutSession } from '../types'
import { newId, saveSession, setLastRoutineId } from '../lib/storage'
import { writeWorkoutToHealth } from '../lib/healthConnect'

// ---------------------------------------------------------------------------
// Audio cue event shape exposed to the Player for audio hooks.
// ---------------------------------------------------------------------------
export type CueEventType = 'start' | 'work' | 'rest' | 'countdown' | 'complete'

export type CueEvent = {
  type: CueEventType
  seq: number
}

// ---------------------------------------------------------------------------
// Timer state shape
// ---------------------------------------------------------------------------
export type TimerState = {
  routine?: Routine
  exercises: Exercise[]
  phase: WorkoutPhase
  currentIndex: number
  secondsLeft: number
  totalSeconds: number
  isPaused: boolean
  isMuted: boolean
  startedAt?: string
  /** ISO timestamp captured when the workout reaches the complete phase. */
  completedAt?: string
  exercisesCompleted: number
  sessionSaved: boolean

  /** Wall-clock timestamp (ms) when the current phase ends — for drift correction. */
  phaseEndsAt: number

  /** Initial prepare countdown seconds — stored so previous() can restart it. */
  countdownSeconds: number

  /** Audio cue — updated on phase transitions and on last-3-second countdown ticks. */
  cueEvent: CueEvent | null

  // Actions
  start(routine: Routine, exercises: Exercise[], settings: UserSettings): void
  tick(): void
  pause(): void
  resume(): void
  togglePause(): void
  skip(): void
  previous(): void
  endWorkout(): void
  toggleMute(): void
  reset(): void
}

// ---------------------------------------------------------------------------
// Module-level interval handle — ensures we never leak two intervals.
// ---------------------------------------------------------------------------
let intervalHandle: ReturnType<typeof setInterval> | null = null

function clearTick(): void {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}

function startTick(fn: () => void): void {
  clearTick()
  intervalHandle = setInterval(fn, 1000)
}

// ---------------------------------------------------------------------------
// Module-level visibilitychange cleanup handle. A plain `let` (mirroring
// intervalHandle) replaces the previous `as unknown as` cast that smuggled the
// cleanup onto the store object. See Finding L7.
// ---------------------------------------------------------------------------
let visCleanup: (() => void) | null = null

function clearVisListener(): void {
  if (visCleanup) {
    visCleanup()
    visCleanup = null
  }
}

// ---------------------------------------------------------------------------
// Seq counter for cue events
// ---------------------------------------------------------------------------
let cueSeq = 0

function nextCue(type: CueEventType): CueEvent {
  return { type, seq: ++cueSeq }
}

// ---------------------------------------------------------------------------
// Helper: was this the last exercise in the array?
// ---------------------------------------------------------------------------
function isLastExercise(exercises: Exercise[], index: number): boolean {
  return index >= exercises.length - 1
}

// ---------------------------------------------------------------------------
// Pure phase-transition reducer (Findings H1 + M3).
//
// Both tick() (one step at the 1s cadence) and the visibilitychange catch-up
// loop (looped until caught up) go through this single function, so the
// work→rest→work→complete rules — and the exercisesCompleted increment — exist
// in exactly one place and can never diverge between a foreground tab and a
// backgrounded-then-restored one.
//
// Crucially, phaseEndsAt is ACCUMULATED (`+= duration`), not rebased onto a
// fixed "now". That is what lets the catch-up loop walk through every elapsed
// phase: rebasing onto a single nowMs made phaseEndsAt jump past nowMs after the
// first transition, so the loop exited after one step and the timer stayed stuck
// phases behind reality (the H1 bug).
//
// Index semantics match the canonical tick() encoding: currentIndex advances on
// the rest→work transition, so during a rest phase currentIndex is the exercise
// that just finished (relied on by previous()). On 'complete', currentIndex and
// phaseEndsAt are left unchanged.
// ---------------------------------------------------------------------------
export interface PhaseStep {
  phase: WorkoutPhase
  currentIndex: number
  exercisesCompleted: number
  phaseEndsAt: number
}

export function advancePhase(prev: PhaseStep, routine: Routine, exerciseCount: number): PhaseStep {
  switch (prev.phase) {
    case 'prepare':
      return {
        phase: 'work',
        currentIndex: 0,
        exercisesCompleted: prev.exercisesCompleted,
        phaseEndsAt: prev.phaseEndsAt + routine.workSeconds * 1000,
      }
    case 'work': {
      const exercisesCompleted = prev.exercisesCompleted + 1
      if (prev.currentIndex >= exerciseCount - 1) {
        return { phase: 'complete', currentIndex: prev.currentIndex, exercisesCompleted, phaseEndsAt: prev.phaseEndsAt }
      }
      return {
        phase: 'rest',
        currentIndex: prev.currentIndex,
        exercisesCompleted,
        phaseEndsAt: prev.phaseEndsAt + routine.restSeconds * 1000,
      }
    }
    case 'rest':
      return {
        phase: 'work',
        currentIndex: prev.currentIndex + 1,
        exercisesCompleted: prev.exercisesCompleted,
        phaseEndsAt: prev.phaseEndsAt + routine.workSeconds * 1000,
      }
    default:
      return prev
  }
}

// ---------------------------------------------------------------------------
// Build a completed WorkoutSession from store state.
// ---------------------------------------------------------------------------
function buildSession(
  state: TimerState,
  naturalFinish: boolean,
  nowIso: string,
): WorkoutSession {
  const startedAt = state.startedAt ?? nowIso
  const durationSeconds = Math.round(
    (new Date(nowIso).getTime() - new Date(startedAt).getTime()) / 1000,
  )
  return {
    id: newId(),
    routineId: state.routine?.id,
    routineName: state.routine?.name ?? 'Workout',
    startedAt,
    completedAt: nowIso,
    durationSeconds,
    completed: naturalFinish,
    exercisesCompleted: state.exercisesCompleted,
    totalExercises: state.exercises.length,
  }
}

// ---------------------------------------------------------------------------
// Guard against double-saving — now uses store state (see Finding 2).
// ---------------------------------------------------------------------------
function maybeSaveSession(
  state: TimerState,
  naturalFinish: boolean,
  markSaved: (completedAt: string) => void,
): void {
  if (state.sessionSaved) return
  const nowIso = new Date().toISOString()
  markSaved(nowIso)
  const session = buildSession(state, naturalFinish, nowIso)
  saveSession(session)
  // Best-effort mirror to Android Health Connect (no-op on web). See healthConnect.ts.
  writeWorkoutToHealth(session)
  if (state.routine?.id) {
    setLastRoutineId(state.routine.id)
  }
}

// ---------------------------------------------------------------------------
// Zustand store
// ---------------------------------------------------------------------------
export const useTimerStore = create<TimerState>((set, get) => ({
  // Initial idle state
  routine: undefined,
  exercises: [],
  phase: 'idle',
  currentIndex: 0,
  secondsLeft: 0,
  totalSeconds: 0,
  isPaused: false,
  isMuted: false,
  startedAt: undefined,
  exercisesCompleted: 0,
  sessionSaved: false,
  phaseEndsAt: 0,
  countdownSeconds: 0,
  cueEvent: null,

  // -------------------------------------------------------------------------
  // start
  // -------------------------------------------------------------------------
  start(routine, exercises, settings) {
    clearTick()

    // Guard: an all-unknown-exercise routine (e.g. a clone/import whose ids no
    // longer resolve) yields an empty list. Starting it would instantly hit the
    // "last exercise" branch and log a 0-exercise "completed" session (and even
    // auto-complete a challenge day). Stay idle instead — the Player shows a
    // guard screen. See B3.
    if (exercises.length === 0) {
      set({
        routine,
        exercises: [],
        phase: 'idle',
        currentIndex: 0,
        secondsLeft: 0,
        totalSeconds: 0,
        isPaused: false,
        startedAt: undefined,
        completedAt: undefined,
        exercisesCompleted: 0,
        sessionSaved: false,
        phaseEndsAt: 0,
        countdownSeconds: settings.countdownSeconds,
        cueEvent: null,
      })
      return
    }

    const hasPrepare = settings.countdownSeconds > 0
    const phase: WorkoutPhase = hasPrepare ? 'prepare' : 'work'
    const seconds = hasPrepare ? settings.countdownSeconds : routine.workSeconds

    set({
      routine,
      exercises,
      phase,
      currentIndex: 0,
      secondsLeft: seconds,
      totalSeconds: seconds,
      isPaused: false,
      isMuted: !settings.audioCuesEnabled,
      startedAt: new Date().toISOString(),
      completedAt: undefined,
      exercisesCompleted: 0,
      sessionSaved: false,
      phaseEndsAt: Date.now() + seconds * 1000,
      countdownSeconds: settings.countdownSeconds,
      cueEvent: nextCue('start'),
    })

    startTick(() => get().tick())

    // Finding H1: visibility-change drift correction. On return-to-foreground,
    // fast-forward through EVERY phase whose boundary already passed. advancePhase
    // accumulates phaseEndsAt, so the loop walks all elapsed phases (the old code
    // rebased onto a fixed nowMs and exited after a single step).
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return
      const s = get()
      if (s.isPaused || s.phase === 'idle' || s.phase === 'complete' || !s.routine) return

      const nowMs = Date.now()
      let step: PhaseStep = {
        phase: s.phase,
        currentIndex: s.currentIndex,
        exercisesCompleted: s.exercisesCompleted,
        phaseEndsAt: s.phaseEndsAt,
      }
      while (step.phaseEndsAt <= nowMs && step.phase !== 'complete') {
        step = advancePhase(step, s.routine, s.exercises.length)
      }

      if (step.phase === 'complete') {
        clearTick()
        set({ phase: 'complete', secondsLeft: 0, exercisesCompleted: step.exercisesCompleted, cueEvent: nextCue('complete') })
        // The full timeline elapsed while backgrounded — this is a genuine,
        // natural completion (parity with tick()), so persist completed:true.
        // Finding M3: the old handler passed `false` here, saving a finished
        // workout as abandoned.
        maybeSaveSession(
          { ...get(), exercisesCompleted: step.exercisesCompleted },
          true,
          (completedAt) => set({ sessionSaved: true, completedAt }),
        )
        return
      }

      const phaseDuration = step.phase === 'rest' ? s.routine.restSeconds : s.routine.workSeconds
      const newSecondsLeft = Math.max(0, Math.round((step.phaseEndsAt - nowMs) / 1000))
      set({
        phase: step.phase,
        currentIndex: step.currentIndex,
        exercisesCompleted: step.exercisesCompleted,
        secondsLeft: newSecondsLeft,
        totalSeconds: phaseDuration,
        phaseEndsAt: step.phaseEndsAt,
        cueEvent: step.phase !== s.phase ? nextCue(step.phase === 'rest' ? 'rest' : 'work') : s.cueEvent,
      })
    }

    // Remove any stale listener from a prior start(), then register this one.
    clearVisListener()
    document.addEventListener('visibilitychange', handleVisibility)
    visCleanup = () => document.removeEventListener('visibilitychange', handleVisibility)
  },

  // -------------------------------------------------------------------------
  // tick — called every second by setInterval
  // -------------------------------------------------------------------------
  tick() {
    const state = get()
    if (state.isPaused) return

    const { phase, currentIndex, exercises, routine, phaseEndsAt } = state
    if (phase === 'idle' || phase === 'complete' || !routine) return

    // Finding 4: re-derive from wall clock to avoid drift
    const newSecondsLeft = Math.max(0, Math.round((phaseEndsAt - Date.now()) / 1000))

    // Countdown cue for the last 3 seconds of a work/rest phase (3-2-1). The
    // `> 0` guard below means this only fires at 3, 2, 1 — Finding L1: the old
    // `>= 0 && <= 2` threshold produced only a 2-1 beep despite the "last 3
    // seconds" intent.
    const isCountdownTick =
      (phase === 'work' || phase === 'rest') && newSecondsLeft <= 3

    if (newSecondsLeft > 0) {
      set({
        secondsLeft: newSecondsLeft,
        ...(isCountdownTick ? { cueEvent: nextCue('countdown') } : {}),
      })
      return
    }

    // secondsLeft has hit 0 — advance exactly one phase via the shared reducer.
    const next = advancePhase(
      { phase, currentIndex, exercisesCompleted: state.exercisesCompleted, phaseEndsAt },
      routine,
      exercises.length,
    )

    if (next.phase === 'complete') {
      clearTick()
      set({
        phase: 'complete',
        exercisesCompleted: next.exercisesCompleted,
        secondsLeft: 0,
        cueEvent: nextCue('complete'),
      })
      maybeSaveSession(
        { ...state, exercisesCompleted: next.exercisesCompleted },
        true,
        (completedAt) => set({ sessionSaved: true, completedAt }),
      )
      return
    }

    const phaseDuration = next.phase === 'rest' ? routine.restSeconds : routine.workSeconds
    set({
      phase: next.phase,
      currentIndex: next.currentIndex,
      exercisesCompleted: next.exercisesCompleted,
      secondsLeft: phaseDuration,
      totalSeconds: phaseDuration,
      phaseEndsAt: next.phaseEndsAt,
      cueEvent: nextCue(next.phase === 'rest' ? 'rest' : 'work'),
    })
  },

  // -------------------------------------------------------------------------
  // pause / resume / togglePause
  // -------------------------------------------------------------------------
  pause() {
    clearTick()
    set({ isPaused: true })
  },

  resume() {
    const state = get()
    if (!state.isPaused) return
    // Finding 4: re-anchor phaseEndsAt from the remaining secondsLeft
    const newPhaseEndsAt = Date.now() + state.secondsLeft * 1000
    set({ isPaused: false, phaseEndsAt: newPhaseEndsAt })
    startTick(() => get().tick())
  },

  togglePause() {
    const { isPaused } = get()
    if (isPaused) {
      get().resume()
    } else {
      get().pause()
    }
  },

  // -------------------------------------------------------------------------
  // skip — jump to next exercise's work phase (or complete if on last)
  // -------------------------------------------------------------------------
  skip() {
    const state = get()
    const { phase, currentIndex, exercises, routine } = state
    if (!routine || phase === 'idle' || phase === 'complete') return

    // If currently in work, count this exercise before skipping
    const wasInWork = phase === 'work'

    if (isLastExercise(exercises, currentIndex)) {
      // Skip on last exercise → complete
      clearTick()
      const newCompleted = wasInWork
        ? state.exercisesCompleted + 1
        : state.exercisesCompleted
      set({
        phase: 'complete',
        exercisesCompleted: newCompleted,
        secondsLeft: 0,
        cueEvent: nextCue('complete'),
      })
      maybeSaveSession(
        { ...state, exercisesCompleted: newCompleted },
        false,
        (completedAt) => set({ sessionSaved: true, completedAt }),
      )
      return
    }

    // Go to next exercise's work phase
    const nextIndex = currentIndex + 1
    const workSecs = routine.workSeconds
    const newCompleted = wasInWork
      ? state.exercisesCompleted + 1
      : state.exercisesCompleted
    const newPhaseEndsAt = Date.now() + workSecs * 1000
    set({
      phase: 'work',
      currentIndex: nextIndex,
      secondsLeft: workSecs,
      totalSeconds: workSecs,
      exercisesCompleted: newCompleted,
      phaseEndsAt: newPhaseEndsAt,
      cueEvent: nextCue('work'),
    })
  },

  // -------------------------------------------------------------------------
  // previous — go to previous exercise's work phase (or restart current)
  // -------------------------------------------------------------------------
  previous() {
    const state = get()
    const { phase, currentIndex, routine, countdownSeconds } = state
    if (!routine || phase === 'idle' || phase === 'complete') return

    const workSecs = routine.workSeconds

    // Finding 10: during prepare, restart the prepare countdown
    if (phase === 'prepare') {
      const secs = countdownSeconds > 0 ? countdownSeconds : workSecs
      set({
        phase: 'prepare',
        currentIndex: 0,
        secondsLeft: secs,
        totalSeconds: secs,
        phaseEndsAt: Date.now() + secs * 1000,
        cueEvent: nextCue('start'),
      })
      return
    }

    if (currentIndex === 0) {
      // Already at first exercise — restart current work
      const newPhaseEndsAt = Date.now() + workSecs * 1000
      set({
        phase: 'work',
        currentIndex: 0,
        secondsLeft: workSecs,
        totalSeconds: workSecs,
        phaseEndsAt: newPhaseEndsAt,
        cueEvent: nextCue('work'),
      })
      return
    }

    // During rest, currentIndex is the exercise that just finished its work phase.
    // "Previous" should restart that same exercise (not go one further back).
    if (phase === 'rest') {
      const newPhaseEndsAt = Date.now() + workSecs * 1000
      set({
        phase: 'work',
        currentIndex,
        secondsLeft: workSecs,
        totalSeconds: workSecs,
        phaseEndsAt: newPhaseEndsAt,
        cueEvent: nextCue('work'),
      })
      return
    }

    // During work, go to the previous exercise's work phase.
    const prevIndex = currentIndex - 1
    const newPhaseEndsAt = Date.now() + workSecs * 1000
    set({
      phase: 'work',
      currentIndex: prevIndex,
      secondsLeft: workSecs,
      totalSeconds: workSecs,
      phaseEndsAt: newPhaseEndsAt,
      cueEvent: nextCue('work'),
    })
  },

  // -------------------------------------------------------------------------
  // endWorkout — abandon; build incomplete session
  // -------------------------------------------------------------------------
  endWorkout() {
    const state = get()
    // Finding 14: guard against idle/complete
    if (state.phase === 'idle' || state.phase === 'complete') return
    clearTick()
    set({
      phase: 'complete',
      cueEvent: nextCue('complete'),
    })
    maybeSaveSession(state, false, (completedAt) => set({ sessionSaved: true, completedAt }))
  },

  // -------------------------------------------------------------------------
  // toggleMute
  // -------------------------------------------------------------------------
  toggleMute() {
    set((s) => ({ isMuted: !s.isMuted }))
  },

  // -------------------------------------------------------------------------
  // reset — return to idle
  // -------------------------------------------------------------------------
  reset() {
    clearTick()
    clearVisListener()
    set({
      routine: undefined,
      exercises: [],
      phase: 'idle',
      currentIndex: 0,
      secondsLeft: 0,
      totalSeconds: 0,
      isPaused: false,
      startedAt: undefined,
      completedAt: undefined,
      exercisesCompleted: 0,
      sessionSaved: false,
      phaseEndsAt: 0,
      countdownSeconds: 0,
      cueEvent: null,
    })
  },
}))
