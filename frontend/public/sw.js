// Minimal service worker: enables "Add to Home Screen" / PWA install.
// No offline caching by design — a stale cached shop dashboard showing
// wrong stock or sale totals is worse than requiring a connection.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Always hit the network. Present so the browser treats this as a
  // valid, installable service worker.
});
