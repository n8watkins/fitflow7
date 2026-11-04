import { clearSession } from '../../lib/auth.ts'
import type { ApiContext } from '../../lib/http.ts'

// POST /api/auth/logout - clears the session cookie. POST only, so a link or an
// image on another page can't sign you out.
export default function logout(ctx: ApiContext): Response {
  if (ctx.method !== 'POST') return ctx.json(405, { error: 'method not allowed' })
  clearSession(ctx)
  return ctx.json(200, { ok: true })
}
