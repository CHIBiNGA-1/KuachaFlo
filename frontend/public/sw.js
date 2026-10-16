// Offline-first app shell. Lets the app *open* with no connection:
// pages and static assets are served network-first and cached as they're
// visited, falling back to the cache when the network is unreachable.
//
// Business data (stock, sales, customers) is deliberately NOT cached
// here. That lives in IndexedDB (lib/offline), where the app can tell
// "cached" from "fresh" and queue edits for later. Cross-origin requests
// (the API) are left completely alone so this cache can never serve a
// stale stock count.
const SHELL_CACHE = "kratte-shell-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("kratte-shell-") && k !== SHELL_CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // the API is not ours to cache

  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok && fresh.type === "basic") cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        const hit = await cache.match(req);
        if (hit) return hit;
        if (req.mode === "navigate") {
          // An un-visited route offline still gets a working shell.
          const shell = (await cache.match("/app")) || (await cache.match("/"));
          if (shell) return shell;
        }
        throw err;
      }
    })()
  );
});
