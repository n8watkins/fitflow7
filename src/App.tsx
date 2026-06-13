import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Player from './pages/Player'
import RoutineEditor from './pages/RoutineEditor'
import Library from './pages/Library'
import History from './pages/History'
import Settings from './pages/Settings'

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/library', label: 'Exercises' },
  { to: '/history', label: 'History' },
  { to: '/settings', label: 'Settings' },
]

function Shell() {
  const location = useLocation()
  const inWorkout = location.pathname.startsWith('/workout')

  return (
    <div className="min-h-screen">
      {!inWorkout && (
        <header className="border-b border-edge">
          <nav className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-3">
            <NavLink to="/" className="mr-4 text-lg font-bold tracking-tight">
              Fit<span className="text-accent">Flow</span> 7
            </NavLink>
            {NAV.map((item) => (
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
          </nav>
        </header>
      )}
      <main className={inWorkout ? '' : 'mx-auto max-w-5xl px-4 py-8'}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/workout/:routineId" element={<Player />} />
          <Route path="/routines/:routineId/edit" element={<RoutineEditor />} />
          <Route path="/library" element={<Library />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
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
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  )
}
