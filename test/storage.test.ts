import { describe, it, expect, vi, afterEach } from 'vitest'
import * as storage from '../src/lib/storage'
import { DEFAULT_SETTINGS, type Routine, type WorkoutSession } from '../src/types'

const DAY_MS = 24 * 60 * 60 * 1000

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

describe('export / import', () => {
  it('round-trips routines, sessions and settings; imports stay dirty', () => {
    storage.saveRoutine(makeRoutine({ id: 'a', name: 'Keep', updatedAt: '2026-05-01T00:00:00.000Z' }))
    storage.saveSession(makeSession({ id: 's' }))
    storage.saveSettings({ ...DEFAULT_SETTINGS, defaultWorkSeconds: 50 })

    const bundle = storage.exportData()
    expect(bundle.app).toBe('fitflow7')
    expect(bundle.routines.some((r) => r.id === 'a')).toBe(true)
    expect(bundle.sessions.some((s) => s.id === 's')).toBe(true)
    expect(bundle.settings.defaultWorkSeconds).toBe(50)

    localStorage.clear() // simulate a fresh browser / wiped storage
    const res = storage.importData(bundle)
    expect(res.routines).toBe(1)
    expect(res.sessions).toBe(1)
    expect(storage.getRoutines().find((r) => r.id === 'a')?.name).toBe('Keep')
    expect(storage.getSessions().map((s) => s.id)).toContain('s')
    expect(storage.getSettings().defaultWorkSeconds).toBe(50)
    // imported records must push on next sign-in
    expect(storage.getPendingSync().routines.some((r) => r.id === 'a')).toBe(true)
  })

  it('skips records older than the local copy (no clobber)', () => {
    storage.saveRoutine(makeRoutine({ id: 'a', name: 'newer', updatedAt: '2026-06-01T00:00:00.000Z' }))
    const stale: storage.ExportBundle = {
      app: 'fitflow7', version: 1, exportedAt: 'x', schemaVersion: 1,
      routines: [makeRoutine({ id: 'a', name: 'older', updatedAt: '2026-01-01T00:00:00.000Z' })],
      sessions: [], settings: DEFAULT_SETTINGS, settingsUpdatedAt: '2000-01-01T00:00:00.000Z',
    }
    expect(storage.importData(stale).routines).toBe(0)
    expect(storage.getRoutines().find((r) => r.id === 'a')?.name).toBe('newer')
  })

  it('ignores system routines and validates the bundle shape', () => {
    const bundle: storage.ExportBundle = {
      app: 'fitflow7', version: 1, exportedAt: 'x', schemaVersion: 1,
      routines: [makeRoutine({ id: 'sys', isSystem: true })],
      sessions: [], settings: DEFAULT_SETTINGS, settingsUpdatedAt: '2026-01-01T00:00:00.000Z',
    }
    expect(storage.importData(bundle).routines).toBe(0)
    expect(storage.isExportBundle({ foo: 1 })).toBe(false)
    expect(storage.isExportBundle(null)).toBe(false)
    expect(storage.isExportBundle(bundle)).toBe(true)
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

describe('weight log', () => {
  it('upserts one entry per day and reads them sorted', () => {
    storage.saveWeightEntry('2026-06-01', 80)
    storage.saveWeightEntry('2026-06-03', 79)
    storage.saveWeightEntry('2026-06-01', 81) // same day -> replace
    const entries = storage.getWeightEntries()
    expect(entries).toHaveLength(2)
    expect(entries[0].date).toBe('2026-06-01')
    expect(entries[0].weightKg).toBe(81)
    expect(storage.getLatestWeight()?.date).toBe('2026-06-03')
  })

  it('soft-deletes an entry', () => {
    storage.saveWeightEntry('2026-06-01', 80)
    const id = storage.getWeightEntries()[0].id
    storage.deleteWeightEntry(id)
    expect(storage.getWeightEntries()).toHaveLength(0)
  })

  it('revives (not duplicates) a deleted day when re-logged', () => {
    storage.saveWeightEntry('2026-06-01', 80)
    const id = storage.getWeightEntries()[0].id
    storage.deleteWeightEntry(id)
    storage.saveWeightEntry('2026-06-01', 82) // same date again
    const entries = storage.getWeightEntries()
    expect(entries).toHaveLength(1) // not two rows
    expect(entries[0].weightKg).toBe(82)
  })
})

describe('body profile', () => {
  it('merges patches and stamps updatedAt', () => {
    storage.saveBodyProfile({ heightCm: 180 })
    storage.saveBodyProfile({ goalWeightKg: 75 })
    const p = storage.getBodyProfile()
    expect(p.heightCm).toBe(180)
    expect(p.goalWeightKg).toBe(75)
    expect(p.updatedAt).not.toBe('')
    expect(p.dirty).toBe(true)
  })
})

describe('challenge progress', () => {
  it('marks and unmarks days', () => {
    storage.markChallengeDay('thirty-day', 1)
    storage.markChallengeDay('thirty-day', 2)
    expect(Object.keys(storage.getChallengeProgressFor('thirty-day')!.completedDays)).toHaveLength(2)
    storage.unmarkChallengeDay('thirty-day', 1)
    expect(storage.getChallengeProgressFor('thirty-day')!.completedDays[1]).toBeUndefined()
    expect(storage.getChallengeProgressFor('thirty-day')!.completedDays[2]).toBeTruthy()
  })

  it('reset tombstones the record', () => {
    storage.markChallengeDay('abs-14', 1)
    storage.resetChallenge('abs-14')
    expect(storage.getChallengeProgressFor('abs-14')).toBeUndefined()
  })
})

describe('B1 sync seam: body/weight/challenge dirty queue + remote merge', () => {
  it('drains dirty body/weight/challenge into getPendingSync and clears on markSynced', () => {
    storage.saveWeightEntry('2026-06-01', 80)
    storage.saveBodyProfile({ heightCm: 180 })
    storage.markChallengeDay('thirty-day', 1)

    const pending = storage.getPendingSync()
    expect(pending.weightLog).toHaveLength(1)
    expect(pending.challengeProgress).toHaveLength(1)
    expect(pending.bodyProfile?.heightCm).toBe(180)

    storage.markSynced({
      weightLog: pending.weightLog,
      challengeProgress: pending.challengeProgress,
      bodyProfile: pending.bodyProfile,
    })
    const after = storage.getPendingSync()
    expect(after.weightLog).toHaveLength(0)
    expect(after.challengeProgress).toHaveLength(0)
    expect(after.bodyProfile).toBeUndefined()
  })

  it('includes weight tombstones in the pending queue so deletes sync', () => {
    storage.saveWeightEntry('2026-06-01', 80)
    const id = storage.getWeightEntries()[0].id
    storage.deleteWeightEntry(id)
    const tomb = storage.getPendingSync().weightLog.find((e) => e.id === id)
    expect(tomb?.deletedAt).toBeTruthy()
  })

  it('applyRemoteWeightLog is last-write-wins and marks merged rows clean', () => {
    storage.saveWeightEntry('2026-06-01', 80) // local, dirty
    const id = storage.getWeightEntries()[0].id
    // Older remote loses; the local dirty value stays.
    storage.applyRemoteWeightLog([{ id, date: '2026-06-01', weightKg: 50, createdAt: 'x', updatedAt: '2000-01-01T00:00:00.000Z' }])
    expect(storage.getWeightEntries()[0].weightKg).toBe(80)
    // Newer remote wins and is clean (no longer pending).
    storage.applyRemoteWeightLog([{ id, date: '2026-06-01', weightKg: 70, createdAt: 'x', updatedAt: '2999-01-01T00:00:00.000Z' }])
    expect(storage.getWeightEntries()[0].weightKg).toBe(70)
    expect(storage.getPendingSync().weightLog.some((e) => e.id === id)).toBe(false)
  })

  it('applyRemoteBodyProfile only applies a newer profile', () => {
    storage.applyRemoteBodyProfile({ heightCm: 190, updatedAt: '2999-01-01T00:00:00.000Z' })
    expect(storage.getBodyProfile().heightCm).toBe(190)
    storage.applyRemoteBodyProfile({ heightCm: 150, updatedAt: '2000-01-01T00:00:00.000Z' })
    expect(storage.getBodyProfile().heightCm).toBe(190) // stale ignored
  })

  it('applyRemoteChallengeProgress merges a remote tombstone (delete propagates)', () => {
    storage.markChallengeDay('thirty-day', 1)
    storage.applyRemoteChallengeProgress([
      { challengeId: 'thirty-day', completedDays: { 1: 'x' }, startedAt: 'x', updatedAt: '2999-01-01T00:00:00.000Z', deletedAt: '2999-01-01T00:00:00.000Z' },
    ])
    expect(storage.getChallengeProgressFor('thirty-day')).toBeUndefined()
  })
})

describe('export/import of body + challenge data', () => {
  it('round-trips weight log, body profile, and challenge progress', () => {
    storage.saveWeightEntry('2026-06-01', 80)
    storage.saveBodyProfile({ heightCm: 178, goalWeightKg: 74 })
    storage.markChallengeDay('thirty-day', 1)

    const bundle = storage.exportData()
    expect(bundle.weightLog?.length).toBe(1)
    expect(bundle.bodyProfile?.heightCm).toBe(178)
    expect(bundle.challengeProgress?.length).toBe(1)

    localStorage.clear()
    const result = storage.importData(bundle)
    expect(result.weightEntries).toBe(1)
    expect(result.bodyProfile).toBe(true)
    expect(result.challenges).toBe(1)
    expect(storage.getLatestWeight()?.weightKg).toBe(80)
    expect(storage.getBodyProfile().goalWeightKg).toBe(74)
    expect(storage.getChallengeProgressFor('thirty-day')?.completedDays[1]).toBeTruthy()
  })
})

describe('applyRemoteWeightLog dedup-by-date (B1 multi-device)', () => {
  const w = (id: string, date: string, weightKg: number, updatedAt: string) => ({
    id, date, weightKg, createdAt: updatedAt, updatedAt,
  })

  it('collapses two devices logging the same day into one live entry', () => {
    storage.applyRemoteWeightLog([w('AAA', '2026-06-01', 80, '2026-06-01T00:00:00.000Z')])
    storage.applyRemoteWeightLog([w('BBB', '2026-06-01', 78, '2026-06-02T00:00:00.000Z')])
    const live = storage.getWeightEntries().filter((e) => e.date === '2026-06-01')
    expect(live).toHaveLength(1)
    expect(live[0].weightKg).toBe(78) // newest survivor
    // the loser is tombstoned + dirty so the delete propagates to other devices
    expect(storage.getPendingSync().weightLog.some((e) => e.id === 'AAA' && e.deletedAt)).toBe(true)
  })
})

describe('applyRemoteChallengeProgress union (B1 multi-device)', () => {
  const c = (over: Record<string, unknown> = {}) => ({
    challengeId: 'c30', completedDays: {} as Record<number, string>,
    startedAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z', ...over,
  })

  it('unions completedDays instead of clobbering one device’s marks', () => {
    storage.applyRemoteChallengeProgress([c({ completedDays: { 3: '2026-06-03T00:00:00.000Z' }, updatedAt: '2026-06-03T00:00:00.000Z' })])
    storage.applyRemoteChallengeProgress([c({ completedDays: { 5: '2026-06-05T00:00:00.000Z' }, updatedAt: '2026-06-05T00:00:00.000Z' })])
    const row = storage.getChallengeProgressFor('c30')
    expect(Object.keys(row?.completedDays ?? {}).sort()).toEqual(['3', '5'])
    // day 3 was local-only → record stays dirty so the union re-pushes
    expect(storage.getPendingSync().challengeProgress.some((x) => x.challengeId === 'c30')).toBe(true)
  })

  it('a newer reset (tombstone) wins over stale completions', () => {
    storage.applyRemoteChallengeProgress([c({ completedDays: { 1: '2026-06-01T00:00:00.000Z' } })])
    storage.applyRemoteChallengeProgress([c({ deletedAt: '2026-06-10T00:00:00.000Z', updatedAt: '2026-06-10T00:00:00.000Z' })])
    expect(storage.getChallengeProgressFor('c30')).toBeUndefined() // reset
  })
})

describe('deleteRoutine propagation (updatedAt bumped)', () => {
  it('a routine tombstone carries a newer updatedAt than the live record', () => {
    storage.saveRoutine(makeRoutine({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' }))
    storage.deleteRoutine('a')
    const tomb = storage.getPendingSync().routines.find((r) => r.id === 'a')!
    expect(tomb.deletedAt).toBeTruthy()
    // Must be > the original 2026-01-01 stamp, or the server LWW guard drops it.
    expect((tomb.updatedAt ?? '') > '2026-01-01T00:00:00.000Z').toBe(true)
  })
})

describe('markSettingsSynced (updatedAt-aware) — Finding M1', () => {
  afterEach(() => vi.useRealTimers())

  it('keeps settings dirty when edited mid-sync (no silent drop)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'))
    storage.saveSettings({ ...DEFAULT_SETTINGS, defaultWorkSeconds: 45 })
    const pushed = storage.getPendingSettings()! // snapshot at t0
    vi.setSystemTime(new Date('2026-06-01T00:00:01.000Z'))
    storage.saveSettings({ ...DEFAULT_SETTINGS, defaultWorkSeconds: 50 }) // edit mid-round-trip
    storage.markSettingsSynced(pushed.updatedAt) // ack the t0 push

    const still = storage.getPendingSettings()
    expect(still).toBeDefined() // the mid-sync edit must NOT be silently cleared
    expect(still?.value.defaultWorkSeconds).toBe(50)
  })

  it('clears dirty when settings are unchanged through the round-trip', () => {
    storage.saveSettings({ ...DEFAULT_SETTINGS, defaultWorkSeconds: 45 })
    const pushed = storage.getPendingSettings()!
    storage.markSettingsSynced(pushed.updatedAt)
    expect(storage.getPendingSettings()).toBeUndefined()
  })
})

describe('applyRemoteChallengeProgress unmark survival — Finding M2', () => {
  const c = (over: Record<string, unknown> = {}) => ({
    challengeId: 'c30', completedDays: {} as Record<number, string>,
    startedAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z', ...over,
  })

  it('a deliberate unmark survives a device that still has the day marked', () => {
    // Device starts with day 5 marked (synced from the server).
    storage.applyRemoteChallengeProgress([c({ completedDays: { 5: '2026-06-05T00:00:00.000Z' }, updatedAt: '2026-06-05T00:00:00.000Z' })])
    // User un-marks day 5 locally (clear timestamp is "now", newer than the mark).
    storage.unmarkChallengeDay('c30', 5)
    expect(storage.getChallengeProgressFor('c30')!.completedDays[5]).toBeUndefined()

    // Another device, still holding the old mark, pushes day 5 back.
    storage.applyRemoteChallengeProgress([c({ completedDays: { 5: '2026-06-05T00:00:00.000Z' }, updatedAt: '2026-06-06T00:00:00.000Z' })])
    // The unmark wins — day 5 is NOT resurrected.
    expect(storage.getChallengeProgressFor('c30')!.completedDays[5]).toBeUndefined()
  })

  it('a re-mark after an unmark wins (latest per-day action)', () => {
    storage.applyRemoteChallengeProgress([c({ completedDays: { 5: '2026-06-05T00:00:00.000Z' }, updatedAt: '2026-06-05T00:00:00.000Z' })])
    storage.unmarkChallengeDay('c30', 5)
    storage.markChallengeDay('c30', 5) // newest action -> complete again
    expect(storage.getChallengeProgressFor('c30')!.completedDays[5]).toBeTruthy()
  })
})

describe('sync merge convergence edge cases — Finding L9', () => {
  it('challenge same-day: the later mark timestamp wins', () => {
    storage.applyRemoteChallengeProgress([{ challengeId: 'cx', completedDays: { 1: '2026-06-01T00:00:00.000Z' }, startedAt: 'x', updatedAt: '2026-06-01T00:00:00.000Z' }])
    storage.applyRemoteChallengeProgress([{ challengeId: 'cx', completedDays: { 1: '2026-06-09T00:00:00.000Z' }, startedAt: 'x', updatedAt: '2026-06-09T00:00:00.000Z' }])
    expect(storage.getChallengeProgressFor('cx')!.completedDays[1]).toBe('2026-06-09T00:00:00.000Z')
  })

  it('weight dedup: equal updatedAt breaks the tie by higher id (order-independent)', () => {
    const eq = '2026-06-01T00:00:00.000Z'
    storage.applyRemoteWeightLog([{ id: 'AAA', date: '2026-06-01', weightKg: 80, createdAt: eq, updatedAt: eq }])
    storage.applyRemoteWeightLog([{ id: 'ZZZ', date: '2026-06-01', weightKg: 78, createdAt: eq, updatedAt: eq }])
    const live = storage.getWeightEntries().filter((e) => e.date === '2026-06-01')
    expect(live).toHaveLength(1)
    expect(live[0].id).toBe('ZZZ') // higher id is the deterministic survivor
    expect(live[0].weightKg).toBe(78)
  })

  it('applyRemoteSessions is LWW and applies a remote tombstone', () => {
    storage.saveSession(makeSession({ id: 's' })) // updatedAt stamped to now()
    storage.applyRemoteSessions([makeSession({ id: 's', durationSeconds: 1, updatedAt: '2000-01-01T00:00:00.000Z' })])
    expect(storage.getSessions().find((x) => x.id === 's')?.durationSeconds).toBe(420) // stale ignored
    storage.applyRemoteSessions([makeSession({ id: 's', updatedAt: '2999-01-01T00:00:00.000Z', deletedAt: '2999-01-01T00:00:00.000Z' })])
    expect(storage.getSessions().find((x) => x.id === 's')).toBeUndefined() // newer tombstone wins
  })
})

describe('gcTombstones — Finding M4', () => {
  it('reaps synced, aged tombstones but keeps recent + unsynced ones and live records', () => {
    // a: synced tombstone (dirty cleared) -> eligible for reaping once aged.
    storage.saveRoutine(makeRoutine({ id: 'a' }))
    storage.deleteRoutine('a')
    storage.markSynced({ routines: storage.getPendingSync().routines })
    // b: unsynced tombstone -> must be kept so the delete still propagates.
    storage.saveRoutine(makeRoutine({ id: 'b' }))
    storage.deleteRoutine('b')
    // c: live, synced record -> must be kept.
    storage.saveRoutine(makeRoutine({ id: 'c' }))
    storage.markSynced({ routines: storage.getPendingSync().routines.filter((r) => r.id === 'c') })

    // Simulate 100 days elapsing so a's tombstone is past the 90-day window.
    const removed = storage.gcTombstones(Date.now() + 100 * DAY_MS)
    expect(removed).toBe(1)
    const raw = JSON.parse(localStorage.getItem('fitflow.routines')!) as Routine[]
    expect(raw.map((r) => r.id).sort()).toEqual(['b', 'c'])
  })

  it('does not reap a tombstone within the retention window', () => {
    storage.saveRoutine(makeRoutine({ id: 'a' }))
    storage.deleteRoutine('a')
    storage.markSynced({ routines: storage.getPendingSync().routines })
    expect(storage.gcTombstones(Date.now())).toBe(0) // deleted just now -> kept
  })
})
