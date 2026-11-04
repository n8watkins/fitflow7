import { create } from 'zustand'
import type { SignInNotice } from '../lib/signInNotice'

export interface AuthUser {
  id: string
  email: string | null
  name: string | null
  avatarUrl: string | null
}

/** idle: nothing has run yet (or signed out). offline: the last attempt could
 *  not reach the server. error: the server refused or failed the sync. */
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error'

interface SyncState {
  /** null = signed out; undefined-equivalent handled via authLoaded. */
  user: AuthUser | null
  /** False until the first /api/me check resolves (avoids a sign-in flash). */
  authLoaded: boolean
  status: SyncStatus
  lastSyncedAt: number | null
  /** Local changes that have not reached the account yet. */
  pending: boolean
  /** Bumped after a pull merges remote data so data-display pages re-read storage. */
  dataVersion: number
  /** OAuth providers the backend has configured (from /api/me); UI shows only these. */
  providers: string[]
  /** Why the last sign-in did not finish (from the callback's ?signin=), until dismissed. */
  signInNotice: SignInNotice | null
  setUser: (user: AuthUser | null) => void
  setProviders: (providers: string[]) => void
  setAuthLoaded: () => void
  setSignInNotice: (notice: SignInNotice | null) => void
  setStatus: (status: SyncStatus) => void
  setPending: (pending: boolean) => void
  markSynced: () => void
  bumpData: () => void
}

export const useSyncStore = create<SyncState>((set) => ({
  user: null,
  authLoaded: false,
  status: 'idle',
  lastSyncedAt: null,
  pending: false,
  dataVersion: 0,
  providers: [],
  signInNotice: null,
  setUser: (user) => set({ user }),
  setProviders: (providers) => set({ providers }),
  setAuthLoaded: () => set({ authLoaded: true }),
  setSignInNotice: (signInNotice) => set({ signInNotice }),
  setStatus: (status) => set({ status }),
  setPending: (pending) => set({ pending }),
  markSynced: () => set({ status: 'synced', lastSyncedAt: Date.now() }),
  bumpData: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),
}))
