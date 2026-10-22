// Network first, so every load gets the latest published files, and a copy of
// each kept for when there's no internet: the screen still starts, with its
// clock and the last weather it saw.
const CACHE = `akp846:${self.registration.scope}`;
// PR previews live below the main site and have their own worker
const PREVIEWS = new URL("pr/", self.registration.scope).href;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (ev) => ev.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (ev) => {
  const { request } = ev;
  if (request.method !== "GET" || new URL(request.url).origin !== location.origin) return;
  if (request.url.startsWith(PREVIEWS)) return;
  ev.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      // "no-cache" revalidates instead of trusting the HTTP cache, so the page
      // and its modules always come from the same version
      const response = await fetch(request, { cache: "no-cache" });
      if (response.ok) ev.waitUntil(cache.put(request, response.clone()));
      return response;
    } catch (err) {
      const copy = await cache.match(request, { ignoreSearch: request.mode === "navigate" });
      if (copy) return copy;
      throw err;
    }
  })());
});
