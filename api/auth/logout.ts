import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clearSession } from '../_lib/auth.js'

// POST /api/auth/logout — clears the session cookie.
export default function handler(_req: VercelRequest, res: VercelResponse) {
  clearSession(res)
  res.status(200).json({ ok: true })
}
