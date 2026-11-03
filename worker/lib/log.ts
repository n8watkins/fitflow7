// One JSON line per failure, so Workers Logs indexes each field and
// `wrangler tail` shows it on one line. Never put secrets, tokens, OAuth codes
// or state values, cookies, emails or other personal data in these fields.
export type LogFields = {
  event: string
  reason: string
  route: string
  status?: number
  [key: string]: string | number | boolean | undefined
}

export function logWarn(fields: LogFields): void {
  console.warn(JSON.stringify(fields))
}

export function logError(fields: LogFields): void {
  console.error(JSON.stringify(fields))
}

/** A provider's short OAuth error code (`bad_verification_code`), or undefined.
 *  Only [a-z0-9_.-] survives, so a description or token can never ride along. */
export function oauthErrorCode(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const code = value.slice(0, 64).replace(/[^a-zA-Z0-9_.-]/g, '')
  return code || undefined
}

/** An error's class and message, cut short, for unexpected failures. */
export function errorSummary(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`.slice(0, 300)
  return String(err).slice(0, 300)
}
