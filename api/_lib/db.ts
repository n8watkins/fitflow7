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
// Records are owned per user; routines/sessions carry updated_at (LWW cursor)
// and deleted_at (tombstone). settings is one row per user.
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
     updated_at           TEXT NOT NULL
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
]

/** Ensures the schema exists. Memoized so concurrent requests share one bootstrap. */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    const db = getDb()
    schemaReady = (async () => {
      for (const stmt of SCHEMA) {
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
