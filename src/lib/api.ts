// Where the app reaches its API. Set VITE_API_BASE_URL at build time to point a
// build at another host (for example an Android build at the deployed site);
// when it is unset, the API is on the same origin as the page, as it always was.
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

/** The URL of an API path such as '/api/me'. */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`
}
