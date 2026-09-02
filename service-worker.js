const CACHE_NAME = "ai-travel-director-v11";
const APP_FILES = ["./?app_version=11", "./index.html", "./styles.css?v=11", "./app.js?v=11", "./firebase-client.js?v=11", "./firebase-config.js", "./maps.js?v=11", "./manifest.json?v=11", "./icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then(response => {
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("./?app_version=11") : undefined)))
  );
});
