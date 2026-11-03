import { handleApi } from '../../worker/api.ts'
import type { ApiEnv } from './contract-helpers.ts'

// The implementation the contract suite runs against: the Worker's API in
// process, or, with API_BASE_URL set, a running Worker (`wrangler dev`) whose
// secrets match the suite's (SESSION_SECRET=test-secret-xyz and API_DB_URL).
// A remote run skips the cases that change the Worker's env mid-test.
const base = process.env.API_BASE_URL?.replace(/\/$/, '')
export const remote = Boolean(base)

export async function handle(request: Request, env: ApiEnv): Promise<Response> {
  if (!base) return handleApi(request, env as Parameters<typeof handleApi>[1])
  const url = new URL(request.url)
  return fetch(new Request(`${base}${url.pathname}${url.search}`, request), { redirect: 'manual' })
}
