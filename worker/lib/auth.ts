import crypto from 'node:crypto'
import type { ApiContext, ApiEnv } from './http.ts'

// ---------------------------------------------------------------------------
// Hand-rolled OAuth (GitHub / Google) + signed-cookie sessions.
//
// No auth SDK: the OAuth "authorization code" flow is a few fetches, and Node's
// crypto (node:crypto, through nodejs_compat) signs our own session token (HMAC-SHA256). Sessions are
// stateless signed tokens stored in an httpOnly cookie — no server session table.
// ---------------------------------------------------------------------------

export type Provider = 'github' | 'google'

export interface NormalizedProfile {
  providerId: string
  email: string | null
  name: string | null
  avatarUrl: string | null
}

export interface ProviderConfig {
  authorizeUrl: string
  tokenUrl: string
  scope: string
  fetchProfile: (accessToken: string) => Promise<NormalizedProfile>
}

const SESSION_COOKIE = 'ff_session'
const STATE_COOKIE = 'ff_oauth'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days
const STATE_TTL_SECONDS = 60 * 10 // 10 minutes

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------
export const PROVIDERS: Record<Provider, ProviderConfig> = {
  github: {
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scope: 'read:user user:email',
    async fetchProfile(accessToken) {
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'fitflow7',
      }
      const userRes = await fetch('https://api.github.com/user', { headers })
      if (!userRes.ok) throw new Error(`GitHub profile fetch failed: ${userRes.status}`)
      const user = (await userRes.json()) as {
        id: number
        name: string | null
        login: string
        email: string | null
        avatar_url: string | null
      }
      let email = user.email
      if (!email) {
        const emailsRes = await fetch('https://api.github.com/user/emails', { headers })
        if (emailsRes.ok) {
          const emails = (await emailsRes.json()) as Array<{
            email: string
            primary: boolean
            verified: boolean
          }>
          email = emails.find((e) => e.primary && e.verified)?.email ?? emails[0]?.email ?? null
        }
      }
      return {
        providerId: String(user.id),
        email,
        name: user.name ?? user.login,
        avatarUrl: user.avatar_url,
      }
    },
  },
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    async fetchProfile(accessToken) {
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) throw new Error(`Google profile fetch failed: ${res.status}`)
      const u = (await res.json()) as {
        id: string
        email: string | null
        name: string | null
        picture: string | null
      }
      return { providerId: u.id, email: u.email, name: u.name, avatarUrl: u.picture }
    },
  },
}

export function isProvider(value: string | undefined): value is Provider {
  return value === 'github' || value === 'google'
}

/** A provider's OAuth client id and secret, or null while either is missing. */
export function getCredentials(env: ApiEnv, provider: Provider): { clientId: string; clientSecret: string } | null {
  const clientId = provider === 'github' ? env.GITHUB_CLIENT_ID : env.GOOGLE_CLIENT_ID
  const clientSecret = provider === 'github' ? env.GITHUB_CLIENT_SECRET : env.GOOGLE_CLIENT_SECRET
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

/** Providers that are actually configured (both client id + secret present). The
 *  client uses this so the sign-in UI only shows buttons that will work. */
export function getConfiguredProviders(env: ApiEnv): Provider[] {
  return (Object.keys(PROVIDERS) as Provider[]).filter((p) => getCredentials(env, p) !== null)
}

/** Optional single-tenant lockdown (L6). When ALLOWED_EMAILS or
 *  ALLOWED_PROVIDER_IDS is set, only matching identities may register/sign in;
 *  when BOTH are unset, registration is open (the default — never locks the owner
 *  out). Provider ids may be listed bare ("123") or scoped ("github:123"). */
export function isAllowedIdentity(env: ApiEnv, provider: Provider, profile: NormalizedProfile): boolean {
  const list = (v: string | undefined) =>
    (v ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const emails = list(env.ALLOWED_EMAILS).map((s) => s.toLowerCase())
  const ids = list(env.ALLOWED_PROVIDER_IDS)
  if (emails.length === 0 && ids.length === 0) return true
  const email = profile.email?.toLowerCase()
  if (email && emails.includes(email)) return true
  return ids.includes(profile.providerId) || ids.includes(`${provider}:${profile.providerId}`)
}

// ---------------------------------------------------------------------------
// Base URL + redirect URI
// ---------------------------------------------------------------------------
export function getBaseUrl(ctx: ApiContext): string {
  if (ctx.env.APP_URL) return ctx.env.APP_URL.replace(/\/$/, '')
  // The origin the request reached this Worker on. Cloudflare routes a request
  // to the Worker by that hostname, so a spoofed Host header can't steer the
  // OAuth redirect_uri elsewhere (L3). Set APP_URL to pin a specific origin.
  return ctx.url.origin
}

export function getRedirectUri(ctx: ApiContext): string {
  return `${getBaseUrl(ctx)}/api/auth/callback`
}

/** Restricts a post-login returnTo to a same-origin absolute path. Rejects
 *  protocol-relative ("//evil.com") and backslash ("/\\evil.com") forms that
 *  browsers treat as cross-origin — i.e. prevents an open redirect. */
export function sanitizeReturnTo(raw: string | undefined): string {
  if (!raw || !raw.startsWith('/')) return '/'
  // Reject control chars / whitespace (browsers may strip them mid-parse) and
  // backslashes, then any protocol-relative form — leaving only a same-origin
  // absolute path. Blocks open redirects like "//evil.com" and "/\evil.com".
  if (raw.includes('\\')) return '/'
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i)
    if (c <= 0x20 || c === 0x7f) return '/'
  }
  if (raw.startsWith('//')) return '/'
  return raw
}

// ---------------------------------------------------------------------------
// Signed-token helpers (HMAC-SHA256 over a base64url JSON payload)
// ---------------------------------------------------------------------------
function getSecret(env: ApiEnv): string {
  const secret = env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  return secret
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function sign(env: ApiEnv, payloadB64: string): string {
  return crypto.createHmac('sha256', getSecret(env)).update(payloadB64).digest('base64url')
}

function encodeToken(env: ApiEnv, payload: Record<string, unknown>): string {
  const body = b64url(JSON.stringify(payload))
  return `${body}.${sign(env, body)}`
}

function decodeToken<T>(env: ApiEnv, token: string | undefined): T | null {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  try {
    // sign() throws if SESSION_SECRET is unset — in the dormant (unconfigured)
    // state a stray token must read as "unauthenticated", not crash the function.
    const expected = sign(env, body)
    // Constant-time compare; lengths must match first or timingSafeEqual throws.
    if (sig.length !== expected.length) return null
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as { exp?: number }
    if (payload.exp && Date.now() / 1000 > payload.exp) return null
    return payload as T
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Cookies
// ---------------------------------------------------------------------------
function parseCookies(ctx: ApiContext): Record<string, string> {
  const header = ctx.headers.get('cookie')
  if (!header) return {}
  const out: Record<string, string> = {}
  for (const c of header.split(';')) {
    const idx = c.indexOf('=')
    if (idx < 0) continue
    const key = c.slice(0, idx).trim()
    if (!key) continue
    try {
      out[key] = decodeURIComponent(c.slice(idx + 1))
    } catch {
      // A malformed percent-escape (e.g. `ff_session=%`) must not throw: getUserId
      // /readOAuthState run before the caller's try/catch, so an unguarded throw
      // here would surface as an opaque 500 instead of "unauthenticated" (L5).
    }
  }
  return out
}

function serializeCookie(name: string, value: string, maxAgeSeconds: number): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ]
  return parts.join('; ')
}

// ---------------------------------------------------------------------------
// Session API
// ---------------------------------------------------------------------------
/** Signs a browser-session token. `sid: true` marks it as a session (vs a
 *  `pat: true` access token); getUserId requires it, so a PAT can never be
 *  replayed via the cookie to gain a full session (bypassing scope/revocation). */
export function createSessionToken(env: ApiEnv, userId: string): string {
  return encodeToken(env, { uid: userId, sid: true, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS })
}

export function setSession(ctx: ApiContext, userId: string): void {
  ctx.appendCookie(serializeCookie(SESSION_COOKIE, createSessionToken(ctx.env, userId), SESSION_TTL_SECONDS))
}

export function clearSession(ctx: ApiContext): void {
  ctx.appendCookie(serializeCookie(SESSION_COOKIE, '', 0))
}

/** Returns the authenticated user id from the session cookie, or null. Only
 *  accepts genuine session tokens (`sid`) — a PAT (`pat`) presented via the
 *  cookie is rejected, so it can't bypass token scope/revocation. */
export function getUserId(ctx: ApiContext): string | null {
  const token = parseCookies(ctx)[SESSION_COOKIE]
  const payload = decodeToken<{ uid?: string; sid?: boolean; pat?: boolean }>(ctx.env, token)
  if (!payload?.sid || payload.pat) return null
  return payload.uid ?? null
}

const PAT_TTL_SECONDS = 60 * 60 * 24 * 365 // 1 year

/** PAT capability scope. 'read' can only pull; 'readwrite' can also push/publish. */
export type Scope = 'read' | 'readwrite'

export interface PatClaims {
  uid: string
  jti: string
  scope: Scope
}

/** Mints a long-lived personal access token (PAT) for headless clients (the MCP
 *  server). Same signed-token scheme as the session cookie; `pat: true` marks it
 *  so it can only arrive via the Authorization header, never as a cookie. Carries
 *  a random `jti` so it can be tracked + revoked server-side (see _lib/tokens). */
export function createAccessToken(env: ApiEnv, userId: string, scope: Scope = 'readwrite'): { token: string; jti: string } {
  const jti = crypto.randomUUID()
  const token = encodeToken(env, {
    uid: userId,
    pat: true,
    jti,
    scope,
    exp: Math.floor(Date.now() / 1000) + PAT_TTL_SECONDS,
  })
  return { token, jti }
}

/** Decodes + verifies a `Bearer <pat>` header's signature/expiry (no DB). Returns
 *  the claims, or null if absent/invalid/not a PAT/missing a jti. Revocation is
 *  checked separately against the token registry (see _lib/tokens resolveAuth). */
export function decodePat(ctx: ApiContext): PatClaims | null {
  const header = ctx.headers.get('authorization')
  if (!header || !header.startsWith('Bearer ')) return null
  const payload = decodeToken<{ uid?: string; pat?: boolean; jti?: string; scope?: Scope }>(
    ctx.env,
    header.slice(7).trim(),
  )
  if (!payload?.pat || !payload.uid || !payload.jti) return null
  return { uid: payload.uid, jti: payload.jti, scope: payload.scope === 'read' ? 'read' : 'readwrite' }
}

// ---------------------------------------------------------------------------
// OAuth state (CSRF) — signed, short-lived cookie carrying state + provider
// ---------------------------------------------------------------------------
export function setOAuthState(ctx: ApiContext, provider: Provider, returnTo: string): string {
  const state = crypto.randomBytes(16).toString('hex')
  const token = encodeToken(ctx.env, {
    state,
    provider,
    returnTo,
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
  })
  ctx.appendCookie(serializeCookie(STATE_COOKIE, token, STATE_TTL_SECONDS))
  return state
}

export function readOAuthState(
  ctx: ApiContext,
): { state: string; provider: Provider; returnTo: string } | null {
  return decodeToken(ctx.env, parseCookies(ctx)[STATE_COOKIE])
}

/** Whether the request carried an OAuth state cookie at all, valid or not. */
export function hasOAuthStateCookie(ctx: ApiContext): boolean {
  return Boolean(parseCookies(ctx)[STATE_COOKIE])
}

export function clearOAuthState(ctx: ApiContext): void {
  ctx.appendCookie(serializeCookie(STATE_COOKIE, '', 0))
}
