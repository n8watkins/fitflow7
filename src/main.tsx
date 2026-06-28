import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { gcTombstones, runMigrations } from './lib/storage'

// Upgrade any stored data to the current schema before the app reads it.
runMigrations()
// Reap old, already-synced soft-deletes so localStorage doesn't grow unbounded.
gcTombstones()

// Native (Capacitor) builds only: register the Health Connect writer. VITE_NATIVE
// is unset in the web/Vercel build, so vite drops this branch and the native
// plugin never enters the web bundle.
if (import.meta.env.VITE_NATIVE === 'true') {
  void import('./native-health')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register the service worker for offline support (production only — the dev
// server has no /sw.js and an active worker would cache stale modules).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Best-effort — the app still works online without it.
    })
  })
}
