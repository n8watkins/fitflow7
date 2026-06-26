import { describe, it, expect, beforeEach } from 'vitest'
import { useTimerStore } from '../src/store/timerStore'
import { getSessions } from '../src/lib/storage'
import { DEFAULT_SETTINGS } from '../src/types'
import type { Routine } from '../src/types'

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
