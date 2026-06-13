import { DEFAULT_SETTINGS, type Routine, type UserSettings, type WorkoutSession } from '../types'
import { SYSTEM_ROUTINES } from '../data/routines'

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------
const KEY = {
  routines: 'fitflow.routines',
  sessions: 'fitflow.sessions',
  settings: 'fitflow.settings',
  settingsMeta: 'fitflow.settingsMeta',
  lastRoutineId: 'fitflow.lastRoutineId',
  schemaVersion: 'fitflow.schemaVersion',
  syncCursor: 'fitflow.syncCursor',
} as const

// ---------------------------------------------------------------------------
// Generic read / write helpers (resilient JSON)
// ---------------------------------------------------------------------------
function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Silently ignore (e.g. private mode quota exceeded)
  }
}

function now(): string {
  return new Date().toISOString()
}

// Notifies the sync engine (lib/sync.ts) that local data changed so it can
// schedule a push. Decoupled via a DOM event so storage has no import on sync.
// Merge writes (applyRemote*) deliberately bypass this to avoid a sync loop.
function emitWrite(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('fitflow:localwrite'))
  }
}

// ---------------------------------------------------------------------------
// Schema versioning + migrations (Phase 0 sync groundwork)
// ---------------------------------------------------------------------------
// Stored blobs carry an implicit schema version (KEY.schemaVersion). Pre-Phase-0
// data has no version key and is treated as version 0. `runMigrations()` walks
// from the stored version up to CURRENT_SCHEMA_VERSION, applying each step once.
// It is called once at app startup (main.tsx) and is idempotent.
export const CURRENT_SCHEMA_VERSION = 1

function getSchemaVersion(): number {
  const raw = readJSON<number | null>(KEY.schemaVersion, null)
  return typeof raw === 'number' ? raw : 0
}

// v0 -> v1: introduce sync fields. Backfill `updatedAt` on sessions (derived
// from completedAt/startedAt) and mark every pre-existing record `dirty` so it
// will be pushed on the first sync. Routines gain no tombstone here (absence of
// deletedAt already means "live").
function migrateV0toV1(): void {
  const routines = readJSON<Routine[]>(KEY.routines, [])
  if (routines.length > 0) {
    writeJSON(
      KEY.routines,
      routines.map((r) => ({ ...r, dirty: true })),
    )
  }

  const sessions = readJSON<WorkoutSession[]>(KEY.sessions, [])
  if (sessions.length > 0) {
    writeJSON(
      KEY.sessions,
      sessions.map((s) => ({
        ...s,
        updatedAt: s.updatedAt ?? s.completedAt ?? s.startedAt,
        dirty: true,
      })),
    )
  }

  // Mark any pre-existing settings dirty so they push on first sign-in.
  if (localStorage.getItem(KEY.settings) !== null) {
    writeJSON(KEY.settingsMeta, { updatedAt: now(), dirty: true })
  }
}

const MIGRATIONS: Record<number, () => void> = {
  1: migrateV0toV1,
}

/** Runs any pending schema migrations. Call once at startup; safe to re-run. */
export function runMigrations(): void {
  let version = getSchemaVersion()
  while (version < CURRENT_SCHEMA_VERSION) {
    const next = version + 1
    MIGRATIONS[next]?.()
    version = next
    writeJSON(KEY.schemaVersion, version)
  }
}

// ---------------------------------------------------------------------------
// Routines
// ---------------------------------------------------------------------------

/** Raw stored routines, tombstones included. For sync use; callers wanting live records use getRoutines(). */
function getRoutinesRaw(): Routine[] {
  return readJSON<Routine[]>(KEY.routines, [])
}

/** Returns only live, user-saved routines (tombstones filtered; system routines merged by callers). */
export function getRoutines(): Routine[] {
  return getRoutinesRaw().filter((r) => !r.deletedAt)
}

/** Looks up a live routine by id — user routines first, then system routines. */
export function getRoutine(id: string): Routine | undefined {
  const found = getRoutines().find((r) => r.id === id)
  if (found) return found
  return SYSTEM_ROUTINES.find((r) => r.id === id)
}

export function saveRoutine(r: Routine): void {
  const routines = getRoutinesRaw()
  const next: Routine = { ...r, dirty: true }
  const idx = routines.findIndex((x) => x.id === r.id)
  if (idx >= 0) {
    routines[idx] = next
  } else {
    routines.push(next)
  }
  writeJSON(KEY.routines, routines)
  emitWrite()
}

/** Soft-delete: tombstones the routine (deletedAt + dirty) so the delete can sync. */
export function deleteRoutine(id: string): void {
  const routines = getRoutinesRaw()
  const idx = routines.findIndex((r) => r.id === id)
  if (idx < 0) return
  routines[idx] = { ...routines[idx], deletedAt: now(), dirty: true }
  writeJSON(KEY.routines, routines)
  emitWrite()
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** Returns all live workout sessions (tombstones filtered), sorted newest-first. */
export function getSessions(): WorkoutSession[] {
  const sessions = readJSON<WorkoutSession[]>(KEY.sessions, []).filter((s) => !s.deletedAt)
  return sessions.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  )
}

export function saveSession(s: WorkoutSession): void {
  const sessions = readJSON<WorkoutSession[]>(KEY.sessions, [])
  const stamp = now()
  const next: WorkoutSession = { ...s, updatedAt: stamp, dirty: true }
  const idx = sessions.findIndex((x) => x.id === s.id)
  if (idx >= 0) {
    sessions[idx] = next
  } else {
    sessions.push(next)
  }
  writeJSON(KEY.sessions, sessions)
  emitWrite()
}

/** Clears workout history. Tombstones each session (deletedAt + dirty) so the
 *  clear propagates to other devices instead of resurrecting on the next pull. */
export function clearSessions(): void {
  const sessions = readJSON<WorkoutSession[]>(KEY.sessions, [])
  if (sessions.length === 0) return
  const stamp = now()
  writeJSON(
    KEY.sessions,
    sessions.map((s) => ({ ...s, deletedAt: stamp, updatedAt: stamp, dirty: true })),
  )
  emitWrite()
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Returns settings merged over DEFAULT_SETTINGS so new keys always have values. */
export function getSettings(): UserSettings {
  const stored = readJSON<Partial<UserSettings>>(KEY.settings, {})
  return { ...DEFAULT_SETTINGS, ...stored }
}

export function saveSettings(s: UserSettings): void {
  writeJSON(KEY.settings, s)
  writeJSON(KEY.settingsMeta, { updatedAt: now(), dirty: true })
  emitWrite()
}

type SettingsMeta = { updatedAt: string; dirty: boolean }

function getSettingsMeta(): SettingsMeta {
  return readJSON<SettingsMeta>(KEY.settingsMeta, { updatedAt: '', dirty: false })
}

// ---------------------------------------------------------------------------
// Sync queue (Phase 0 seam — not yet wired to any backend)
// ---------------------------------------------------------------------------

/** All records with unsynced local changes. The future sync engine drains this. */
export function getPendingSync(): { routines: Routine[]; sessions: WorkoutSession[] } {
  return {
    routines: getRoutinesRaw().filter((r) => r.dirty),
    sessions: readJSON<WorkoutSession[]>(KEY.sessions, []).filter((s) => s.dirty),
  }
}

/** Clears the dirty flag on pushed records after a successful push — but only if
 *  the local `updatedAt` is unchanged since we snapshotted them. An edit made
 *  during the sync round-trip bumps `updatedAt`, so it stays dirty and re-pushes
 *  on the next sync instead of being silently dropped. */
export function markSynced(pushed: {
  routines?: { id: string; updatedAt?: string }[]
  sessions?: { id: string; updatedAt?: string }[]
}): void {
  if (pushed.routines?.length) {
    const m = new Map(pushed.routines.map((r) => [r.id, r.updatedAt]))
    writeJSON(
      KEY.routines,
      getRoutinesRaw().map((r) =>
        m.has(r.id) && r.updatedAt === m.get(r.id) ? { ...r, dirty: false } : r,
      ),
    )
  }
  if (pushed.sessions?.length) {
    const m = new Map(pushed.sessions.map((s) => [s.id, s.updatedAt]))
    writeJSON(
      KEY.sessions,
      readJSON<WorkoutSession[]>(KEY.sessions, []).map((s) =>
        m.has(s.id) && s.updatedAt === m.get(s.id) ? { ...s, dirty: false } : s,
      ),
    )
  }
}

/** Pending settings to push (value + its updatedAt), or undefined if clean. */
export function getPendingSettings(): { value: UserSettings; updatedAt: string } | undefined {
  const meta = getSettingsMeta()
  if (!meta.dirty) return undefined
  return { value: getSettings(), updatedAt: meta.updatedAt || now() }
}

export function markSettingsSynced(): void {
  writeJSON(KEY.settingsMeta, { ...getSettingsMeta(), dirty: false })
}

// ---------------------------------------------------------------------------
// Sync cursor + remote merge (applied by lib/sync.ts after a pull)
// ---------------------------------------------------------------------------

export function getSyncCursor(): string | undefined {
  return readJSON<string | null>(KEY.syncCursor, null) ?? undefined
}

export function setSyncCursor(cursor: string): void {
  writeJSON(KEY.syncCursor, cursor)
}

/** Drops the pull cursor (call on sign-out) so the next sign-in re-pulls the full
 *  account from scratch rather than starting from a different account's cursor. */
export function clearSyncCursor(): void {
  try {
    localStorage.removeItem(KEY.syncCursor)
  } catch {
    // ignore
  }
}

/** Merges server routines into local storage, last-write-wins by updatedAt.
 *  Merged records are marked clean (they already match the server). */
export function applyRemoteRoutines(remote: Routine[]): void {
  if (remote.length === 0) return
  const byId = new Map(getRoutinesRaw().map((r) => [r.id, r]))
  for (const r of remote) {
    const existing = byId.get(r.id)
    if (!existing || (r.updatedAt ?? '') >= (existing.updatedAt ?? '')) {
      byId.set(r.id, { ...r, isSystem: false, dirty: false })
    }
  }
  writeJSON(KEY.routines, [...byId.values()])
}

export function applyRemoteSessions(remote: WorkoutSession[]): void {
  if (remote.length === 0) return
  const byId = new Map(readJSON<WorkoutSession[]>(KEY.sessions, []).map((s) => [s.id, s]))
  for (const s of remote) {
    const existing = byId.get(s.id)
    if (!existing || (s.updatedAt ?? '') >= (existing.updatedAt ?? '')) {
      byId.set(s.id, { ...s, dirty: false })
    }
  }
  writeJSON(KEY.sessions, [...byId.values()])
}

export function applyRemoteSettings(value: UserSettings, updatedAt: string): void {
  if (updatedAt >= getSettingsMeta().updatedAt) {
    writeJSON(KEY.settings, value)
    writeJSON(KEY.settingsMeta, { updatedAt, dirty: false })
  }
}

// ---------------------------------------------------------------------------
// JSON export / import (offline backup + migration safety net)
// ---------------------------------------------------------------------------

export interface ExportBundle {
  app: 'fitflow7'
  version: 1
  exportedAt: string
  schemaVersion: number
  routines: Routine[]
  sessions: WorkoutSession[]
  settings: UserSettings
  settingsUpdatedAt: string
}

export interface ImportResult {
  routines: number
  sessions: number
  settings: boolean
}

/** Snapshots all local data (tombstones included) into a portable JSON bundle. */
export function exportData(): ExportBundle {
  return {
    app: 'fitflow7',
    version: 1,
    exportedAt: now(),
    schemaVersion: getSchemaVersion(),
    routines: getRoutinesRaw(),
    sessions: readJSON<WorkoutSession[]>(KEY.sessions, []),
    settings: getSettings(),
    settingsUpdatedAt: getSettingsMeta().updatedAt || now(),
  }
}

/** Structural check that an unknown value is a FitFlow export bundle. */
export function isExportBundle(value: unknown): value is ExportBundle {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return v.app === 'fitflow7' && Array.isArray(v.routines) && Array.isArray(v.sessions)
}

/** Merges an export bundle into local storage, last-write-wins by updatedAt.
 *  Imported records are marked dirty so a signed-in user pushes them on the next
 *  sync. Records older than the local copy are skipped, so re-importing a stale
 *  backup never clobbers newer data. System routines are ignored. */
export function importData(bundle: ExportBundle): ImportResult {
  let routines = 0
  let sessions = 0
  let settings = false

  if (Array.isArray(bundle.routines) && bundle.routines.length > 0) {
    const byId = new Map(getRoutinesRaw().map((r) => [r.id, r]))
    for (const r of bundle.routines) {
      if (r.isSystem) continue
      const existing = byId.get(r.id)
      if (!existing || (r.updatedAt ?? '') >= (existing.updatedAt ?? '')) {
        byId.set(r.id, { ...r, isSystem: false, dirty: true })
        routines++
      }
    }
    writeJSON(KEY.routines, [...byId.values()])
  }

  if (Array.isArray(bundle.sessions) && bundle.sessions.length > 0) {
    const byId = new Map(readJSON<WorkoutSession[]>(KEY.sessions, []).map((s) => [s.id, s]))
    for (const s of bundle.sessions) {
      const existing = byId.get(s.id)
      if (!existing || (s.updatedAt ?? '') >= (existing.updatedAt ?? '')) {
        byId.set(s.id, { ...s, dirty: true })
        sessions++
      }
    }
    writeJSON(KEY.sessions, [...byId.values()])
  }

  if (bundle.settings) {
    const incoming = bundle.settingsUpdatedAt ?? ''
    if (incoming >= getSettingsMeta().updatedAt) {
      writeJSON(KEY.settings, { ...DEFAULT_SETTINGS, ...bundle.settings })
      writeJSON(KEY.settingsMeta, { updatedAt: incoming || now(), dirty: true })
      settings = true
    }
  }

  emitWrite()
  return { routines, sessions, settings }
}

// ---------------------------------------------------------------------------
// Last routine id
// ---------------------------------------------------------------------------

export function getLastRoutineId(): string | undefined {
  try {
    const val = localStorage.getItem(KEY.lastRoutineId)
    return val ?? undefined
  } catch {
    return undefined
  }
}

export function setLastRoutineId(id: string): void {
  try {
    localStorage.setItem(KEY.lastRoutineId, id)
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

export function newId(): string {
  return crypto.randomUUID()
}
