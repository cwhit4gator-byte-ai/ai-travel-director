const CACHE_NAME = "ai-travel-director-v39";
const APP_FILES = ["./?app_version=39", "./index.html", "./styles.css?v=39", "./app.js?v=39", "./firebase-client.js?v=39", "./firebase-config.js", "./affiliate-config.js?v=39", "./maps.js?v=39", "./manifest.json?v=39", "./icon.svg", "./assets/travel-backdrop.webp",
  "./js/community-data.js?v=39",
  "./js/community.js?v=39",
  "./js/directions.js?v=39",
  "./js/explore.js?v=39",
  "./js/featured-place.js?v=39",
  "./js/home.js?v=39",
  "./js/hotels.js?v=39",
  "./js/itinerary.js?v=39",
  "./js/itinerary-photos.js?v=39",
  "./js/onboarding.js?v=39",
  "./js/persistence.js?v=39",
  "./js/planner.js?v=39",
  "./js/profile.js?v=39",
  "./js/pwa.js?v=39",
  "./js/safety.js?v=39",
  "./js/smart-add.js?v=39",
  "./js/state.js?v=39",
  "./js/trip-model.js?v=39",
  "./js/today.js?v=39",
  "./js/ui.js?v=39"
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
      .catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("./?app_version=39") : undefined)))
  );
});
