import { endSession } from '../../lib/sessions.ts'
import type { ApiContext } from '../../lib/http.ts'

// POST /api/auth/logout - ends this session on the server and clears the
// cookie. Body { everywhere: true } ends every session of the account (access
// tokens are separate and keep working). POST only, so a link or an image on
// another page can't sign you out.
export default async function logout(ctx: ApiContext): Promise<Response> {
  if (ctx.method !== 'POST') return ctx.json(405, { error: 'method not allowed' })
  const body = ctx.body as { everywhere?: unknown } | undefined
  await endSession(ctx, typeof body === 'object' && body !== null && body.everywhere === true)
  return ctx.json(200, { ok: true })
}
