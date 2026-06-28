import {
  DEFAULT_SETTINGS,
  type BodyProfile,
  type ChallengeProgress,
  type Routine,
  type ThemePref,
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
  theme: 'fitflow.theme',
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
// Tombstone garbage collection (Finding M4)
// ---------------------------------------------------------------------------
// Soft-deletes otherwise accumulate forever: every deleted routine/session/
// weight entry and every reset challenge stays in localStorage (clearSessions
// turns the entire history into permanent tombstones), so reads stay correct but
// the raw blobs grow without bound until writeJSON silently hits the quota and
// new data is dropped. A tombstone that is already synced (dirty:false) AND older
// than the retention window is safe to drop locally — other devices receive it
// from the server, not from this device. Recent and unsynced tombstones are kept
// so pending deletes still propagate.
const TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000 // 90 days

/** Drops synced tombstones older than the retention window across all
 *  collections. Idempotent; call once at startup. Returns the number removed. */
export function gcTombstones(nowMs: number = Date.now()): number {
  const cutoff = nowMs - TOMBSTONE_RETENTION_MS
  let removed = 0
  const sweep = <T extends { deletedAt?: string; dirty?: boolean }>(key: string): void => {
    const arr = readJSON<T[]>(key, [])
    const kept = arr.filter(
      (r) => !(r.deletedAt && !r.dirty && new Date(r.deletedAt).getTime() < cutoff),
    )
    if (kept.length !== arr.length) {
      removed += arr.length - kept.length
      writeJSON(key, kept)
    }
  }
  sweep<Routine>(KEY.routines)
  sweep<WorkoutSession>(KEY.sessions)
  sweep<WeightEntry>(KEY.weightLog)
  sweep<ChallengeProgress>(KEY.challengeProgress)
  return removed
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

/** Soft-delete: tombstones the routine (deletedAt + dirty) so the delete can sync.
 *  Bumps updatedAt too — otherwise the tombstone shares the live record's
 *  timestamp and the server's `excluded.updated_at > current` LWW guard rejects
 *  it, so the delete would never propagate to other devices. */
export function deleteRoutine(id: string): void {
  const routines = getRoutinesRaw()
  const idx = routines.findIndex((r) => r.id === id)
  if (idx < 0) return
  const stamp = now()
  routines[idx] = { ...routines[idx], deletedAt: stamp, updatedAt: stamp, dirty: true }
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

// Color theme is a device-local display preference (like nothing else syncs it).
// Stored as a bare JSON string under KEY.theme; the inline boot script in
// index.html reads the same key to set <html data-theme> before first paint.
export function getThemePref(): ThemePref {
  const t = readJSON<ThemePref>(KEY.theme, 'dark')
  return t === 'light' || t === 'system' || t === 'dark' ? t : 'dark'
}

export function setThemePref(pref: ThemePref): void {
  writeJSON(KEY.theme, pref)
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

/** All records with unsynced local changes (tombstones included). The sync engine
 *  drains this. Body/weight/challenge ride the same dirty/LWW contract (B1). */
export function getPendingSync(): {
  routines: Routine[]
  sessions: WorkoutSession[]
  weightLog: WeightEntry[]
  challengeProgress: ChallengeProgress[]
  bodyProfile?: BodyProfile
} {
  const bodyProfile = readJSON<BodyProfile>(KEY.bodyProfile, { updatedAt: '' })
  return {
    routines: getRoutinesRaw().filter((r) => r.dirty),
    sessions: readJSON<WorkoutSession[]>(KEY.sessions, []).filter((s) => s.dirty),
    weightLog: readJSON<WeightEntry[]>(KEY.weightLog, []).filter((e) => e.dirty),
    challengeProgress: readJSON<ChallengeProgress[]>(KEY.challengeProgress, []).filter((c) => c.dirty),
    bodyProfile: bodyProfile.dirty ? bodyProfile : undefined,
  }
}

/** Clears the dirty flag on pushed records after a successful push — but only if
 *  the local `updatedAt` is unchanged since we snapshotted them. An edit made
 *  during the sync round-trip bumps `updatedAt`, so it stays dirty and re-pushes
 *  on the next sync instead of being silently dropped. */
export function markSynced(pushed: {
  routines?: { id: string; updatedAt?: string }[]
  sessions?: { id: string; updatedAt?: string }[]
  weightLog?: { id: string; updatedAt?: string }[]
  challengeProgress?: { challengeId: string; updatedAt?: string }[]
  bodyProfile?: { updatedAt: string }
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
  if (pushed.weightLog?.length) {
    const m = new Map(pushed.weightLog.map((e) => [e.id, e.updatedAt]))
    writeJSON(
      KEY.weightLog,
      readJSON<WeightEntry[]>(KEY.weightLog, []).map((e) =>
        m.has(e.id) && e.updatedAt === m.get(e.id) ? { ...e, dirty: false } : e,
      ),
    )
  }
  if (pushed.challengeProgress?.length) {
    const m = new Map(pushed.challengeProgress.map((c) => [c.challengeId, c.updatedAt]))
    writeJSON(
      KEY.challengeProgress,
      readJSON<ChallengeProgress[]>(KEY.challengeProgress, []).map((c) =>
        m.has(c.challengeId) && c.updatedAt === m.get(c.challengeId) ? { ...c, dirty: false } : c,
      ),
    )
  }
  if (pushed.bodyProfile) {
    const bp = readJSON<BodyProfile>(KEY.bodyProfile, { updatedAt: '' })
    // Only clear dirty if it wasn't edited again during the round-trip.
    if (bp.updatedAt === pushed.bodyProfile.updatedAt) writeJSON(KEY.bodyProfile, { ...bp, dirty: false })
  }
}

/** Pending settings to push (value + its updatedAt), or undefined if clean. */
export function getPendingSettings(): { value: UserSettings; updatedAt: string } | undefined {
  const meta = getSettingsMeta()
  if (!meta.dirty) return undefined
  return { value: getSettings(), updatedAt: meta.updatedAt || now() }
}

/** Clears the settings dirty flag after a successful push — but only if settings
 *  weren't edited again during the round-trip. Mirrors markSynced for every other
 *  record type; without this an edit made mid-sync was silently marked clean and
 *  never pushed (Finding M1). */
export function markSettingsSynced(pushedUpdatedAt: string): void {
  const meta = getSettingsMeta()
  if (meta.updatedAt === pushedUpdatedAt) {
    writeJSON(KEY.settingsMeta, { ...meta, dirty: false })
  }
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

/** Merges server weight entries into local storage, LWW by updatedAt keyed by id
 *  (tombstones win like any other newer write). Merged rows are marked clean.
 *  Then collapses any duplicate LIVE entries for the same date — two devices can
 *  each create a row for one day with a different random id, and the local
 *  one-per-day invariant is by `date`, not `id`. The survivor is chosen
 *  deterministically (newest updatedAt, then highest id) so concurrent merges on
 *  different devices pick the SAME winner and converge; the rest are tombstoned
 *  (dirty) so the delete propagates. */
export function applyRemoteWeightLog(remote: WeightEntry[]): void {
  if (remote.length === 0) return
  const byId = new Map(readJSON<WeightEntry[]>(KEY.weightLog, []).map((e) => [e.id, e]))
  for (const e of remote) {
    const existing = byId.get(e.id)
    if (!existing || (e.updatedAt ?? '') > (existing.updatedAt ?? '')) {
      byId.set(e.id, { ...e, dirty: false })
    }
  }
  // Deterministic survivor per date among live entries.
  const keepByDate = new Map<string, WeightEntry>()
  for (const e of byId.values()) {
    if (e.deletedAt) continue
    const cur = keepByDate.get(e.date)
    const wins =
      !cur || (e.updatedAt ?? '') > (cur.updatedAt ?? '') || ((e.updatedAt ?? '') === (cur.updatedAt ?? '') && e.id > cur.id)
    if (wins) keepByDate.set(e.date, e)
  }
  const stamp = now()
  for (const e of byId.values()) {
    if (e.deletedAt) continue
    if (keepByDate.get(e.date)!.id !== e.id) {
      byId.set(e.id, { ...e, deletedAt: stamp, updatedAt: stamp, dirty: true })
    }
  }
  writeJSON(KEY.weightLog, [...byId.values()])
}

/** Merges server challenge-progress records keyed by challengeId. For two LIVE
 *  records the per-day mark/clear events are merged so concurrent devices
 *  converge: per day we keep the latest mark (completedDays) and the latest clear
 *  (clearedDays); a day is effectively complete only if its mark is newer than
 *  its clear. This lets a day marked on one device survive AND a day deliberately
 *  un-marked on another device survive (the later action wins) — Finding M2.
 *  A reset (tombstone) is handled by plain LWW on `updatedAt`. When the local
 *  side contributed anything the server lacked, the record is left dirty (with a
 *  fresh updatedAt) so it re-pushes and other devices converge. */
export function applyRemoteChallengeProgress(remote: ChallengeProgress[]): void {
  if (remote.length === 0) return
  const byId = new Map(
    readJSON<ChallengeProgress[]>(KEY.challengeProgress, []).map((c) => [c.challengeId, c]),
  )
  for (const c of remote) {
    const existing = byId.get(c.challengeId)
    if (!existing) {
      byId.set(c.challengeId, { ...c, dirty: false })
      continue
    }
    // Either side a tombstone → LWW (don't merge old completions into a reset).
    if (c.deletedAt || existing.deletedAt) {
      if ((c.updatedAt ?? '') > (existing.updatedAt ?? '')) byId.set(c.challengeId, { ...c, dirty: false })
      continue
    }
    // Both live → reconcile per-day mark vs clear events (latest wins per day).
    const merged = mergeChallengeDays(existing, c)
    const startedAt = existing.startedAt < c.startedAt ? existing.startedAt : c.startedAt
    // Did the local side contribute anything the server's record lacked?
    const localContributed =
      !shallowEqualMap(merged.completedDays, c.completedDays) ||
      !shallowEqualMap(merged.clearedDays, c.clearedDays ?? {})
    byId.set(c.challengeId, {
      ...c,
      completedDays: merged.completedDays,
      clearedDays: merged.clearedDays,
      startedAt,
      // If we contributed, bump updatedAt + stay dirty so the merge re-pushes and
      // wins the server's LWW guard; otherwise adopt the server's record as-is.
      updatedAt: localContributed ? now() : c.updatedAt,
      dirty: localContributed,
    })
  }
  writeJSON(KEY.challengeProgress, [...byId.values()])
}

/** Reconciles two live challenge records' per-day mark/clear events. For each
 *  day the latest mark and latest clear are kept; the day is "complete" iff its
 *  mark timestamp is strictly newer than its clear timestamp. */
function mergeChallengeDays(
  a: ChallengeProgress,
  b: ChallengeProgress,
): { completedDays: Record<number, string>; clearedDays: Record<number, string> } {
  const latestMark: Record<number, string> = {}
  const latestClear: Record<number, string> = {}
  const take = (into: Record<number, string>, from?: Record<number, string>) => {
    for (const [k, ts] of Object.entries(from ?? {})) {
      const day = Number(k)
      if (!(day in into) || ts > into[day]) into[day] = ts
    }
  }
  take(latestMark, a.completedDays)
  take(latestMark, b.completedDays)
  take(latestClear, a.clearedDays)
  take(latestClear, b.clearedDays)

  const completedDays: Record<number, string> = {}
  const clearedDays: Record<number, string> = {}
  for (const k of new Set([...Object.keys(latestMark), ...Object.keys(latestClear)])) {
    const day = Number(k)
    const mark = latestMark[day]
    const clear = latestClear[day]
    if (mark && (!clear || mark > clear)) completedDays[day] = mark
    else if (clear) clearedDays[day] = clear
  }
  return { completedDays, clearedDays }
}

/** Shallow equality for day-number -> timestamp maps. */
function shallowEqualMap(a: Record<number, string>, b: Record<number, string>): boolean {
  const ak = Object.keys(a)
  if (ak.length !== Object.keys(b).length) return false
  return ak.every((k) => a[k as unknown as number] === b[k as unknown as number])
}

/** Applies the server's body profile (singleton) if it's newer than the local one. */
export function applyRemoteBodyProfile(value: BodyProfile): void {
  const current = readJSON<BodyProfile>(KEY.bodyProfile, { updatedAt: '' })
  if ((value.updatedAt ?? '') > (current.updatedAt ?? '')) {
    writeJSON(KEY.bodyProfile, { ...value, dirty: false })
  }
}

export function applyRemoteSettings(value: UserSettings, updatedAt: string): void {
  // Empty string sorts before any ISO timestamp, so it loses LWW ties as the
  // "oldest" value — which is what we want for a never-stamped record.
  if (updatedAt >= getSettingsMeta().updatedAt) {
    // unitSystem is device-local (not persisted server-side); keep ours so a
    // remote pull never resets the chosen display units.
    writeJSON(KEY.settings, { ...value, unitSystem: getSettings().unitSystem })
    // Never persist an empty timestamp — that would leave local settings with no
    // real updatedAt and make them perpetually losable on the next merge.
    writeJSON(KEY.settingsMeta, { updatedAt: updatedAt || now(), dirty: false })
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
// Body profile (singleton: height, goal weight)
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

/** Mark a day complete in a challenge (creating the progress record if needed).
 *  Clears any per-day tombstone for that day so a re-mark supersedes an unmark. */
export function markChallengeDay(challengeId: string, day: number): void {
  if (!Number.isInteger(day) || day < 1) return
  const stamp = now()
  const existing = getChallengeProgressFor(challengeId)
  const base: ChallengeProgress = existing ?? {
    challengeId,
    completedDays: {},
    startedAt: stamp,
  }
  const clearedDays = { ...(base.clearedDays ?? {}) }
  delete clearedDays[day]
  writeChallengeProgress({
    ...base,
    completedDays: { ...base.completedDays, [day]: stamp },
    clearedDays,
    deletedAt: undefined,
    updatedAt: stamp,
    dirty: true,
  })
}

/** Un-mark a previously completed challenge day. Records a per-day tombstone
 *  (clearedDays[day]) so the unmark survives the cross-device union merge instead
 *  of being resurrected by a device that still has the day marked (Finding M2). */
export function unmarkChallengeDay(challengeId: string, day: number): void {
  const existing = getChallengeProgressFor(challengeId)
  if (!existing) return
  if (!(day in existing.completedDays)) return
  const stamp = now()
  const completedDays = { ...existing.completedDays }
  delete completedDays[day]
  writeChallengeProgress({
    ...existing,
    completedDays,
    clearedDays: { ...(existing.clearedDays ?? {}), [day]: stamp },
    updatedAt: stamp,
    dirty: true,
  })
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
