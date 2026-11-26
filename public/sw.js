/* PosComplete — minimal app-shell service worker.
 *
 * Registered only by a production build (see src/lib/pwa.ts); the dev server
 * never registers it and actively removes any left over from `vite preview`.
 *
 *  - Page navigations: network first, falling back to the cached index.html,
 *    so the till still opens on a flaky mobile connection or offline (mock mode).
 *  - Hashed build assets (/assets/*): cache first — the file name changes with
 *    every deploy, so a cached copy can never be stale.
 *  - Everything else (API calls, other origins, dev-server paths): untouched.
 */
const VERSION = 'poscomplete-shell-v2';
const SCOPE = new URL(self.registration.scope);
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'favicon.svg', 'icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL.map((path) => new URL(path, SCOPE).toString())))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== SCOPE.origin) return;
  const path = url.pathname;
  /* Never touch data or the dev server's module graph. */
  if (path.includes('/api/') || path.includes('/@') || path.includes('/src/') || path.includes('/node_modules/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      /* no-store: never a page from the browser cache, so a deploy shows on the next open (https sites too). */
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(new URL('index.html', SCOPE).toString(), copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(new URL('index.html', SCOPE).toString()).then((cached) => cached || Response.error()),
        ),
    );
    return;
  }

  if (path.startsWith(`${SCOPE.pathname}assets/`)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
