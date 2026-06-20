import { create } from 'zustand'

export interface AuthUser {
  id: string
  email: string | null
  name: string | null
  avatarUrl: string | null
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

interface SyncState {
  /** null = signed out; undefined-equivalent handled via authLoaded. */
  user: AuthUser | null
  /** False until the first /api/me check resolves (avoids a sign-in flash). */
  authLoaded: boolean
  status: SyncStatus
  lastSyncedAt: number | null
  /** Bumped after a pull merges remote data so data-display pages re-read storage. */
  dataVersion: number
  /** OAuth providers the backend has configured (from /api/me); UI shows only these. */
  providers: string[]
  setUser: (user: AuthUser | null) => void
  setProviders: (providers: string[]) => void
  setAuthLoaded: () => void
  setStatus: (status: SyncStatus) => void
  markSynced: () => void
  bumpData: () => void
}

export const useSyncStore = create<SyncState>((set) => ({
  user: null,
  authLoaded: false,
  status: 'idle',
  lastSyncedAt: null,
  dataVersion: 0,
  providers: [],
  setUser: (user) => set({ user }),
  setProviders: (providers) => set({ providers }),
  setAuthLoaded: () => set({ authLoaded: true }),
  setStatus: (status) => set({ status }),
  markSynced: () => set({ status: 'synced', lastSyncedAt: Date.now() }),
  bumpData: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),
}))
