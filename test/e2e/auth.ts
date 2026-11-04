import crypto from 'node:crypto'
import { createClient, type Client } from '@libsql/client'
import type { BrowserContext } from '@playwright/test'

// Test sign-in for the E2E suite. Real sign-in goes through GitHub OAuth, which
// ends in the API creating a session row and setting a signed `ff_session`
// cookie (worker/lib/sessions.ts). These helpers do exactly that last step, with
// the suite's own SESSION_SECRET (playwright.config.ts) and database, so no real
// account or credential is ever involved.

const SECRET = 'e2e-session-secret'
const BASE = 'http://127.0.0.1:8797'

let client: Client | null = null
export function db(): Client {
  client ??= createClient({ url: process.env.E2E_DB_URL ?? 'http://127.0.0.1:8098' })
  return client
}

function sign(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${crypto.createHmac('sha256', SECRET).update(body).digest('base64url')}`
}

/** Makes the API create its schema (it does so on the first signed request). */
export async function ensureSchema(): Promise<void> {
  await fetch(`${BASE}/api/me`, { headers: { cookie: `ff_session=${encodeURIComponent(sign({ uid: 'x', sid: 'x', exp: 4102444800 }))}` } })
}

/** A new user id, unique per test run. */
export function newUser(name: string): string {
  return `e2e-${name}-${crypto.randomUUID().slice(0, 8)}`
}

/** Signs the browser context in as `userId`, like finishing OAuth would. */
export async function signIn(context: BrowserContext, userId: string): Promise<void> {
  await ensureSchema()
  const now = new Date()
  const sid = crypto.randomUUID()
  await db().execute({
    sql: `INSERT OR IGNORE INTO users (id, provider, provider_id, email, name, avatar_url, created_at) VALUES (?, 'github', ?, ?, ?, NULL, ?)`,
    args: [userId, userId, `${userId}@example.test`, 'E2E Tester', now.toISOString()],
  })
  await db().execute({
    sql: `INSERT INTO auth_sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
    args: [sid, userId, now.toISOString(), new Date(now.getTime() + 86_400_000).toISOString()],
  })
  await context.addCookies([
    {
      name: 'ff_session',
      value: encodeURIComponent(sign({ uid: userId, sid, exp: Math.floor(now.getTime() / 1000) + 86_400 })),
      url: BASE,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
}

/** Names of the user's live routines stored in the account. */
export async function accountRoutines(userId: string): Promise<string[]> {
  const rows = await db().execute({ sql: `SELECT name FROM routines WHERE user_id = ? AND deleted_at IS NULL ORDER BY name`, args: [userId] })
  return rows.rows.map((r) => String(r.name))
}

export async function accountSessions(userId: string): Promise<number> {
  const rows = await db().execute({ sql: `SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND deleted_at IS NULL`, args: [userId] })
  return Number(rows.rows[0].n)
}

export async function accountSettings(userId: string): Promise<Record<string, unknown> | undefined> {
  const rows = await db().execute({ sql: `SELECT * FROM settings WHERE user_id = ?`, args: [userId] })
  return rows.rows[0] as Record<string, unknown> | undefined
}
