const CACHE_NAME = "ai-travel-director-v32";
const APP_FILES = ["./?app_version=32", "./index.html", "./styles.css?v=32", "./app.js?v=32", "./firebase-client.js?v=32", "./firebase-config.js", "./affiliate-config.js?v=32", "./maps.js?v=32", "./manifest.json?v=32", "./icon.svg",
  "./js/community-data.js?v=32",
  "./js/community.js?v=32",
  "./js/directions.js?v=32",
  "./js/explore.js?v=32",
  "./js/home.js?v=32",
  "./js/hotels.js?v=32",
  "./js/itinerary.js?v=32",
  "./js/onboarding.js?v=32",
  "./js/persistence.js?v=32",
  "./js/planner.js?v=32",
  "./js/profile.js?v=32",
  "./js/pwa.js?v=32",
  "./js/safety.js?v=32",
  "./js/state.js?v=32",
  "./js/trip-model.js?v=32",
  "./js/today.js?v=32",
  "./js/ui.js?v=32"
];

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
      .catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("./?app_version=32") : undefined)))
  );
});
