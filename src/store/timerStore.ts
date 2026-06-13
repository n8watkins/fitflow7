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

    // Finding 4: visibility-change drift correction
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return
      const s = get()
      if (s.isPaused || s.phase === 'idle' || s.phase === 'complete') return

      let currentPhase = s.phase as WorkoutPhase
      let { phaseEndsAt, currentIndex, exercisesCompleted } = s
      const nowMs = Date.now()

      // Fast-forward through any overdue phases
      while (phaseEndsAt <= nowMs && currentPhase !== 'complete' && s.routine) {
        if (currentPhase === 'prepare') {
          currentPhase = 'work'
          phaseEndsAt = nowMs + s.routine.workSeconds * 1000
        } else if (currentPhase === 'work') {
          exercisesCompleted += 1
          if (isLastExercise(s.exercises, currentIndex)) {
            currentPhase = 'complete'
            break
          }
          currentIndex += 1
          currentPhase = 'rest'
          phaseEndsAt = nowMs + s.routine.restSeconds * 1000
        } else if (currentPhase === 'rest') {
          currentPhase = 'work'
          phaseEndsAt = nowMs + s.routine.workSeconds * 1000
        } else {
          break
        }
      }

      if (currentPhase === 'complete') {
        clearTick()
        set({ phase: 'complete', secondsLeft: 0, exercisesCompleted, cueEvent: nextCue('complete') })
        maybeSaveSession(
          { ...get(), exercisesCompleted },
          false,
          (completedAt) => set({ sessionSaved: true, completedAt }),
        )
        return
      }

      const newSecondsLeft = Math.max(0, Math.round((phaseEndsAt - nowMs) / 1000))
      set({
        phase: currentPhase,
        currentIndex,
        exercisesCompleted,
        secondsLeft: newSecondsLeft,
        phaseEndsAt,
        cueEvent: currentPhase !== s.phase
          ? nextCue((currentPhase === 'work' || currentPhase === 'rest' ? currentPhase : 'work') as CueEventType)
          : s.cueEvent,
      })
    }

    document.addEventListener('visibilitychange', handleVisibility)
    // Store cleanup fn so we can remove it on reset/start
    ;(useTimerStore as unknown as { _visCleanup?: () => void })._visCleanup?.()
    ;(useTimerStore as unknown as { _visCleanup?: () => void })._visCleanup = () => {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
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
        maybeSaveSession(
          { ...state, exercisesCompleted: newCompleted },
          true,
          (completedAt) => set({ sessionSaved: true, completedAt }),
        )
        return
      }

      // Not the last exercise — go to rest
      const restSecs = routine.restSeconds
      const newPhaseEndsAt = Date.now() + restSecs * 1000
      set({
        phase: 'rest',
        exercisesCompleted: newCompleted,
        secondsLeft: restSecs,
        totalSeconds: restSecs,
        phaseEndsAt: newPhaseEndsAt,
        cueEvent: nextCue('rest'),
      })
      return
    }

    if (phase === 'rest') {
      // Rest → next work
      const nextIndex = currentIndex + 1
      const workSecs = routine.workSeconds
      const newPhaseEndsAt = Date.now() + workSecs * 1000
      set({
        phase: 'work',
        currentIndex: nextIndex,
        secondsLeft: workSecs,
        totalSeconds: workSecs,
        phaseEndsAt: newPhaseEndsAt,
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
    ;(useTimerStore as unknown as { _visCleanup?: () => void })._visCleanup?.()
    ;(useTimerStore as unknown as { _visCleanup?: () => void })._visCleanup = undefined
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
