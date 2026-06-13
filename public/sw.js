/*
 * FitFlow 7 service worker — hand-rolled, no build step.
 *
 * Strategy:
 *  - Precache the app shell on install.
 *  - Navigations (SPA routes): network-first, fall back to the cached shell
 *    so deep links and refreshes work offline.
 *  - Same-origin static assets (hashed JS/CSS, icons): stale-while-revalidate,
 *    so the first online visit populates the cache and later visits work offline.
 *
 * Bump CACHE when you want every client to drop the old cached build.
 */
const CACHE = 'fitflow7-v2'
const APP_SHELL = ['/', '/index.html', '/favicon.svg', '/icon.svg', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Never cache the API — auth/sync responses must always hit the network.
  if (url.pathname.startsWith('/api/')) return

  // SPA navigations: try the network, fall back to the cached shell offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))),
    )
    return
  }

  // Static assets: serve from cache, refresh in the background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone()
            caches.open(CACHE).then((cache) => cache.put(req, copy))
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})
