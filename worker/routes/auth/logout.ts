import { clearSession } from '../../lib/auth.ts'
import type { ApiContext } from '../../lib/http.ts'

// POST /api/auth/logout - clears the session cookie (any method does).
export default function logout(ctx: ApiContext): Response {
  clearSession(ctx)
  return ctx.json(200, { ok: true })
}
