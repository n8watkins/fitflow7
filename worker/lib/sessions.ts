import crypto from 'node:crypto'
import { SESSION_TTL_MS, clearSession, readSessionClaims, setSessionCookie } from './auth.ts'
import { ensureSchema, getDb } from './db.ts'
import type { ApiContext } from './http.ts'

// Server-side sessions. The cookie is still a signed token, but it names a row
// in auth_sessions, and a session is valid only while that row exists. Sign out
// deletes the row, so a copied cookie stops working at once; Sign out
// everywhere deletes every row for the user. Access tokens (lib/tokens.ts) are
// separate and keep working.

/** Starts a session for the user: a new row plus the cookie that names it.
 *  Also drops the user's expired rows. */
export async function startSession(ctx: ApiContext, userId: string): Promise<void> {
  await ensureSchema(ctx.env)
  const db = getDb(ctx.env)
  const sid = crypto.randomUUID()
  const now = new Date()
  await db.batch(
    [
      { sql: `DELETE FROM auth_sessions WHERE user_id = ? AND expires_at <= ?`, args: [userId, now.toISOString()] },
      {
        sql: `INSERT INTO auth_sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
        args: [sid, userId, now.toISOString(), new Date(now.getTime() + SESSION_TTL_MS).toISOString()],
      },
    ],
    'write',
  )
  setSessionCookie(ctx, userId, sid)
}

/** The signed-in user and session, or null. Fails closed: a database error
 *  reads as signed out rather than surfacing as a 500. */
export async function getSession(ctx: ApiContext): Promise<{ userId: string; sid: string } | null> {
  const claims = readSessionClaims(ctx)
  if (!claims) return null
  try {
    await ensureSchema(ctx.env)
    const row = (
      await getDb(ctx.env).execute({
        sql: `SELECT 1 FROM auth_sessions WHERE id = ? AND user_id = ? AND expires_at > ?`,
        args: [claims.sid, claims.uid, new Date().toISOString()],
      })
    ).rows[0]
    return row ? { userId: claims.uid, sid: claims.sid } : null
  } catch {
    return null
  }
}

export async function getUserId(ctx: ApiContext): Promise<string | null> {
  return (await getSession(ctx))?.userId ?? null
}

/** Ends this session, or every session of the user, and clears the cookie. */
export async function endSession(ctx: ApiContext, everywhere: boolean): Promise<void> {
  const session = await getSession(ctx)
  clearSession(ctx)
  if (!session) return
  await getDb(ctx.env).execute(
    everywhere
      ? { sql: `DELETE FROM auth_sessions WHERE user_id = ?`, args: [session.userId] }
      : { sql: `DELETE FROM auth_sessions WHERE id = ?`, args: [session.sid] },
  )
}
