const CACHE_NAME = "ai-travel-director-v49";
const APP_FILES = ["./?app_version=49", "./index.html", "./styles.css?v=49", "./app.js?v=49", "./firebase-client.js?v=49", "./firebase-config.js", "./affiliate-config.js?v=49", "./maps.js?v=49", "./manifest.json?v=49", "./icon.svg", "./assets/travel-backdrop.webp",
  "./js/community-data.js?v=49",
  "./js/community.js?v=49",
  "./js/directions.js?v=49",
  "./js/explore.js?v=49",
  "./js/featured-place.js?v=49",
  "./js/flights.js?v=49",
  "./js/home.js?v=49",
  "./js/hotels.js?v=49",
  "./js/itinerary.js?v=49",
  "./js/itinerary-photos.js?v=49",
  "./js/onboarding.js?v=49",
  "./js/persistence.js?v=49",
  "./js/planner.js?v=49",
  "./js/profile.js?v=49",
  "./js/pwa.js?v=49",
  "./js/safety.js?v=49",
  "./js/smart-add.js?v=49",
  "./js/state.js?v=49",
  "./js/trip-model.js?v=49",
  "./js/trip-adjustments.js?v=49",
  "./js/today.js?v=49",
  "./js/ui.js?v=49"
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
      .catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("./?app_version=49") : undefined)))
  );
});
