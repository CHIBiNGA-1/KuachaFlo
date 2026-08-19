// SnapLedger service worker
// Strategy: cache the app shell for fast repeat loads + basic offline
// support. Never touches API calls (different origin, and data must always
// be fresh) — only same-origin static assets and the navigation shell.

const CACHE_VERSION = "kuachaflo-v1";
const APP_SHELL = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET requests — everything else (API calls to
  // the backend, POST uploads, etc.) passes straight through untouched.
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // Never cache Next.js dev/build internals or anything under /api.
  if (url.pathname.startsWith("/_next") || url.pathname.startsWith("/api")) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      // Stale-while-revalidate: serve cache instantly if we have it,
      // refresh in the background; fall back to network-only otherwise.
      return cached || network;
    })
  );
});
