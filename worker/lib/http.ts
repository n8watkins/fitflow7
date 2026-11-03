// Request and response plumbing for the API routes: one ApiContext per request
// carries the parsed request, the Worker env and the Set-Cookie headers a route
// queues before it answers.

/** The Worker env as the API reads it. The OAuth, allow-list and APP_URL values
 *  are optional secrets: each feature stays off while its value is missing. */
export type ApiEnv = Pick<Env, 'SESSION_SECRET' | 'TURSO_DATABASE_URL' | 'TURSO_AUTH_TOKEN'> &
  Partial<Record<
    | 'APP_URL'
    | 'GITHUB_CLIENT_ID'
    | 'GITHUB_CLIENT_SECRET'
    | 'GOOGLE_CLIENT_ID'
    | 'GOOGLE_CLIENT_SECRET'
    | 'ALLOWED_EMAILS'
    | 'ALLOWED_PROVIDER_IDS',
    string
  >>

/** Thrown when a JSON body is malformed. Like Vercel's req.body getter, it is
 *  thrown where the route first reads the body, so a route's own try/catch sees
 *  it; anywhere else it becomes a 400. */
export class InvalidJsonError extends Error {
  constructor() {
    super('Invalid JSON')
  }
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

  json(status: number, value: unknown): Response {
    return this.respond(status, JSON.stringify(value), 'application/json; charset=utf-8')
  }

  /** A plain message, served as HTML the way Vercel's res.send serves a string. */
  send(status: number, message: string): Response {
    return this.respond(status, message, 'text/html; charset=utf-8')
  }

  redirect(status: number, location: string): Response {
    const headers = this.baseHeaders()
    headers.set('Location', location)
    return new Response(null, { status, headers })
  }

  private respond(status: number, body: string, contentType: string): Response {
    const headers = this.baseHeaders()
    headers.set('Content-Type', contentType)
    return new Response(body, { status, headers })
  }

  private baseHeaders(): Headers {
    const headers = new Headers({ 'Cache-Control': 'public, max-age=0, must-revalidate' })
    for (const cookie of this.cookies) headers.append('Set-Cookie', cookie)
    return headers
  }
}

export type Route = (ctx: ApiContext) => Response | Promise<Response>
