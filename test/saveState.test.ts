import { describe, expect, it } from 'vitest'
import { saveState } from '../src/lib/saveState'

describe('save state copy', () => {
  const base = { signedIn: true, status: 'synced' as const, pending: false, lastSyncedAt: null }
  it('says data is on this device only when signed out', () => {
    const s = saveState({ ...base, signedIn: false })
    expect(s.kind).toBe('local')
    expect(s.detail).toMatch(/this device only/)
  })
  it('says saved once synced with nothing pending', () => {
    expect(saveState(base).label).toBe('Saved')
  })
  it('says syncing while changes are pending or a sync runs', () => {
    expect(saveState({ ...base, pending: true }).kind).toBe('syncing')
    expect(saveState({ ...base, status: 'syncing' }).kind).toBe('syncing')
  })
  it('names offline and failed syncs, and that data is still on the device', () => {
    expect(saveState({ ...base, status: 'offline' })).toMatchObject({ kind: 'offline', label: 'Offline, will sync' })
    const err = saveState({ ...base, status: 'error' })
    expect(err.kind).toBe('error')
    expect(err.detail).toMatch(/Saved on this device/)
  })
})
