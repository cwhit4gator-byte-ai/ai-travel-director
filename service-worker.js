const CACHE_NAME = "ai-travel-director-v48";
const APP_FILES = ["./?app_version=48", "./index.html", "./styles.css?v=48", "./app.js?v=48", "./firebase-client.js?v=48", "./firebase-config.js", "./affiliate-config.js?v=48", "./maps.js?v=48", "./manifest.json?v=48", "./icon.svg", "./assets/travel-backdrop.webp",
  "./js/community-data.js?v=48",
  "./js/community.js?v=48",
  "./js/directions.js?v=48",
  "./js/explore.js?v=48",
  "./js/featured-place.js?v=48",
  "./js/home.js?v=48",
  "./js/hotels.js?v=48",
  "./js/itinerary.js?v=48",
  "./js/itinerary-photos.js?v=48",
  "./js/onboarding.js?v=48",
  "./js/persistence.js?v=48",
  "./js/planner.js?v=48",
  "./js/profile.js?v=48",
  "./js/pwa.js?v=48",
  "./js/safety.js?v=48",
  "./js/smart-add.js?v=48",
  "./js/state.js?v=48",
  "./js/trip-model.js?v=48",
  "./js/trip-adjustments.js?v=48",
  "./js/today.js?v=48",
  "./js/ui.js?v=48"
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
      .catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("./?app_version=48") : undefined)))
  );
});
