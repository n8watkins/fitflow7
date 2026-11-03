import { getConfiguredProviders, getUserId } from '../lib/auth.ts'
import { ensureSchema, getDb } from '../lib/db.ts'
import type { ApiContext } from '../lib/http.ts'

// GET /api/me — returns the signed-in user (or { user: null }) plus the list of
// configured OAuth providers, so the client only renders sign-in buttons that work.
export default async function me(ctx: ApiContext): Promise<Response> {
  const providers = getConfiguredProviders(ctx.env)
  const userId = getUserId(ctx)
  if (!userId) return ctx.json(200, { user: null, providers })

  try {
    await ensureSchema(ctx.env)
    const db = getDb(ctx.env)
    const result = await db.execute({
      sql: `SELECT id, email, name, avatar_url FROM users WHERE id = ?`,
      args: [userId],
    })
    const row = result.rows[0]
    if (!row) return ctx.json(200, { user: null, providers })
    return ctx.json(200, {
      user: { id: row.id, email: row.email, name: row.name, avatarUrl: row.avatar_url },
      providers,
    })
  } catch {
    return ctx.json(500, { error: 'lookup failed' })
  }
}
