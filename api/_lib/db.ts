import { createClient, type Client } from '@libsql/client'

// ---------------------------------------------------------------------------
// Turso (libSQL) client + schema bootstrap.
//
// Config comes from env vars (see .env.example). Nothing connects until both
// TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are set, so the app stays fully
// local-only until you provision a database and paste the secrets in.
// ---------------------------------------------------------------------------

let client: Client | null = null
let schemaReady: Promise<void> | null = null

export function getDb(): Client {
  if (client) return client
  const url = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN
  if (!url) {
    throw new Error('TURSO_DATABASE_URL is not set')
  }
  client = createClient({ url, authToken })
  return client
}

// CREATE TABLE IF NOT EXISTS — cheap, idempotent, runs once per warm instance.
// Records are owned per user; routines/sessions carry updated_at (the CLIENT
// clock, used only for LWW conflict resolution) plus server_updated_at (the
// SERVER clock, stamped on every write and used as the sync watermark) and
// deleted_at (tombstone). settings is one row per user. Pulls filter and the
// cursor advance on server_updated_at so a skewed client clock can never make a
// row sort before a cursor another device already saved (H2).
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id           TEXT PRIMARY KEY,
     provider     TEXT NOT NULL,
     provider_id  TEXT NOT NULL,
     email        TEXT,
     name         TEXT,
     avatar_url   TEXT,
     created_at   TEXT NOT NULL,
     UNIQUE (provider, provider_id)
   )`,
  `CREATE TABLE IF NOT EXISTS routines (
     id                TEXT PRIMARY KEY,
     user_id           TEXT NOT NULL,
     name              TEXT NOT NULL,
     description       TEXT,
     exercise_ids      TEXT NOT NULL,
     work_seconds      INTEGER NOT NULL,
     rest_seconds      INTEGER NOT NULL,
     rounds            INTEGER NOT NULL,
     created_at        TEXT NOT NULL,
     updated_at        TEXT NOT NULL,
     server_updated_at TEXT,
     deleted_at        TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_routines_user_updated ON routines (user_id, updated_at)`,
  `CREATE TABLE IF NOT EXISTS sessions (
     id                  TEXT PRIMARY KEY,
     user_id             TEXT NOT NULL,
     routine_id          TEXT,
     routine_name        TEXT NOT NULL,
     started_at          TEXT NOT NULL,
     completed_at        TEXT,
     duration_seconds    INTEGER NOT NULL,
     completed           INTEGER NOT NULL,
     exercises_completed INTEGER NOT NULL,
     total_exercises     INTEGER NOT NULL,
     updated_at          TEXT NOT NULL,
     server_updated_at   TEXT,
     deleted_at          TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user_updated ON sessions (user_id, updated_at)`,
  `CREATE TABLE IF NOT EXISTS settings (
     user_id              TEXT PRIMARY KEY,
     default_work_seconds INTEGER NOT NULL,
     default_rest_seconds INTEGER NOT NULL,
     default_rounds       INTEGER NOT NULL,
     countdown_seconds    INTEGER NOT NULL,
     audio_cues_enabled   INTEGER NOT NULL,
     updated_at           TEXT NOT NULL,
     server_updated_at    TEXT
   )`,
  // Phase 3c: bounded, content-only community routine library. Each row is an
  // immutable published snapshot of a routine. `reports` accumulates abuse flags;
  // a row auto-hides (blocked = 1) once it reaches the threshold. No PII beyond a
  // display name is stored here (owner_id is for ownership/abuse caps only).
  `CREATE TABLE IF NOT EXISTS public_routines (
     slug          TEXT PRIMARY KEY,
     owner_id      TEXT NOT NULL,
     owner_name    TEXT,
     name          TEXT NOT NULL,
     description   TEXT,
     exercise_ids  TEXT NOT NULL,
     work_seconds  INTEGER NOT NULL,
     rest_seconds  INTEGER NOT NULL,
     rounds        INTEGER NOT NULL,
     created_at    TEXT NOT NULL,
     reports       INTEGER NOT NULL DEFAULT 0,
     blocked       INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS idx_public_routines_blocked_created ON public_routines (blocked, created_at)`,
  // S1: personal access token registry. PATs carry a `jti`; a token is valid only
  // while a non-revoked row exists here, so tokens become revocable (and listable
  // in Settings) instead of being valid-forever signed blobs. `scope` is
  // 'read' or 'readwrite'. No secret is stored — only the id + metadata.
  `CREATE TABLE IF NOT EXISTS access_tokens (
     jti          TEXT PRIMARY KEY,
     user_id      TEXT NOT NULL,
     label        TEXT,
     scope        TEXT NOT NULL DEFAULT 'readwrite',
     created_at   TEXT NOT NULL,
     last_used_at TEXT,
     revoked_at   TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_access_tokens_user ON access_tokens (user_id, created_at)`,
  // S1: one abuse report per (routine, user). The block threshold counts DISTINCT
  // reporters from here, so a single user can't drive a routine to blocked.
  `CREATE TABLE IF NOT EXISTS routine_reports (
     slug        TEXT NOT NULL,
     user_id     TEXT NOT NULL,
     created_at  TEXT NOT NULL,
     PRIMARY KEY (slug, user_id)
   )`,
  // B1: body stats sync (previously local-only). All user_id-scoped, LWW by
  // updated_at, tombstones via deleted_at — same contract as routines/sessions.
  `CREATE TABLE IF NOT EXISTS weight_log (
     id          TEXT PRIMARY KEY,
     user_id     TEXT NOT NULL,
     date        TEXT NOT NULL,
     weight_kg   REAL NOT NULL,
     created_at  TEXT NOT NULL,
     updated_at  TEXT NOT NULL,
     server_updated_at TEXT,
     deleted_at  TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_weight_log_user_updated ON weight_log (user_id, updated_at)`,
  // Singleton per user (height + goal weight). No tombstone — it's never deleted.
  `CREATE TABLE IF NOT EXISTS body_profile (
     user_id        TEXT PRIMARY KEY,
     height_cm      REAL,
     goal_weight_kg REAL,
     updated_at     TEXT NOT NULL,
     server_updated_at TEXT
   )`,
  // One row per challenge a user has started; completed_days/cleared_days are
  // JSON maps (day-number -> ISO timestamp). cleared_days carries per-day unmark
  // tombstones so a deliberate unmark survives the cross-device merge (M2).
  `CREATE TABLE IF NOT EXISTS challenge_progress (
     user_id        TEXT NOT NULL,
     challenge_id   TEXT NOT NULL,
     completed_days TEXT NOT NULL,
     cleared_days   TEXT NOT NULL DEFAULT '{}',
     started_at     TEXT NOT NULL,
     updated_at     TEXT NOT NULL,
     server_updated_at TEXT,
     deleted_at     TEXT,
     PRIMARY KEY (user_id, challenge_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_challenge_progress_user_updated ON challenge_progress (user_id, updated_at)`,
]

// Idempotent ADD COLUMN migrations for tables that predate a column. CREATE TABLE
// IF NOT EXISTS never alters an existing table, so columns added after a table
// first shipped must be ALTERed in. Each runs once per warm instance and the
// "duplicate column name" error (already applied) is swallowed.
const SYNCED_TABLES = ['routines', 'sessions', 'settings', 'weight_log', 'body_profile', 'challenge_progress']
const ALTERS = [
  `ALTER TABLE challenge_progress ADD COLUMN cleared_days TEXT NOT NULL DEFAULT '{}'`,
  // H2: server-stamped sync watermark on every synced table.
  ...SYNCED_TABLES.map((t) => `ALTER TABLE ${t} ADD COLUMN server_updated_at TEXT`),
  ...SYNCED_TABLES.map((t) => `CREATE INDEX IF NOT EXISTS idx_${t}_user_server ON ${t} (user_id, server_updated_at)`),
]
// Backfill: existing rows (pre-watermark) get server_updated_at seeded from their
// client updated_at so a fresh client (since=EPOCH) still pulls them. Idempotent.
const BACKFILLS = SYNCED_TABLES.map(
  (t) => `UPDATE ${t} SET server_updated_at = updated_at WHERE server_updated_at IS NULL`,
)

/** Ensures the schema exists. Memoized so concurrent requests share one bootstrap. */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    const db = getDb()
    schemaReady = (async () => {
      for (const stmt of SCHEMA) {
        await db.execute(stmt)
      }
      for (const stmt of ALTERS) {
        try {
          await db.execute(stmt)
        } catch (err) {
          // Already applied (column exists) → ignore; re-throw anything else.
          if (!/duplicate column name/i.test(String((err as Error)?.message))) throw err
        }
      }
      for (const stmt of BACKFILLS) {
        await db.execute(stmt)
      }
    })().catch((err) => {
      // Reset so a transient failure can retry on the next request.
      schemaReady = null
      throw err
    })
  }
  return schemaReady
}
