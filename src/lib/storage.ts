import {
  DEFAULT_SETTINGS,
  type BodyProfile,
  type ChallengeProgress,
  type Routine,
  type UserSettings,
  type WeightEntry,
  type WorkoutSession,
} from '../types'
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
  bodyProfile: 'fitflow.bodyProfile',
  weightLog: 'fitflow.weightLog',
  challengeProgress: 'fitflow.challengeProgress',
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
// Sync queue
// ---------------------------------------------------------------------------
// Routines + sessions (and settings, via getPendingSettings) sync to the cloud
// through lib/sync.ts. The body profile, weight log, and challenge-progress
// collections are intentionally LOCAL-ONLY for now: they carry the same
// dirty/tombstone fields as forward-looking groundwork, but getPendingSync()
// deliberately does not drain them and the server has no columns for them yet.
// Wiring them into sync is a planned follow-up (see STATUS.md session 6).

/** All routine/session records with unsynced local changes. The sync engine drains this. */
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
    if (!existing || (r.updatedAt ?? '') > (existing.updatedAt ?? '')) {
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
    if (!existing || (s.updatedAt ?? '') > (existing.updatedAt ?? '')) {
      byId.set(s.id, { ...s, dirty: false })
    }
  }
  writeJSON(KEY.sessions, [...byId.values()])
}

export function applyRemoteSettings(value: UserSettings, updatedAt: string): void {
  if (updatedAt >= getSettingsMeta().updatedAt) {
    // unitSystem is device-local (not persisted server-side); keep ours so a
    // remote pull never resets the chosen display units.
    writeJSON(KEY.settings, { ...value, unitSystem: getSettings().unitSystem })
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
  /** Body stats (optional — absent in pre-body-stats backups). */
  weightLog?: WeightEntry[]
  bodyProfile?: BodyProfile
  challengeProgress?: ChallengeProgress[]
}

export interface ImportResult {
  routines: number
  sessions: number
  settings: boolean
  weightEntries: number
  challenges: number
  bodyProfile: boolean
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
    weightLog: readJSON<WeightEntry[]>(KEY.weightLog, []),
    bodyProfile: getBodyProfile(),
    challengeProgress: readJSON<ChallengeProgress[]>(KEY.challengeProgress, []),
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
  let weightEntries = 0
  let challenges = 0
  let bodyProfile = false

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

  // Weight log — LWW per entry by id, mark dirty for a future push.
  if (Array.isArray(bundle.weightLog) && bundle.weightLog.length > 0) {
    const byId = new Map(readJSON<WeightEntry[]>(KEY.weightLog, []).map((e) => [e.id, e]))
    for (const e of bundle.weightLog) {
      if (!e || !e.id) continue // skip malformed rows so they can't collapse into one undefined key
      const existing = byId.get(e.id)
      if (!existing || (e.updatedAt ?? '') >= (existing.updatedAt ?? '')) {
        byId.set(e.id, { ...e, dirty: true })
        weightEntries++
      }
    }
    writeJSON(KEY.weightLog, [...byId.values()])
  }

  // Challenge progress — LWW per challenge.
  if (Array.isArray(bundle.challengeProgress) && bundle.challengeProgress.length > 0) {
    const byId = new Map(
      readJSON<ChallengeProgress[]>(KEY.challengeProgress, []).map((c) => [c.challengeId, c]),
    )
    for (const c of bundle.challengeProgress) {
      if (!c || !c.challengeId) continue // skip malformed records
      const existing = byId.get(c.challengeId)
      if (!existing || (c.updatedAt ?? '') >= (existing.updatedAt ?? '')) {
        byId.set(c.challengeId, { ...c, dirty: true })
        challenges++
      }
    }
    writeJSON(KEY.challengeProgress, [...byId.values()])
  }

  // Body profile — singleton, LWW by updatedAt.
  if (bundle.bodyProfile && (bundle.bodyProfile.updatedAt ?? '') >= getBodyProfile().updatedAt) {
    writeJSON(KEY.bodyProfile, { ...bundle.bodyProfile, dirty: true })
    bodyProfile = true
  }

  emitWrite()
  return { routines, sessions, settings, weightEntries, challenges, bodyProfile }
}

// ---------------------------------------------------------------------------
// Body profile (singleton: height, goal weight, sex, birthdate)
// ---------------------------------------------------------------------------

/** Returns the stored body profile, or an empty one (no height/goal yet). */
export function getBodyProfile(): BodyProfile {
  return readJSON<BodyProfile>(KEY.bodyProfile, { updatedAt: '' })
}

/** Persists the body profile, stamping updatedAt + dirty (sync groundwork). */
export function saveBodyProfile(patch: Partial<BodyProfile>): void {
  const current = getBodyProfile()
  const next: BodyProfile = { ...current, ...patch, updatedAt: now(), dirty: true }
  writeJSON(KEY.bodyProfile, next)
  emitWrite()
}

// ---------------------------------------------------------------------------
// Weight log (one entry per local calendar day; upsert by date)
// ---------------------------------------------------------------------------

/** All live weight entries (tombstones filtered), oldest -> newest by date. */
export function getWeightEntries(): WeightEntry[] {
  return readJSON<WeightEntry[]>(KEY.weightLog, [])
    .filter((e) => !e.deletedAt)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** The most recent weight entry by date, or undefined if the log is empty. */
export function getLatestWeight(): WeightEntry | undefined {
  const entries = getWeightEntries()
  return entries.length ? entries[entries.length - 1] : undefined
}

/** Upsert a weight measurement for its `date` (one entry per day). Matches an
 *  existing row for the date even if it was previously deleted, reviving it, so
 *  delete-then-relog can never create a duplicate live row for the same day. */
export function saveWeightEntry(date: string, weightKg: number): void {
  const all = readJSON<WeightEntry[]>(KEY.weightLog, [])
  const stamp = now()
  const idx = all.findIndex((e) => e.date === date)
  if (idx >= 0) {
    all[idx] = { ...all[idx], weightKg, updatedAt: stamp, deletedAt: undefined, dirty: true }
  } else {
    all.push({ id: newId(), date, weightKg, createdAt: stamp, updatedAt: stamp, dirty: true })
  }
  writeJSON(KEY.weightLog, all)
  emitWrite()
}

/** Soft-delete a weight entry so the delete can sync later. */
export function deleteWeightEntry(id: string): void {
  const all = readJSON<WeightEntry[]>(KEY.weightLog, [])
  const idx = all.findIndex((e) => e.id === id)
  if (idx < 0) return
  all[idx] = { ...all[idx], deletedAt: now(), updatedAt: now(), dirty: true }
  writeJSON(KEY.weightLog, all)
  emitWrite()
}

// ---------------------------------------------------------------------------
// Challenge progress (one record per challenge the user has started)
// ---------------------------------------------------------------------------

/** All live challenge-progress records (tombstones filtered). */
export function getChallengeProgressAll(): ChallengeProgress[] {
  return readJSON<ChallengeProgress[]>(KEY.challengeProgress, []).filter((c) => !c.deletedAt)
}

/** Progress for one challenge, or undefined if not started. */
export function getChallengeProgressFor(challengeId: string): ChallengeProgress | undefined {
  return getChallengeProgressAll().find((c) => c.challengeId === challengeId)
}

function writeChallengeProgress(next: ChallengeProgress): void {
  const all = readJSON<ChallengeProgress[]>(KEY.challengeProgress, [])
  const idx = all.findIndex((c) => c.challengeId === next.challengeId)
  if (idx >= 0) all[idx] = next
  else all.push(next)
  writeJSON(KEY.challengeProgress, all)
  emitWrite()
}

/** Mark a day complete in a challenge (creating the progress record if needed). */
export function markChallengeDay(challengeId: string, day: number): void {
  if (!Number.isInteger(day) || day < 1) return
  const stamp = now()
  const existing = getChallengeProgressFor(challengeId)
  const base: ChallengeProgress = existing ?? {
    challengeId,
    completedDays: {},
    startedAt: stamp,
  }
  writeChallengeProgress({
    ...base,
    completedDays: { ...base.completedDays, [day]: stamp },
    deletedAt: undefined,
    updatedAt: stamp,
    dirty: true,
  })
}

/** Un-mark a previously completed challenge day. */
export function unmarkChallengeDay(challengeId: string, day: number): void {
  const existing = getChallengeProgressFor(challengeId)
  if (!existing) return
  const completedDays = { ...existing.completedDays }
  delete completedDays[day]
  writeChallengeProgress({ ...existing, completedDays, updatedAt: now(), dirty: true })
}

/** Reset (tombstone) a challenge's progress so the user can start over. */
export function resetChallenge(challengeId: string): void {
  const existing = getChallengeProgressFor(challengeId)
  if (!existing) return
  writeChallengeProgress({ ...existing, deletedAt: now(), updatedAt: now(), dirty: true })
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
