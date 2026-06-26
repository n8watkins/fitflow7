import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom'
import {
  IconBook,
  IconCalendar,
  IconChart,
  IconClock,
  IconCog,
  IconDumbbell,
  IconMenu,
  IconTrophy,
  IconUsers,
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
import { bootstrapAuth, startSyncListeners } from './lib/sync'
import { useSyncStore } from './store/syncStore'

type NavItem = { to: string; label: string; Icon: ComponentType<{ className?: string }> }

// Primary destinations — top nav on desktop, bottom tab bar on mobile.
const PRIMARY: NavItem[] = [
  { to: '/', label: 'Workouts', Icon: IconDumbbell },
  { to: '/calendar', label: 'Calendar', Icon: IconCalendar },
  { to: '/stats', label: 'Stats', Icon: IconChart },
  { to: '/challenges', label: 'Challenges', Icon: IconTrophy },
]

// Secondary destinations — top nav on desktop, "More" sheet on mobile.
const SECONDARY: NavItem[] = [
  { to: '/library', label: 'Exercises', Icon: IconBook },
  { to: '/history', label: 'History', Icon: IconClock },
  { to: '/insights', label: 'Insights', Icon: IconChart },
  { to: '/community', label: 'Community', Icon: IconUsers },
  { to: '/settings', label: 'Settings', Icon: IconCog },
]

const ALL_NAV = [...PRIMARY, ...SECONDARY]

function Shell() {
  const location = useLocation()
  const inWorkout = location.pathname.startsWith('/workout')

  return (
    <div className="min-h-screen">
      {!inWorkout && (
        <>
          {/* Desktop / tablet top nav */}
          <header className="hidden border-b border-edge md:block">
            <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-1 px-4 py-3">
              <NavLink to="/" end className="mr-4 text-lg font-bold tracking-tight">
                Fit<span className="text-accent">Flow</span> 7
              </NavLink>
              {ALL_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      isActive ? 'bg-card text-accent' : 'text-slate-400 hover:bg-card hover:text-slate-200'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              <SyncBadge />
            </nav>
          </header>

          {/* Mobile slim top bar (brand + sync status) */}
          <header className="flex items-center justify-between border-b border-edge px-4 py-3 md:hidden">
            <Link to="/" className="text-lg font-bold tracking-tight">
              Fit<span className="text-accent">Flow</span> 7
            </Link>
            <SyncBadge />
          </header>
        </>
      )}

      <main className={inWorkout ? '' : 'mx-auto max-w-5xl px-4 py-8 pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-8'}>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/workout/:routineId" element={<Player />} />
            <Route path="/routines/:routineId/edit" element={<RoutineEditorRoute />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/challenges" element={<Challenges />} />
            <Route path="/library" element={<Library />} />
            <Route path="/history" element={<History />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/community" element={<Community />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>

      {!inWorkout && <MobileNav />}
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
// Mobile bottom tab bar + "More" sheet
// ---------------------------------------------------------------------------
function MobileNav() {
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const close = () => setMoreOpen(false)

  const onSecondary = SECONDARY.some((s) => location.pathname.startsWith(s.to))
  const tabBase = 'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors active:scale-95'

  return (
    <>
      {/* More sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="absolute inset-x-0 bottom-16 mx-auto max-w-5xl rounded-t-2xl border-t border-edge bg-card p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-3 gap-2">
              {SECONDARY.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={close}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs font-medium transition ${
                      isActive
                        ? 'border-accent/40 bg-accent/10 text-accent'
                        : 'border-edge bg-surface text-slate-300 hover:bg-card-hover'
                    }`
                  }
                >
                  <item.Icon className="h-6 w-6" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-edge bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {PRIMARY.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={close}
            className={({ isActive }) =>
              `${tabBase} ${isActive ? 'text-accent' : 'text-slate-400'}`
            }
          >
            <item.Icon className="h-6 w-6" />
            {item.label}
          </NavLink>
        ))}
        <button
          onClick={() => setMoreOpen((o) => !o)}
          className={`${tabBase} ${moreOpen || onSecondary ? 'text-accent' : 'text-slate-400'}`}
          aria-expanded={moreOpen}
        >
          <IconMenu className="h-6 w-6" />
          More
        </button>
      </nav>
    </>
  )
}

// Small signed-in/sync status pill, right-aligned in the nav. Signed-out users
// see nothing here — sign-in lives in Settings.
function SyncBadge() {
  const user = useSyncStore((s) => s.user)
  const status = useSyncStore((s) => s.status)
  if (!user) return null

  const dot =
    status === 'syncing'
      ? 'bg-amber-400'
      : status === 'error'
        ? 'bg-red-400'
        : 'bg-emerald-400'
  const label =
    status === 'syncing' ? 'Syncing…' : status === 'error' ? 'Sync error' : 'Synced'

  return (
    <span
      className="ml-auto flex items-center gap-1.5 rounded-full border border-edge bg-card px-3 py-1 text-xs font-medium text-slate-400"
      title={user.email ?? user.name ?? 'Signed in'}
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

// Suspense fallback for code-split routes. Minimal + centered so it doesn't
// shift layout; respects reduced-motion.
function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="Loading">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-edge border-t-accent motion-reduce:animate-none" />
    </div>
  )
}

function NotFound() {
  return (
    <div className="flex flex-col items-center gap-6 py-24 text-center">
      <span className="text-6xl">🧭</span>
      <h1 className="text-2xl font-bold text-slate-100">Page not found</h1>
      <p className="text-slate-400">That page doesn't exist.</p>
      <Link
        to="/"
        className="rounded-xl bg-accent px-5 py-2.5 font-semibold text-slate-900 transition hover:opacity-90"
      >
        Back to Dashboard
      </Link>
    </div>
  )
}

export default function App() {
  useEffect(() => {
    startSyncListeners()
    void bootstrapAuth()
  }, [])

  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  )
}
