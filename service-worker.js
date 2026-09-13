const CACHE_NAME = "ai-travel-director-v47";
const APP_FILES = ["./?app_version=47", "./index.html", "./styles.css?v=47", "./app.js?v=47", "./firebase-client.js?v=47", "./firebase-config.js", "./affiliate-config.js?v=47", "./maps.js?v=47", "./manifest.json?v=47", "./icon.svg", "./assets/travel-backdrop.webp",
  "./js/community-data.js?v=47",
  "./js/community.js?v=47",
  "./js/directions.js?v=47",
  "./js/explore.js?v=47",
  "./js/featured-place.js?v=47",
  "./js/home.js?v=47",
  "./js/hotels.js?v=47",
  "./js/itinerary.js?v=47",
  "./js/itinerary-photos.js?v=47",
  "./js/onboarding.js?v=47",
  "./js/persistence.js?v=47",
  "./js/planner.js?v=47",
  "./js/profile.js?v=47",
  "./js/pwa.js?v=47",
  "./js/safety.js?v=47",
  "./js/smart-add.js?v=47",
  "./js/state.js?v=47",
  "./js/trip-model.js?v=47",
  "./js/trip-adjustments.js?v=47",
  "./js/today.js?v=47",
  "./js/ui.js?v=47"
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
      .catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("./?app_version=47") : undefined)))
  );
});
