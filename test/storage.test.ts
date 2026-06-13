import { describe, it, expect } from 'vitest'
import * as storage from '../src/lib/storage'
import { DEFAULT_SETTINGS, type Routine, type WorkoutSession } from '../src/types'

function makeRoutine(over: Partial<Routine> = {}): Routine {
  return {
    id: 'r1',
    name: 'R',
    exerciseIds: ['a', 'b'],
    workSeconds: 30,
    restSeconds: 10,
    rounds: 1,
    isSystem: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

function makeSession(over: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 's1',
    routineName: 'R',
    startedAt: '2026-06-01T10:00:00.000Z',
    durationSeconds: 420,
    completed: true,
    exercisesCompleted: 12,
    totalExercises: 12,
    ...over,
  }
}

describe('runMigrations (v0 -> v1)', () => {
  it('marks legacy routines dirty and backfills session updatedAt', () => {
    // Legacy blobs: no schemaVersion, routines without `dirty`, session without updatedAt.
    localStorage.setItem('fitflow.routines', JSON.stringify([makeRoutine({ id: 'leg' })]))
    localStorage.setItem(
      'fitflow.sessions',
      JSON.stringify([makeSession({ id: 'legs', startedAt: '2026-05-01T08:00:00.000Z' })]),
    )

    storage.runMigrations()

    const pending = storage.getPendingSync()
    expect(pending.routines.map((r) => r.id)).toContain('leg')
    const legs = pending.sessions.find((s) => s.id === 'legs')
    expect(legs?.updatedAt).toBe('2026-05-01T08:00:00.000Z') // backfilled from startedAt
    expect(localStorage.getItem('fitflow.schemaVersion')).toBe('1')
  })

  it('is idempotent', () => {
    storage.runMigrations()
    storage.runMigrations()
    expect(localStorage.getItem('fitflow.schemaVersion')).toBe('1')
  })
})

describe('routines: tombstones + dirty queue', () => {
  it('saveRoutine marks dirty; getRoutines hides tombstones; delete stays pending', () => {
    storage.saveRoutine(makeRoutine({ id: 'a' }))
    storage.saveRoutine(makeRoutine({ id: 'b' }))
    expect(storage.getRoutines().map((r) => r.id).sort()).toEqual(['a', 'b'])

    storage.deleteRoutine('a')
    expect(storage.getRoutines().map((r) => r.id)).toEqual(['b'])

    // the tombstone must still push so the delete propagates
    const tomb = storage.getPendingSync().routines.find((r) => r.id === 'a')
    expect(tomb?.deletedAt).toBeTruthy()
  })
})

describe('sessions: ordering + clear', () => {
  it('getSessions sorts newest-first and hides tombstones', () => {
    storage.saveSession(makeSession({ id: 'old', startedAt: '2026-06-01T10:00:00.000Z' }))
    storage.saveSession(makeSession({ id: 'new', startedAt: '2026-06-10T10:00:00.000Z' }))
    expect(storage.getSessions().map((s) => s.id)).toEqual(['new', 'old'])
  })

  it('clearSessions tombstones all but keeps them pending', () => {
    storage.saveSession(makeSession({ id: 'x' }))
    storage.clearSessions()
    expect(storage.getSessions()).toHaveLength(0)
    const pend = storage.getPendingSync().sessions
    expect(pend).toHaveLength(1)
    expect(pend[0].deletedAt).toBeTruthy()
  })
})

describe('markSynced (updatedAt-aware)', () => {
  it('clears dirty when the record is unchanged since the push', () => {
    storage.saveRoutine(makeRoutine({ id: 'a', updatedAt: 'T1' }))
    const pushed = storage.getPendingSync()
    storage.markSynced({ routines: pushed.routines, sessions: pushed.sessions })
    expect(storage.getPendingSync().routines).toHaveLength(0)
  })

  it('keeps dirty when the record was edited mid-sync (no silent drop)', () => {
    storage.saveRoutine(makeRoutine({ id: 'a', updatedAt: 'T1' }))
    const pushed = storage.getPendingSync().routines // snapshot at T1
    storage.saveRoutine(makeRoutine({ id: 'a', updatedAt: 'T2' })) // concurrent edit
    storage.markSynced({ routines: pushed })

    const stillPending = storage.getPendingSync().routines
    expect(stillPending).toHaveLength(1)
    expect(stillPending[0].updatedAt).toBe('T2') // the new edit re-pushes next sync
  })
})

describe('applyRemoteRoutines (last-write-wins)', () => {
  it('newer remote overwrites local and marks it clean', () => {
    storage.saveRoutine(makeRoutine({ id: 'a', name: 'local', updatedAt: '2026-01-01T00:00:00.000Z' }))
    storage.applyRemoteRoutines([
      makeRoutine({ id: 'a', name: 'remote', updatedAt: '2026-02-01T00:00:00.000Z' }),
    ])
    expect(storage.getRoutines().find((r) => r.id === 'a')?.name).toBe('remote')
    expect(storage.getPendingSync().routines).toHaveLength(0)
  })

  it('ignores an older remote record', () => {
    storage.saveRoutine(makeRoutine({ id: 'a', name: 'local', updatedAt: '2026-02-01T00:00:00.000Z' }))
    storage.applyRemoteRoutines([
      makeRoutine({ id: 'a', name: 'remote-old', updatedAt: '2026-01-01T00:00:00.000Z' }),
    ])
    expect(storage.getRoutines().find((r) => r.id === 'a')?.name).toBe('local')
  })

  it('applies a remote tombstone so deletes propagate', () => {
    storage.saveRoutine(makeRoutine({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' }))
    storage.applyRemoteRoutines([
      makeRoutine({ id: 'a', updatedAt: '2026-03-01T00:00:00.000Z', deletedAt: '2026-03-01T00:00:00.000Z' }),
    ])
    expect(storage.getRoutines().find((r) => r.id === 'a')).toBeUndefined()
  })
})

describe('settings sync', () => {
  it('saveSettings marks pending; a newer remote wins and clears pending', () => {
    storage.saveSettings({ ...DEFAULT_SETTINGS, defaultWorkSeconds: 45 })
    expect(storage.getPendingSettings()?.value.defaultWorkSeconds).toBe(45)

    storage.applyRemoteSettings({ ...DEFAULT_SETTINGS, defaultWorkSeconds: 60 }, '2999-01-01T00:00:00.000Z')
    expect(storage.getSettings().defaultWorkSeconds).toBe(60)
    expect(storage.getPendingSettings()).toBeUndefined()
  })

  it('ignores older remote settings', () => {
    storage.saveSettings({ ...DEFAULT_SETTINGS, defaultWorkSeconds: 45 })
    storage.applyRemoteSettings({ ...DEFAULT_SETTINGS, defaultWorkSeconds: 99 }, '2000-01-01T00:00:00.000Z')
    expect(storage.getSettings().defaultWorkSeconds).toBe(45)
  })
})

describe('sync cursor', () => {
  it('round-trips and clears', () => {
    expect(storage.getSyncCursor()).toBeUndefined()
    storage.setSyncCursor('2026-06-12T00:00:00.000Z')
    expect(storage.getSyncCursor()).toBe('2026-06-12T00:00:00.000Z')
    storage.clearSyncCursor()
    expect(storage.getSyncCursor()).toBeUndefined()
  })
})
