const CACHE_NAME = "ai-travel-director-v44";
const APP_FILES = ["./?app_version=44", "./index.html", "./styles.css?v=44", "./app.js?v=44", "./firebase-client.js?v=44", "./firebase-config.js", "./affiliate-config.js?v=44", "./maps.js?v=44", "./manifest.json?v=44", "./icon.svg", "./assets/travel-backdrop.webp",
  "./js/community-data.js?v=44",
  "./js/community.js?v=44",
  "./js/directions.js?v=44",
  "./js/explore.js?v=44",
  "./js/featured-place.js?v=44",
  "./js/home.js?v=44",
  "./js/hotels.js?v=44",
  "./js/itinerary.js?v=44",
  "./js/itinerary-photos.js?v=44",
  "./js/onboarding.js?v=44",
  "./js/persistence.js?v=44",
  "./js/planner.js?v=44",
  "./js/profile.js?v=44",
  "./js/pwa.js?v=44",
  "./js/safety.js?v=44",
  "./js/smart-add.js?v=44",
  "./js/state.js?v=44",
  "./js/trip-model.js?v=44",
  "./js/today.js?v=44",
  "./js/ui.js?v=44"
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
      .catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("./?app_version=44") : undefined)))
  );
});
