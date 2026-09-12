const CACHE_NAME = "ai-travel-director-v36";
const APP_FILES = ["./?app_version=36", "./index.html", "./styles.css?v=36", "./app.js?v=36", "./firebase-client.js?v=36", "./firebase-config.js", "./affiliate-config.js?v=36", "./maps.js?v=36", "./manifest.json?v=36", "./icon.svg",
  "./js/community-data.js?v=36",
  "./js/community.js?v=36",
  "./js/directions.js?v=36",
  "./js/explore.js?v=36",
  "./js/home.js?v=36",
  "./js/hotels.js?v=36",
  "./js/itinerary.js?v=36",
  "./js/onboarding.js?v=36",
  "./js/persistence.js?v=36",
  "./js/planner.js?v=36",
  "./js/profile.js?v=36",
  "./js/pwa.js?v=36",
  "./js/safety.js?v=36",
  "./js/smart-add.js?v=36",
  "./js/state.js?v=36",
  "./js/trip-model.js?v=36",
  "./js/today.js?v=36",
  "./js/ui.js?v=36"
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
      .catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("./?app_version=36") : undefined)))
  );
});
