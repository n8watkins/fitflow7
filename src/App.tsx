import { useEffect, useState } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Player from './pages/Player'
import RoutineEditor from './pages/RoutineEditor'
import Library from './pages/Library'
import History from './pages/History'
import Insights from './pages/Insights'
import Community from './pages/Community'
import Settings from './pages/Settings'
import Stats from './pages/Stats'
import Calendar from './pages/Calendar'
import Challenges from './pages/Challenges'
import { bootstrapAuth, startSyncListeners } from './lib/sync'
import { useSyncStore } from './store/syncStore'

type NavItem = { to: string; label: string; icon: string }

// Primary destinations — top nav on desktop, bottom tab bar on mobile.
const PRIMARY: NavItem[] = [
  { to: '/', label: 'Workouts', icon: '🏠' },
  { to: '/calendar', label: 'Calendar', icon: '📅' },
  { to: '/stats', label: 'Stats', icon: '📊' },
  { to: '/challenges', label: 'Challenges', icon: '🏆' },
]

// Secondary destinations — top nav on desktop, "More" sheet on mobile.
const SECONDARY: NavItem[] = [
  { to: '/library', label: 'Exercises', icon: '🏋️' },
  { to: '/history', label: 'History', icon: '📋' },
  { to: '/insights', label: 'Insights', icon: '📈' },
  { to: '/community', label: 'Community', icon: '🌐' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
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

      <main className={inWorkout ? '' : 'mx-auto max-w-5xl px-4 py-8 pb-28 md:pb-8'}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/workout/:routineId" element={<Player />} />
          <Route path="/routines/:routineId/edit" element={<RoutineEditor />} />
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
      </main>

      {!inWorkout && <MobileNav />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mobile bottom tab bar + "More" sheet
// ---------------------------------------------------------------------------
function MobileNav() {
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const close = () => setMoreOpen(false)

  const onSecondary = SECONDARY.some((s) => location.pathname.startsWith(s.to))
  const tabBase = 'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors'

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
                  <span className="text-xl">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-edge bg-card/95 backdrop-blur md:hidden">
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
            <span className="text-xl leading-none">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
        <button
          onClick={() => setMoreOpen((o) => !o)}
          className={`${tabBase} ${moreOpen || onSecondary ? 'text-accent' : 'text-slate-400'}`}
          aria-expanded={moreOpen}
        >
          <span className="text-xl leading-none">☰</span>
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
