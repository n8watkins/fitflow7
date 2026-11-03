import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createClient, type Client } from '@libsql/client'

// Shared helpers for the API contract suite. Everything here talks HTTP or
// writes the database directly, so the suite pins the behavior clients see,
// not how the API is built.

export interface ApiEnv {
  SESSION_SECRET?: string
  TURSO_DATABASE_URL?: string
  TURSO_AUTH_TOKEN?: string
  APP_URL?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  ALLOWED_EMAILS?: string
  ALLOWED_PROVIDER_IDS?: string
}

export const ORIGIN = 'https://fitflow7.test'
export const SECRET = 'test-secret-xyz'

// A fresh database file per run, or the server a remote run's Worker uses.
export const DB_URL = process.env.API_DB_URL
  ?? `file:${path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fitflow7-api-')), 'api.db')}`

let db: Client | null = null
/** A second connection to the API's database, for seeding and assertions. */
export function testDb(): Client {
  db ??= createClient({ url: DB_URL, authToken: process.env.API_DB_AUTH_TOKEN || undefined })
  return db
}

/** Signs a token exactly the way the API does: base64url(JSON).HMAC-SHA256. Sessions
 *  and access tokens issued before the move must keep working after it. */
export function signToken(payload: Record<string, unknown>, secret = SECRET): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function sessionCookie(userId: string): string {
  const token = signToken({ uid: userId, sid: true, exp: Math.floor(Date.now() / 1000) + 3600 })
  return `ff_session=${encodeURIComponent(token)}`
}

/** A validly signed access token that was never registered in access_tokens. */
export function unregisteredPat(userId: string, scope: 'read' | 'readwrite' = 'readwrite'): string {
  return signToken({ uid: userId, pat: true, jti: crypto.randomUUID(), scope, exp: Math.floor(Date.now() / 1000) + 3600 })
}

export interface Req {
  method?: string
  headers?: Record<string, string>
  json?: unknown
  body?: string
}

export function request(pathAndQuery: string, opts: Req = {}): Request {
  const headers = new Headers(opts.headers)
  let body: string | undefined = opts.body
  if (opts.json !== undefined) {
    body = JSON.stringify(opts.json)
    if (!headers.has('content-type')) headers.set('content-type', 'application/json')
  }
  return new Request(`${ORIGIN}${pathAndQuery}`, { method: opts.method ?? 'GET', headers, body, redirect: 'manual' })
}

/** Set-Cookie values of a response, one per cookie. */
export function setCookies(res: Response): string[] {
  return res.headers.getSetCookie()
}

/** The value of the named cookie from a response's Set-Cookie headers. */
export function cookieValue(res: Response, name: string): string | undefined {
  const line = setCookies(res).find((c) => c.startsWith(`${name}=`))
  return line?.split(';')[0].slice(name.length + 1)
}
