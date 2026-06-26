import {
  applyRemoteBodyProfile,
  applyRemoteChallengeProgress,
  applyRemoteRoutines,
  applyRemoteSessions,
  applyRemoteSettings,
  applyRemoteWeightLog,
  clearSyncCursor,
  getPendingSettings,
  getPendingSync,
  getSyncCursor,
  markSettingsSynced,
  markSynced,
  setSyncCursor,
} from './storage'
import { useSyncStore, type AuthUser } from '../store/syncStore'
import type {
  BodyProfile,
  ChallengeProgress,
  Routine,
  UserSettings,
  WeightEntry,
  WorkoutSession,
} from '../types'

// ---------------------------------------------------------------------------
// Client sync engine. Offline-first: every write stays local; this layer pushes
// the dirty queue and pulls remote changes when signed in. All state lives in
// useSyncStore so the UI can show status without prop-drilling.
//
// Triggers: app load (after auth), window focus, and a debounced local-write
// event (storage.ts dispatches 'fitflow:localwrite'). Signed out => no-op.
// ---------------------------------------------------------------------------

interface SyncResponse {
  serverTime: string
  routines: Routine[]
  sessions: WorkoutSession[]
  settings: { value: UserSettings; updatedAt: string } | null
  weightLog: WeightEntry[]
  challengeProgress: ChallengeProgress[]
  bodyProfile: BodyProfile | null
}

let inFlight = false
let rerunQueued = false
// Set if the server forbids this client from pushing (403 — a read-scoped token).
// The web client is always cookie/readwrite so this is defensive; once set we stop
// retrying for the session rather than re-pushing on every focus/write.
let pushForbidden = false

/** Pushes the dirty queue then pulls remote changes. Coalesces concurrent calls. */
export async function sync(): Promise<void> {
  if (!useSyncStore.getState().user || pushForbidden) return
  if (inFlight) {
    rerunQueued = true
    return
  }
  inFlight = true
  const store = useSyncStore.getState()
  store.setStatus('syncing')
  try {
    const pending = getPendingSync()
    const pendingSettings = getPendingSettings()
    const res = await fetch('/api/sync', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        since: getSyncCursor(),
        routines: pending.routines,
        sessions: pending.sessions,
        settings: pendingSettings,
        weightLog: pending.weightLog,
        challengeProgress: pending.challengeProgress,
        bodyProfile: pending.bodyProfile ?? null,
      }),
    })

    if (res.status === 401) {
      // Session expired/absent — drop to signed-out.
      useSyncStore.getState().setUser(null)
      useSyncStore.getState().setStatus('idle')
      return
    }
    if (res.status === 403) {
      // Read-scoped credential can't push; don't keep retrying (terminal).
      pushForbidden = true
      useSyncStore.getState().setStatus('error')
      return
    }
    if (!res.ok) {
      useSyncStore.getState().setStatus('error')
      return
    }

    const data = (await res.json()) as SyncResponse

    // The push succeeded — clear dirty flags on what we sent.
    markSynced({
      routines: pending.routines,
      sessions: pending.sessions,
      weightLog: pending.weightLog,
      challengeProgress: pending.challengeProgress,
      bodyProfile: pending.bodyProfile,
    })
    if (pendingSettings) markSettingsSynced()

    // Merge what the server sent back (last-write-wins, tombstones included).
    applyRemoteRoutines(data.routines)
    applyRemoteSessions(data.sessions)
    if (data.settings) applyRemoteSettings(data.settings.value, data.settings.updatedAt)
    applyRemoteWeightLog(data.weightLog ?? [])
    applyRemoteChallengeProgress(data.challengeProgress ?? [])
    if (data.bodyProfile) applyRemoteBodyProfile(data.bodyProfile)

    setSyncCursor(data.serverTime)
    useSyncStore.getState().markSynced()
    if (
      data.routines.length ||
      data.sessions.length ||
      data.settings ||
      data.weightLog?.length ||
      data.challengeProgress?.length ||
      data.bodyProfile
    ) {
      useSyncStore.getState().bumpData()
    }
  } catch {
    useSyncStore.getState().setStatus('error')
  } finally {
    inFlight = false
    if (rerunQueued) {
      rerunQueued = false
      void sync()
    }
  }
}

// Debounce local-write bursts (e.g. a settings stepper) into one push.
let debounceTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSync(delayMs = 1200): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void sync()
  }, delayMs)
}

/** Checks the current session and, if signed in, runs an initial sync. */
export async function bootstrapAuth(): Promise<void> {
  try {
    const res = await fetch('/api/me', { credentials: 'include' })
    const data = (await res.json()) as { user: AuthUser | null; providers?: string[] }
    useSyncStore.getState().setUser(data.user ?? null)
    useSyncStore.getState().setProviders(data.providers ?? [])
    if (data.user) void sync()
  } catch {
    // Offline or no backend — stay signed out, app works locally.
  } finally {
    useSyncStore.getState().setAuthLoaded()
  }
}

/** Redirects to the provider's OAuth consent screen. */
export function loginWith(provider: 'github' | 'google'): void {
  const returnTo = encodeURIComponent(window.location.pathname)
  window.location.href = `/api/auth/login?provider=${provider}&returnTo=${returnTo}`
}

/** Token metadata returned by GET /api/token (never includes the secret). */
export interface AccessTokenInfo {
  id: string
  label: string | null
  scope: string
  createdAt: string
  lastUsedAt: string | null
  revoked: boolean
}

/** Mints a personal access token for the MCP server (signed-in users only).
 *  Returns the secret once; it is never retrievable afterward. */
export async function requestAccessToken(opts?: { scope?: 'read' | 'readwrite'; label?: string }): Promise<string | null> {
  try {
    const res = await fetch('/api/token', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: opts?.scope ?? 'readwrite', label: opts?.label ?? null }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { token: string }
    return data.token
  } catch {
    return null
  }
}

/** Lists the signed-in user's tokens (metadata only). */
export async function listAccessTokens(): Promise<AccessTokenInfo[]> {
  try {
    const res = await fetch('/api/token', { method: 'GET', credentials: 'include' })
    if (!res.ok) return []
    return ((await res.json()) as { tokens?: AccessTokenInfo[] }).tokens ?? []
  } catch {
    return []
  }
}

/** Revokes one of the user's tokens by id (jti). */
export async function revokeAccessToken(jti: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/token?jti=${encodeURIComponent(jti)}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    return res.ok
  } catch {
    return false
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
  } finally {
    clearSyncCursor()
    useSyncStore.getState().setUser(null)
    useSyncStore.getState().setStatus('idle')
  }
}

/** Wires the background sync triggers. Call once at app startup. */
export function startSyncListeners(): void {
  window.addEventListener('fitflow:localwrite', () => scheduleSync())
  window.addEventListener('focus', () => void sync())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void sync()
  })
}
