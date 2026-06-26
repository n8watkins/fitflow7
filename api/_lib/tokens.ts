import type { VercelRequest } from '@vercel/node'
import type { Client } from '@libsql/client'
import { decodePat, getUserId, type Scope } from './auth.js'
import { ensureSchema, getDb } from './db.js'

// S1: server-side personal-access-token registry. A PAT is valid only while a
// matching, non-revoked row exists in access_tokens — so tokens are revocable
// and scoped, not valid-forever signed blobs. Session cookies are unaffected
// (they're short-lived + cleared on logout) and always count as full access.

export interface AuthResult {
  userId: string
  scope: Scope
}

export interface TokenInfo {
  id: string
  label: string | null
  scope: string
  createdAt: string
  lastUsedAt: string | null
  revoked: boolean
}

/** Resolves the caller from a session cookie (full access) or a `Bearer <pat>`
 *  header (must be present + non-revoked in the registry). Returns null if
 *  neither authenticates. Trusts the DB-stored scope over the token's claim, so
 *  scope changes/revocation take effect immediately. */
export async function resolveAuth(req: VercelRequest): Promise<AuthResult | null> {
  const cookieUid = getUserId(req)
  if (cookieUid) return { userId: cookieUid, scope: 'readwrite' }

  const pat = decodePat(req)
  if (!pat) return null

  await ensureSchema()
  const db = getDb()
  const row = (
    await db.execute({
      sql: `SELECT scope, revoked_at FROM access_tokens WHERE jti = ? AND user_id = ?`,
      args: [pat.jti, pat.uid],
    })
  ).rows[0]
  if (!row || row.revoked_at) return null // unknown or revoked

  // Best-effort "last used" stamp for the Settings token list.
  await db.execute({
    sql: `UPDATE access_tokens SET last_used_at = ? WHERE jti = ?`,
    args: [new Date().toISOString(), pat.jti],
  })

  return { userId: pat.uid, scope: (row.scope as string) === 'read' ? 'read' : 'readwrite' }
}

export async function recordToken(
  db: Client,
  t: { jti: string; userId: string; label: string | null; scope: Scope; createdAt: string },
): Promise<void> {
  await db.execute({
    sql: `INSERT INTO access_tokens (jti, user_id, label, scope, created_at) VALUES (?, ?, ?, ?, ?)`,
    args: [t.jti, t.userId, t.label, t.scope, t.createdAt],
  })
}

export async function listTokens(db: Client, userId: string): Promise<TokenInfo[]> {
  const r = await db.execute({
    sql: `SELECT jti, label, scope, created_at, last_used_at, revoked_at
          FROM access_tokens WHERE user_id = ? ORDER BY created_at DESC`,
    args: [userId],
  })
  return r.rows.map((row) => ({
    id: row.jti as string,
    label: (row.label as string) ?? null,
    scope: row.scope as string,
    createdAt: row.created_at as string,
    lastUsedAt: (row.last_used_at as string) ?? null,
    revoked: Boolean(row.revoked_at),
  }))
}

/** Revokes one of the caller's own tokens (scoped by user_id so you can't revoke
 *  another user's). Idempotent. */
export async function revokeToken(db: Client, userId: string, jti: string): Promise<void> {
  await db.execute({
    sql: `UPDATE access_tokens SET revoked_at = ? WHERE jti = ? AND user_id = ? AND revoked_at IS NULL`,
    args: [new Date().toISOString(), jti, userId],
  })
}
