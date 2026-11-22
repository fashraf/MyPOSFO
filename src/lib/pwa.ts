/**
 * Installable-app plumbing.
 *
 * Production: register the app-shell service worker (public/sw.js) so the till
 * opens offline and loads instantly on mobile data. Development: never register,
 * and unregister any worker a local `vite preview` left behind on the same
 * origin — a cached shell must never hide a code change from the dev server.
 */
export function setupServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  if (!import.meta.env.PROD) {
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => registrations.forEach((registration) => void registration.unregister()))
      .catch(() => undefined);
    return;
  }

  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL || '/';
    void navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => undefined);
  });
}
