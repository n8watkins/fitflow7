import { PROVIDERS, getCredentials, getRedirectUri, isProvider, sanitizeReturnTo, setOAuthState } from '../../lib/auth.ts'
import type { ApiContext } from '../../lib/http.ts'

// GET /api/auth/login?provider=github&returnTo=/settings
// Starts the OAuth authorization-code flow: sets a signed state cookie and
// redirects the browser to the provider's consent screen.
export default function login(ctx: ApiContext): Response {
  const provider = ctx.query('provider')
  if (!isProvider(provider)) {
    return ctx.json(400, { error: 'unknown provider' })
  }
  const config = PROVIDERS[provider]
  const credentials = getCredentials(ctx.env, provider)
  if (!credentials) {
    return ctx.json(501, { error: `${provider} OAuth is not configured` })
  }

  const returnToRaw = ctx.query('returnTo')
  // Same-origin absolute path only — blocks protocol-relative open redirects.
  const returnTo = sanitizeReturnTo(returnToRaw)

  const state = setOAuthState(ctx, provider, returnTo)
  const params = new URLSearchParams({
    client_id: credentials.clientId,
    redirect_uri: getRedirectUri(ctx),
    scope: config.scope,
    state,
    response_type: 'code',
  })
  return ctx.redirect(302, `${config.authorizeUrl}?${params.toString()}`)
}
