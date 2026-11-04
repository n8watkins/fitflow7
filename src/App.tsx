import { lazy, Suspense, useEffect, type ComponentType } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom'
import {
  IconBook,
  IconChart,
  IconClock,
  IconDumbbell,
} from './components/icons'
// Dashboard + the primary bottom-tab routes load eagerly so the landing page and
// tab switches never flash a fallback. The rest are code-split (C2) to shrink the
// initial bundle for a faster first mobile paint.
import Dashboard from './pages/Dashboard'
import Stats from './pages/Stats'
import Calendar from './pages/Calendar'
import Challenges from './pages/Challenges'
const Player = lazy(() => import('./pages/Player'))
const RoutineEditor = lazy(() => import('./pages/RoutineEditor'))
const Library = lazy(() => import('./pages/Library'))
const History = lazy(() => import('./pages/History'))
const Insights = lazy(() => import('./pages/Insights'))
const Community = lazy(() => import('./pages/Community'))
const Settings = lazy(() => import('./pages/Settings'))
const Workouts = lazy(() => import('./pages/Workouts'))
import { bootstrapAuth, startSyncListeners } from './lib/sync'
import { unlockSpeechOnFirstGesture } from './lib/coach'
import { getThemePref } from './lib/storage'
import { applyTheme } from './lib/theme'
import AccountMenu from './components/AccountMenu'
import SignInNoticeBanner from './components/SignInNoticeBanner'
import ErrorBoundary from './components/ErrorBoundary'
import SettingsDialog from './components/SettingsDialog'
import SignInDialog from './components/SignInDialog'
import ToastHost from './components/Toast'

type NavItem = {
  to: string
  label: string
  Icon: ComponentType<{ className?: string }>
  /** Paths that belong to this destination (its section tabs). */
  paths: string[]
  tabs?: { to: string; label: string }[]
}

// Three destinations plus the account menu, the same on desktop (header) and
// phones (bottom tabs). Each groups related pages behind section tabs.
const NAV: NavItem[] = [
  { to: '/', label: 'Workout', Icon: IconDumbbell, paths: ['/'] },
  {
    to: '/workouts',
    label: 'Library',
    Icon: IconBook,
    paths: ['/workouts', '/library', '/community', '/routines'],
    tabs: [
      { to: '/workouts', label: 'Workouts' },
      { to: '/library', label: 'Exercises' },
      { to: '/community', label: 'Community' },
    ],
  },
  {
    to: '/stats',
    label: 'Progress',
    Icon: IconChart,
    paths: ['/stats', '/history', '/calendar', '/challenges', '/insights'],
    tabs: [
      { to: '/stats', label: 'Overview' },
      { to: '/history', label: 'History' },
      { to: '/calendar', label: 'Calendar' },
      { to: '/challenges', label: 'Challenges' },
      { to: '/insights', label: 'Insights' },
    ],
  },
]

function activeNav(pathname: string): NavItem | undefined {
  if (pathname === '/') return NAV[0]
  return NAV.slice(1).find((n) => n.paths.some((p) => pathname === p || pathname.startsWith(p + '/')))
}

function Wordmark() {
  return (
    <Link to="/" className="text-lg font-bold tracking-tight">
      Fit<span className="text-accent">Flow</span> 7
    </Link>
  )
}

/** Tabs between the pages of one destination (Plan, Progress, Library). */
function SectionTabs({ item }: { item: NavItem }) {
  if (!item.tabs) return null
  return (
    <nav aria-label={item.label} className="mb-6 flex gap-1 overflow-x-auto border-b border-edge">
      {item.tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) =>
            `-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive ? 'border-accent text-accent' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}

function Shell() {
  const location = useLocation()
  const inWorkout = location.pathname.startsWith('/workout/')
  const current = activeNav(location.pathname)

  return (
    <div className="min-h-screen">
      {!inWorkout && (
        <header className="sticky top-0 z-40 border-b border-edge bg-surface/90 backdrop-blur">
          {/* Phones: the account menu is the last bottom tab, so the top bar is just the name. */}
          <div className="mx-auto flex max-w-[1240px] items-center gap-6 px-4 py-2.5">
            <Wordmark />
            <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={current === item ? 'page' : undefined}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    current === item ? 'bg-card text-accent' : 'text-slate-400 hover:bg-card hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto hidden md:block">
              <AccountMenu />
            </div>
          </div>
        </header>
      )}

      <main className={inWorkout ? '' : 'mx-auto max-w-[1240px] px-4 py-6 pb-[calc(7rem+env(safe-area-inset-bottom))] md:py-8 md:pb-10'}>
        {!inWorkout && <SignInNoticeBanner />}
        {!inWorkout && current && <SectionTabs item={current} />}
        <ErrorBoundary resetKey={location.pathname} fullScreen={inWorkout}>
        <Suspense fallback={<RouteFallback fullHeight={inWorkout} />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/workout/:routineId" element={<Player />} />
            <Route path="/routines/:routineId/edit" element={<RoutineEditorRoute />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/challenges" element={<Challenges />} />
            <Route path="/workouts" element={<Workouts />} />
            <Route path="/library" element={<Library />} />
            <Route path="/history" element={<History />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/community" element={<Community />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        </ErrorBoundary>
      </main>

      {!inWorkout && <MobileNav />}
      <SettingsDialog />
      <SignInDialog />
      <ToastHost />
    </div>
  )
}

// Keys RoutineEditor on the route param so it remounts (and re-seeds its state)
// when navigating directly between two different routine-edit URLs.
function RoutineEditorRoute() {
  const { routineId } = useParams<{ routineId: string }>()
  return <RoutineEditor key={routineId} />
}

// ---------------------------------------------------------------------------
// Mobile bottom tab bar: the same four destinations, nothing hidden.
// ---------------------------------------------------------------------------
function MobileNav() {
  const location = useLocation()
  const current = activeNav(location.pathname)
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-50 flex border-t border-edge bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {NAV.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          aria-current={current === item ? 'page' : undefined}
          className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors active:scale-95 ${
            current === item ? 'text-accent' : 'text-slate-400'
          }`}
        >
          <item.Icon className="h-6 w-6" />
          {item.label}
        </Link>
      ))}
      <AccountMenu variant="tab" />
    </nav>
  )
}

// Suspense fallback for code-split routes. Minimal + centered so it doesn't
// shift layout; respects reduced-motion.
function RouteFallback({ fullHeight = false }: { fullHeight?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center ${fullHeight ? 'min-h-screen' : 'min-h-[40vh]'}`}
      role="status"
      aria-label="Loading"
    >
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-edge border-t-accent motion-reduce:animate-none" />
    </div>
  )
}

// Unknown paths: the Worker also answers them with status 404 (worker/index.ts).
function NotFound() {
  const suggestions = [
    { to: '/', label: 'Workouts', Icon: IconDumbbell },
    { to: '/library', label: 'Exercises', Icon: IconBook },
    { to: '/history', label: 'History', Icon: IconClock },
  ]
  return (
    <div className="flex flex-col items-center gap-6 py-20 text-center" data-testid="not-found">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-edge bg-card text-accent" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
        </svg>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Page not found</h1>
        <p className="mt-2 text-slate-400">There’s no page at this address. It may have moved, or the link has a typo.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link to="/" className="rounded-xl bg-accent px-5 py-2.5 font-semibold text-slate-900 transition hover:opacity-90">
          Home
        </Link>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="rounded-xl border border-edge bg-card px-5 py-2.5 font-medium text-slate-200 transition hover:bg-card-hover"
        >
          Back
        </button>
      </div>
      <nav aria-label="Popular pages" className="mt-2 w-full max-w-md">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Popular pages</p>
        <ul className="grid grid-cols-3 gap-2">
          {suggestions.map(({ to, label, Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-edge bg-card px-2 py-3 text-sm font-medium text-slate-300 transition hover:border-accent/50 hover:text-slate-100"
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

export default function App() {
  useEffect(() => {
    startSyncListeners()
    unlockSpeechOnFirstGesture()
    void bootstrapAuth()
    // Keep the DOM theme in sync with the stored preference, and re-resolve when
    // the OS preference changes (only affects the 'system' setting). The inline
    // boot script in index.html already set it once to avoid a flash.
    applyTheme(getThemePref())
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => applyTheme(getThemePref())
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  )
}
