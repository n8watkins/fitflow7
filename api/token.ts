import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createAccessToken, getUserId } from './_lib/auth.js'

// POST /api/token — issues a personal access token for the signed-in user.
// Paste it into the MCP server config so it can read/write your data headlessly.
// Cookie-authed (must be signed in); the token itself is shown once, not stored.
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  const userId = getUserId(req)
  if (!userId) return res.status(401).json({ error: 'not signed in' })
  res.status(200).json({ token: createAccessToken(userId) })
}
