import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'node:crypto'

// ---------------------------------------------------------------------------
// Hand-rolled OAuth (GitHub / Google) + signed-cookie sessions.
//
// No auth SDK: the OAuth "authorization code" flow is a few fetches, and Node's
// built-in crypto signs our own session token (HMAC-SHA256). Sessions are
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
  clientId?: string
  clientSecret?: string
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
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
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
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
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

// ---------------------------------------------------------------------------
// Base URL + redirect URI
// ---------------------------------------------------------------------------
export function getBaseUrl(req: VercelRequest): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '')
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `${proto}://${host}`
}

export function getRedirectUri(req: VercelRequest): string {
  return `${getBaseUrl(req)}/api/auth/callback`
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
function getSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  return secret
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function sign(payloadB64: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payloadB64).digest('base64url')
}

function encodeToken(payload: Record<string, unknown>): string {
  const body = b64url(JSON.stringify(payload))
  return `${body}.${sign(body)}`
}

function decodeToken<T>(token: string | undefined): T | null {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  try {
    // sign() throws if SESSION_SECRET is unset — in the dormant (unconfigured)
    // state a stray token must read as "unauthenticated", not crash the function.
    const expected = sign(body)
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
function parseCookies(req: VercelRequest): Record<string, string> {
  const header = req.headers.cookie
  if (!header) return {}
  return Object.fromEntries(
    header.split(';').map((c) => {
      const idx = c.indexOf('=')
      return [c.slice(0, idx).trim(), decodeURIComponent(c.slice(idx + 1))]
    }),
  )
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

function appendCookie(res: VercelResponse, cookie: string): void {
  const prev = res.getHeader('Set-Cookie')
  const list = prev ? (Array.isArray(prev) ? prev : [String(prev)]) : []
  res.setHeader('Set-Cookie', [...list, cookie])
}

// ---------------------------------------------------------------------------
// Session API
// ---------------------------------------------------------------------------
export function setSession(res: VercelResponse, userId: string): void {
  const token = encodeToken({ uid: userId, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS })
  appendCookie(res, serializeCookie(SESSION_COOKIE, token, SESSION_TTL_SECONDS))
}

export function clearSession(res: VercelResponse): void {
  appendCookie(res, serializeCookie(SESSION_COOKIE, '', 0))
}

/** Returns the authenticated user id from the session cookie, or null. */
export function getUserId(req: VercelRequest): string | null {
  const token = parseCookies(req)[SESSION_COOKIE]
  const payload = decodeToken<{ uid: string }>(token)
  return payload?.uid ?? null
}

const PAT_TTL_SECONDS = 60 * 60 * 24 * 365 // 1 year

/** Mints a long-lived personal access token (PAT) for headless clients (the MCP
 *  server). Same signed-token scheme as the session cookie; `pat: true` marks it
 *  so it can only arrive via the Authorization header, never as a cookie. */
export function createAccessToken(userId: string): string {
  return encodeToken({ uid: userId, pat: true, exp: Math.floor(Date.now() / 1000) + PAT_TTL_SECONDS })
}

/** Resolves the user id from either a session cookie or a `Bearer <pat>` header.
 *  Use for endpoints reachable by both the browser and the MCP server. */
export function getAuthedUserId(req: VercelRequest): string | null {
  const header = req.headers.authorization
  if (header && header.startsWith('Bearer ')) {
    const payload = decodeToken<{ uid: string; pat?: boolean }>(header.slice(7).trim())
    if (payload?.pat && payload.uid) return payload.uid
  }
  return getUserId(req)
}

// ---------------------------------------------------------------------------
// OAuth state (CSRF) — signed, short-lived cookie carrying state + provider
// ---------------------------------------------------------------------------
export function setOAuthState(res: VercelResponse, provider: Provider, returnTo: string): string {
  const state = crypto.randomBytes(16).toString('hex')
  const token = encodeToken({
    state,
    provider,
    returnTo,
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
  })
  appendCookie(res, serializeCookie(STATE_COOKIE, token, STATE_TTL_SECONDS))
  return state
}

export function readOAuthState(
  req: VercelRequest,
): { state: string; provider: Provider; returnTo: string } | null {
  return decodeToken(parseCookies(req)[STATE_COOKIE])
}

export function clearOAuthState(res: VercelResponse): void {
  appendCookie(res, serializeCookie(STATE_COOKIE, '', 0))
}
