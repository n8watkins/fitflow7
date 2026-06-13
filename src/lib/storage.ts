import { DEFAULT_SETTINGS, type Routine, type UserSettings, type WorkoutSession } from '../types'
import { SYSTEM_ROUTINES } from '../data/routines'

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------
const KEY = {
  routines: 'fitflow.routines',
  sessions: 'fitflow.sessions',
  settings: 'fitflow.settings',
  lastRoutineId: 'fitflow.lastRoutineId',
  schemaVersion: 'fitflow.schemaVersion',
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
}

/** Soft-delete: tombstones the routine (deletedAt + dirty) so the delete can sync. */
export function deleteRoutine(id: string): void {
  const routines = getRoutinesRaw()
  const idx = routines.findIndex((r) => r.id === id)
  if (idx < 0) return
  routines[idx] = { ...routines[idx], deletedAt: now(), dirty: true }
  writeJSON(KEY.routines, routines)
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** Returns all workout sessions, sorted newest-first. */
export function getSessions(): WorkoutSession[] {
  const sessions = readJSON<WorkoutSession[]>(KEY.sessions, [])
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
}

/** Permanently removes all stored workout sessions. */
export function clearSessions(): void {
  try {
    localStorage.removeItem(KEY.sessions)
  } catch {
    // ignore
  }
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

/** Clears the dirty flag on the given record ids after a successful push. */
export function markSynced(ids: { routineIds?: string[]; sessionIds?: string[] }): void {
  if (ids.routineIds?.length) {
    const set = new Set(ids.routineIds)
    writeJSON(
      KEY.routines,
      getRoutinesRaw().map((r) => (set.has(r.id) ? { ...r, dirty: false } : r)),
    )
  }
  if (ids.sessionIds?.length) {
    const set = new Set(ids.sessionIds)
    writeJSON(
      KEY.sessions,
      readJSON<WorkoutSession[]>(KEY.sessions, []).map((s) =>
        set.has(s.id) ? { ...s, dirty: false } : s,
      ),
    )
  }
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
