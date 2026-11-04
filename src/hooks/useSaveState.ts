import { saveState, type SaveState } from '../lib/saveState'
import { useSyncStore } from '../store/syncStore'

/** The current save state, or null until the sign-in check has finished. */
export function useSaveState(): SaveState | null {
  const authLoaded = useSyncStore((s) => s.authLoaded)
  const signedIn = useSyncStore((s) => s.user !== null)
  const status = useSyncStore((s) => s.status)
  const pending = useSyncStore((s) => s.pending)
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt)
  if (!authLoaded) return null
  return saveState({ signedIn, status, pending, lastSyncedAt })
}
