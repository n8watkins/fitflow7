import type { SyncStatus } from '../store/syncStore'

// What the app tells you about where your data is kept, from the sync state.
// One source for the header chip, the account menu, Settings and the workout
// finish screen, so they always agree.

export type SaveKind = 'local' | 'synced' | 'syncing' | 'offline' | 'error'

export interface SaveState {
  kind: SaveKind
  /** A few words for the header chip. */
  label: string
  /** One sentence on where the data is and what happens next. */
  detail: string
}

export function saveState(input: {
  signedIn: boolean
  status: SyncStatus
  pending: boolean
  lastSyncedAt: number | null
}): SaveState {
  if (!input.signedIn) {
    return {
      kind: 'local',
      label: 'On this device',
      detail: 'Not signed in: saved on this device only. Sign in to keep it in your account and on your other devices.',
    }
  }
  if (input.status === 'offline') {
    return {
      kind: 'offline',
      label: 'Offline, will sync',
      detail: 'Saved on this device. It syncs to your account when you’re back online.',
    }
  }
  if (input.status === 'error') {
    return {
      kind: 'error',
      label: 'Not synced yet',
      detail: 'Saved on this device, but the last sync with your account failed. It retries on its own.',
    }
  }
  if (input.status === 'syncing' || input.pending || input.status === 'idle') {
    return { kind: 'syncing', label: 'Syncing…', detail: 'Saved on this device, sending to your account.' }
  }
  const at = input.lastSyncedAt
    ? ` at ${new Date(input.lastSyncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : ''
  return { kind: 'synced', label: 'Saved', detail: `Saved to your account and on this device. Last synced${at}.` }
}

export const SAVE_DOT: Record<SaveKind, string> = {
  local: 'bg-slate-500',
  synced: 'bg-emerald-400',
  syncing: 'bg-amber-400',
  offline: 'bg-slate-400',
  error: 'bg-red-400',
}
