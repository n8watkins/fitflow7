import type { VercelRequest, VercelResponse } from '@vercel/node'
import { PROVIDERS, getRedirectUri, isProvider, setOAuthState } from '../_lib/auth.js'

// GET /api/auth/login?provider=github&returnTo=/settings
// Starts the OAuth authorization-code flow: sets a signed state cookie and
// redirects the browser to the provider's consent screen.
export default function handler(req: VercelRequest, res: VercelResponse) {
  const provider = Array.isArray(req.query.provider) ? req.query.provider[0] : req.query.provider
  if (!isProvider(provider)) {
    return res.status(400).json({ error: 'unknown provider' })
  }
  const config = PROVIDERS[provider]
  if (!config.clientId || !config.clientSecret) {
    return res.status(501).json({ error: `${provider} OAuth is not configured` })
  }

  const returnToRaw = Array.isArray(req.query.returnTo) ? req.query.returnTo[0] : req.query.returnTo
  // Only allow same-origin relative paths as returnTo (no open redirect).
  const returnTo = returnToRaw && returnToRaw.startsWith('/') ? returnToRaw : '/'

  const state = setOAuthState(res, provider, returnTo)
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: getRedirectUri(req),
    scope: config.scope,
    state,
    response_type: 'code',
  })
  res.redirect(302, `${config.authorizeUrl}?${params.toString()}`)
}
