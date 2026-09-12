const CACHE_NAME = "ai-travel-director-v45";
const APP_FILES = ["./?app_version=45", "./index.html", "./styles.css?v=45", "./app.js?v=45", "./firebase-client.js?v=45", "./firebase-config.js", "./affiliate-config.js?v=45", "./maps.js?v=45", "./manifest.json?v=45", "./icon.svg", "./assets/travel-backdrop.webp",
  "./js/community-data.js?v=45",
  "./js/community.js?v=45",
  "./js/directions.js?v=45",
  "./js/explore.js?v=45",
  "./js/featured-place.js?v=45",
  "./js/home.js?v=45",
  "./js/hotels.js?v=45",
  "./js/itinerary.js?v=45",
  "./js/itinerary-photos.js?v=45",
  "./js/onboarding.js?v=45",
  "./js/persistence.js?v=45",
  "./js/planner.js?v=45",
  "./js/profile.js?v=45",
  "./js/pwa.js?v=45",
  "./js/safety.js?v=45",
  "./js/smart-add.js?v=45",
  "./js/state.js?v=45",
  "./js/trip-model.js?v=45",
  "./js/trip-adjustments.js?v=45",
  "./js/today.js?v=45",
  "./js/ui.js?v=45"
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
      .catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("./?app_version=45") : undefined)))
  );
});
