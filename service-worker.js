const CACHE_NAME = "ai-travel-director-v37";
const APP_FILES = ["./?app_version=37", "./index.html", "./styles.css?v=37", "./app.js?v=37", "./firebase-client.js?v=37", "./firebase-config.js", "./affiliate-config.js?v=37", "./maps.js?v=37", "./manifest.json?v=37", "./icon.svg", "./assets/travel-backdrop.webp",
  "./js/community-data.js?v=37",
  "./js/community.js?v=37",
  "./js/directions.js?v=37",
  "./js/explore.js?v=37",
  "./js/featured-place.js?v=37",
  "./js/home.js?v=37",
  "./js/hotels.js?v=37",
  "./js/itinerary.js?v=37",
  "./js/itinerary-photos.js?v=37",
  "./js/onboarding.js?v=37",
  "./js/persistence.js?v=37",
  "./js/planner.js?v=37",
  "./js/profile.js?v=37",
  "./js/pwa.js?v=37",
  "./js/safety.js?v=37",
  "./js/smart-add.js?v=37",
  "./js/state.js?v=37",
  "./js/trip-model.js?v=37",
  "./js/today.js?v=37",
  "./js/ui.js?v=37"
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
      .catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("./?app_version=37") : undefined)))
  );
});
