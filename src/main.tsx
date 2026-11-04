import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { gcTombstones, runMigrations } from './lib/storage'
import { takeSignInNotice } from './lib/signInNotice'
import { useSyncStore } from './store/syncStore'
import ErrorBoundary from './components/ErrorBoundary'
import { initMonitoring } from './lib/monitoring'

// Upgrade any stored data to the current schema before the app reads it.
runMigrations()
// Reap old, already-synced soft-deletes so localStorage doesn't grow unbounded.
gcTombstones()

// Native (Capacitor) builds only: register the Health Connect writer. VITE_NATIVE
// is unset in the web build, so vite drops this branch and the native
// plugin never enters the web bundle.
if (import.meta.env.VITE_NATIVE === 'true') {
  void import('./native-health')
}

// A sign-in that did not finish comes back as ?signin=<notice>: keep it for the
// banner and clean the address bar before the router reads the URL.
useSyncStore.getState().setSignInNotice(takeSignInNotice())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fullScreen>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// Error tracking loads only when the Worker has a SENTRY_DSN (lib/monitoring.ts).
void initMonitoring()

// Register the service worker for offline support (production only — the dev
// server has no /sw.js and an active worker would cache stale modules).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Best-effort — the app still works online without it.
    })
  })
}
