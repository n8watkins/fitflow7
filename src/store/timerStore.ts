import { create } from 'zustand'
import type { Exercise, Routine, UserSettings, WorkoutPhase, WorkoutSession } from '../types'
import { newId, saveSession, setLastRoutineId } from '../lib/storage'

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
  exercisesCompleted: number

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
// Guard against double-saving.
// ---------------------------------------------------------------------------
let sessionSaved = false

function maybeSaveSession(
  state: TimerState,
  naturalFinish: boolean,
): void {
  if (sessionSaved) return
  sessionSaved = true
  const nowIso = new Date().toISOString()
  const session = buildSession(state, naturalFinish, nowIso)
  saveSession(session)
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
  cueEvent: null,

  // -------------------------------------------------------------------------
  // start
  // -------------------------------------------------------------------------
  start(routine, exercises, settings) {
    clearTick()
    sessionSaved = false

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
      startedAt: new Date().toISOString(),
      exercisesCompleted: 0,
      cueEvent: nextCue('start'),
    })

    startTick(() => get().tick())
  },

  // -------------------------------------------------------------------------
  // tick — called every second by setInterval
  // -------------------------------------------------------------------------
  tick() {
    const state = get()
    if (state.isPaused) return

    const { phase, secondsLeft, currentIndex, exercises, routine } = state
    if (phase === 'idle' || phase === 'complete' || !routine) return

    const newSecondsLeft = secondsLeft - 1

    // Last 3 seconds of work or rest — emit countdown cue
    const isCountdownTick =
      (phase === 'work' || phase === 'rest') && newSecondsLeft >= 0 && newSecondsLeft <= 2

    if (newSecondsLeft > 0) {
      set({
        secondsLeft: newSecondsLeft,
        ...(isCountdownTick ? { cueEvent: nextCue('countdown') } : {}),
      })
      return
    }

    // secondsLeft has hit 0 — advance phase
    if (phase === 'prepare') {
      // Prepare → first work phase
      const workSecs = routine.workSeconds
      set({
        phase: 'work',
        currentIndex: 0,
        secondsLeft: workSecs,
        totalSeconds: workSecs,
        cueEvent: nextCue('work'),
      })
      return
    }

    if (phase === 'work') {
      // Count this exercise as completed
      const newCompleted = state.exercisesCompleted + 1

      if (isLastExercise(exercises, currentIndex)) {
        // Finished last exercise's work phase → complete
        clearTick()
        set({
          phase: 'complete',
          exercisesCompleted: newCompleted,
          secondsLeft: 0,
          cueEvent: nextCue('complete'),
        })
        maybeSaveSession({ ...state, exercisesCompleted: newCompleted }, true)
        return
      }

      // Not the last exercise — go to rest
      const restSecs = routine.restSeconds
      set({
        phase: 'rest',
        exercisesCompleted: newCompleted,
        secondsLeft: restSecs,
        totalSeconds: restSecs,
        cueEvent: nextCue('rest'),
      })
      return
    }

    if (phase === 'rest') {
      // Rest → next work
      const nextIndex = currentIndex + 1
      const workSecs = routine.workSeconds
      set({
        phase: 'work',
        currentIndex: nextIndex,
        secondsLeft: workSecs,
        totalSeconds: workSecs,
        cueEvent: nextCue('work'),
      })
      return
    }
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
    set({ isPaused: false })
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
      maybeSaveSession({ ...state, exercisesCompleted: newCompleted }, false)
      return
    }

    // Go to next exercise's work phase
    const nextIndex = currentIndex + 1
    const workSecs = routine.workSeconds
    const newCompleted = wasInWork
      ? state.exercisesCompleted + 1
      : state.exercisesCompleted
    set({
      phase: 'work',
      currentIndex: nextIndex,
      secondsLeft: workSecs,
      totalSeconds: workSecs,
      exercisesCompleted: newCompleted,
      cueEvent: nextCue('work'),
    })
  },

  // -------------------------------------------------------------------------
  // previous — go to previous exercise's work phase (or restart current)
  // -------------------------------------------------------------------------
  previous() {
    const state = get()
    const { phase, currentIndex, routine } = state
    if (!routine || phase === 'idle' || phase === 'complete') return

    const workSecs = routine.workSeconds

    if (currentIndex === 0 || phase === 'prepare') {
      // Already at first — restart current work (or re-enter prepare if applicable)
      set({
        phase: 'work',
        currentIndex: 0,
        secondsLeft: workSecs,
        totalSeconds: workSecs,
        cueEvent: nextCue('work'),
      })
      return
    }

    // Go to previous exercise's work phase
    const prevIndex = currentIndex - 1
    set({
      phase: 'work',
      currentIndex: prevIndex,
      secondsLeft: workSecs,
      totalSeconds: workSecs,
      cueEvent: nextCue('work'),
    })
  },

  // -------------------------------------------------------------------------
  // endWorkout — abandon; build incomplete session
  // -------------------------------------------------------------------------
  endWorkout() {
    const state = get()
    clearTick()
    set({
      phase: 'complete',
      cueEvent: nextCue('complete'),
    })
    maybeSaveSession(state, false)
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
    sessionSaved = false
    set({
      routine: undefined,
      exercises: [],
      phase: 'idle',
      currentIndex: 0,
      secondsLeft: 0,
      totalSeconds: 0,
      isPaused: false,
      startedAt: undefined,
      exercisesCompleted: 0,
      cueEvent: null,
    })
  },
}))
