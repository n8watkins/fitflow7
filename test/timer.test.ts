import { describe, it, expect, beforeEach } from 'vitest'
import { useTimerStore, advancePhase, type PhaseStep } from '../src/store/timerStore'
import { getSessions } from '../src/lib/storage'
import { DEFAULT_SETTINGS } from '../src/types'
import type { Routine, Exercise } from '../src/types'

// B3: an all-unknown-exercise routine resolves to an empty exercise list. The
// store must refuse to start it — otherwise the "last exercise" branch fires
// immediately and a 0-exercise "completed" session is logged (and a challenge
// day auto-marked). The empty-list path stays in node (no document/timers).
const emptyRoutine: Routine = {
  id: 'broken',
  name: 'Broken',
  exerciseIds: [],
  workSeconds: 30,
  restSeconds: 10,
  rounds: 1,
  isSystem: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

describe('timer store empty-routine guard (B3)', () => {
  beforeEach(() => {
    useTimerStore.getState().reset()
  })

  it('stays idle and logs no session for a 0-exercise routine', () => {
    useTimerStore.getState().start(emptyRoutine, [], DEFAULT_SETTINGS)
    const s = useTimerStore.getState()
    expect(s.phase).toBe('idle')
    expect(s.exercises).toHaveLength(0)
    expect(getSessions()).toHaveLength(0)
  })
})

// Findings H1 + M3: the phase reducer is shared by tick() and the visibility
// catch-up loop. Testing it directly covers the multi-phase fast-forward that was
// previously only reachable via a real visibilitychange event (and was broken).
describe('advancePhase reducer (H1 + M3)', () => {
  const routine: Routine = {
    id: 'r', name: 'R', exerciseIds: ['a', 'b', 'c'],
    workSeconds: 30, restSeconds: 10, rounds: 1, isSystem: false,
    createdAt: 'x', updatedAt: 'x',
  }
  const count = 3 // 3 exercises -> timeline work30/rest10/work30/rest10/work30 = 110s

  it('prepare -> work (index 0, boundary += workSeconds)', () => {
    expect(advancePhase({ phase: 'prepare', currentIndex: 0, exercisesCompleted: 0, phaseEndsAt: 1000 }, routine, count))
      .toEqual({ phase: 'work', currentIndex: 0, exercisesCompleted: 0, phaseEndsAt: 1000 + 30000 })
  })

  it('work -> rest keeps index, increments completed, boundary += restSeconds', () => {
    expect(advancePhase({ phase: 'work', currentIndex: 0, exercisesCompleted: 0, phaseEndsAt: 1000 }, routine, count))
      .toEqual({ phase: 'rest', currentIndex: 0, exercisesCompleted: 1, phaseEndsAt: 1000 + 10000 })
  })

  it('rest -> work increments index, boundary += workSeconds', () => {
    expect(advancePhase({ phase: 'rest', currentIndex: 0, exercisesCompleted: 1, phaseEndsAt: 1000 }, routine, count))
      .toEqual({ phase: 'work', currentIndex: 1, exercisesCompleted: 1, phaseEndsAt: 1000 + 30000 })
  })

  it('work on the last exercise -> complete (index/boundary unchanged)', () => {
    const r = advancePhase({ phase: 'work', currentIndex: 2, exercisesCompleted: 2, phaseEndsAt: 5000 }, routine, count)
    expect(r.phase).toBe('complete')
    expect(r.exercisesCompleted).toBe(3)
    expect(r.phaseEndsAt).toBe(5000)
  })

  it('catch-up loop fast-forwards through ALL elapsed phases to complete (H1)', () => {
    let step: PhaseStep = { phase: 'work', currentIndex: 0, exercisesCompleted: 0, phaseEndsAt: 30000 }
    const nowMs = 120000 // past the 110s end of the whole workout
    let iterations = 0
    while (step.phaseEndsAt <= nowMs && step.phase !== 'complete') {
      step = advancePhase(step, routine, count)
      iterations++
    }
    expect(step.phase).toBe('complete')
    expect(step.exercisesCompleted).toBe(3)
    // The bug advanced exactly one phase; the fix walks every elapsed boundary.
    expect(iterations).toBeGreaterThan(1)
  })

  it('catch-up stops mid-phase when now is between two boundaries', () => {
    let step: PhaseStep = { phase: 'work', currentIndex: 0, exercisesCompleted: 0, phaseEndsAt: 30000 }
    const nowMs = 55000 // inside exercise 1's work phase (40s..70s)
    while (step.phaseEndsAt <= nowMs && step.phase !== 'complete') {
      step = advancePhase(step, routine, count)
    }
    expect(step).toEqual({ phase: 'work', currentIndex: 1, exercisesCompleted: 1, phaseEndsAt: 70000 })
  })

  // M3 (the headline behavioral half of this block): when the WHOLE timeline
  // elapses while the tab is backgrounded, returning to the foreground must
  // persist the session as a natural completion (completed:true), not abandoned.
  // The tests above only exercise the pure reducer, which reaches 'complete'
  // regardless of the save flag — so they can't catch a regression of the
  // naturalFinish argument. This drives the real visibilitychange handler end to
  // end against a stubbed document and asserts the saved flag, so flipping
  // timerStore's catch-up branch back to `false` fails here.
  it('backgrounded finish saves the session as completed:true (M3)', () => {
    const realNow = Date.now
    const realDoc = (globalThis as { document?: unknown }).document
    let visHandler: (() => void) | undefined
    ;(globalThis as { document?: unknown }).document = {
      visibilityState: 'visible',
      addEventListener: (type: string, h: () => void) => {
        if (type === 'visibilitychange') visHandler = h
      },
      removeEventListener: () => {},
    }
    try {
      const exercises = [{}, {}, {}] as unknown as Exercise[]
      // countdownSeconds:0 starts straight in 'work'; audio off (no DOM in node).
      useTimerStore.getState().start(routine, exercises, {
        ...DEFAULT_SETTINGS,
        countdownSeconds: 0,
        audioCuesEnabled: false,
      })
      // Jump far past the 110s timeline, then simulate return-to-foreground.
      Date.now = () => realNow() + 10_000_000
      visHandler?.()

      const s = useTimerStore.getState()
      expect(s.phase).toBe('complete')
      const saved = getSessions()
      expect(saved).toHaveLength(1)
      expect(saved[0].completed).toBe(true) // guards the M3 false->true fix
      expect(saved[0].exercisesCompleted).toBe(count)
      expect(saved[0].totalExercises).toBe(count)
    } finally {
      Date.now = realNow
      // reset() clears the interval AND removes the visibility listener, whose
      // cleanup closure dereferences document — so run it before restoring it.
      useTimerStore.getState().reset()
      if (realDoc === undefined) delete (globalThis as { document?: unknown }).document
      else (globalThis as { document?: unknown }).document = realDoc
    }
  })
})
