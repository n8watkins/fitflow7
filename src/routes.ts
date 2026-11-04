// The app's page paths, shared by the router (App.tsx) and the Worker, which
// answers any other path with the app at status 404 so the not-found page is a
// real 404 (worker/index.ts). test/routes.test.ts keeps the two in step.

export const CLIENT_ROUTES = [
  '/',
  '/workout/:routineId',
  '/routines/:routineId/edit',
  '/calendar',
  '/stats',
  '/challenges',
  '/workouts',
  '/library',
  '/history',
  '/insights',
  '/community',
  '/settings',
] as const

const PATTERNS = CLIENT_ROUTES.map(
  (route) => new RegExp('^' + route.replace(/:[A-Za-z]+/g, '[^/]+') + '/?$'),
)

/** Whether a path is one of the app's pages. */
export function isClientRoute(pathname: string): boolean {
  return PATTERNS.some((re) => re.test(pathname))
}
