// Request and response plumbing for the API routes: one ApiContext per request
// carries the parsed request, the Worker env and the Set-Cookie headers a route
// queues before it answers.

/** The Worker env as the API reads it. All but SESSION_SECRET are optional
 *  secrets: each feature stays off while its value is missing. */
export type ApiEnv = Pick<Env, 'SESSION_SECRET'> &
  Partial<Pick<Env, 'RATE_LIMITER'>> &
  Partial<Record<
    | 'TURSO_DATABASE_URL'
    | 'TURSO_AUTH_TOKEN'
    | 'APP_URL'
    | 'GITHUB_CLIENT_ID'
    | 'GITHUB_CLIENT_SECRET'
    | 'GOOGLE_CLIENT_ID'
    | 'GOOGLE_CLIENT_SECRET'
    | 'ALLOWED_EMAILS'
    | 'ALLOWED_PROVIDER_IDS',
    string
  >>

/** Thrown when a JSON body is malformed, where the route first reads the body,
 *  so a route's own try/catch sees it; anywhere else it becomes a 400. */
export class InvalidJsonError extends Error {
  constructor() {
    super('Invalid JSON')
  }
}

/** Headers on every API answer. The API serves JSON and redirects, never a page,
 *  so its CSP allows nothing; the app's own CSP is in public/_headers. Answers
 *  can carry a user's data, so no cache may store them. */
export const API_SECURITY_HEADERS: Record<string, string> = {
  'Cache-Control': 'private, no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
}

export class ApiContext {
  readonly method: string
  readonly url: URL
  readonly headers: Headers
  readonly env: ApiEnv
  private readonly rawBody: string
  private readonly cookies: string[] = []

  private constructor(request: Request, env: ApiEnv, rawBody: string) {
    this.method = request.method
    this.url = new URL(request.url)
    this.headers = request.headers
    this.env = env
    this.rawBody = rawBody
  }

  static async from(request: Request, env: ApiEnv): Promise<ApiContext> {
    return new ApiContext(request, env, request.body ? await request.text() : '')
  }

  /** The first value of a query parameter. */
  query(name: string): string | undefined {
    return this.url.searchParams.get(name) ?? undefined
  }

  /** The request body: parsed JSON for an application/json request, the text
   *  for any other type, and undefined when there is none. */
  get body(): unknown {
    if (!this.rawBody) return undefined
    if (!(this.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) return this.rawBody
    try {
      return JSON.parse(this.rawBody) as unknown
    } catch {
      throw new InvalidJsonError()
    }
  }

  appendCookie(cookie: string): void {
    this.cookies.push(cookie)
  }

  json(status: number, value: unknown, extraHeaders?: Record<string, string>): Response {
    return this.respond(status, JSON.stringify(value), 'application/json; charset=utf-8', extraHeaders)
  }

  /** 429 with Retry-After, for a spent rate-limit budget (the bindings count per minute). */
  tooManyRequests(error = 'too many requests'): Response {
    return this.json(429, { error }, { 'Retry-After': '60' })
  }

  /** The caller's address as Cloudflare saw it. */
  get clientIp(): string {
    return this.headers.get('cf-connecting-ip') ?? 'unknown'
  }

  /** A plain message, served as text/html. */
  send(status: number, message: string): Response {
    return this.respond(status, message, 'text/html; charset=utf-8')
  }

  redirect(status: number, location: string): Response {
    const headers = this.baseHeaders()
    headers.set('Location', location)
    return new Response(null, { status, headers })
  }

  private respond(status: number, body: string, contentType: string, extraHeaders?: Record<string, string>): Response {
    const headers = this.baseHeaders()
    headers.set('Content-Type', contentType)
    for (const [k, v] of Object.entries(extraHeaders ?? {})) headers.set(k, v)
    return new Response(body, { status, headers })
  }

  private baseHeaders(): Headers {
    const headers = new Headers(API_SECURITY_HEADERS)
    for (const cookie of this.cookies) headers.append('Set-Cookie', cookie)
    return headers
  }
}

export type Route = (ctx: ApiContext) => Response | Promise<Response>
