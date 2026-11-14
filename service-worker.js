const CACHE_NAME = "datax-shell-v2";
const APP_SHELL = [
  "./index.html",
  "./styles.css",
  "./app.js",
  "./bandwidth-account.js",
  "./admin-console.js",
  "./manifest.webmanifest",
  "./offline.html",
  "./assets/datax-icon.svg"
];
self.addEventListener("install", event => {
  // Cache each file independently so one missing asset cannot block installation.
  event.waitUntil(caches.open(CACHE_NAME).then(cache => Promise.allSettled(APP_SHELL.map(path => cache.add(path)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put("./index.html", copy));
      }
      return response;
    }).catch(() => caches.match("./index.html").then(response => response || caches.match("./offline.html"))));
    return;
  }
  // Static artwork is immutable enough for cache-first; application code is network-first so a new
  // deployment is picked up immediately, with the cached copy used only when offline.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(() => Response.error())));
    return;
  }
  event.respondWith(fetch(request).then(response => {
    if (response && response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request).then(cached => cached || (request.destination === "document" ? caches.match("./offline.html") : Response.error()))));
});
