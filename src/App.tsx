import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
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
        </Routes>
      </main>
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
