const CACHE_NAME = "ai-travel-director-v38";
const APP_FILES = ["./?app_version=38", "./index.html", "./styles.css?v=38", "./app.js?v=38", "./firebase-client.js?v=38", "./firebase-config.js", "./affiliate-config.js?v=38", "./maps.js?v=38", "./manifest.json?v=38", "./icon.svg", "./assets/travel-backdrop.webp",
  "./js/community-data.js?v=38",
  "./js/community.js?v=38",
  "./js/directions.js?v=38",
  "./js/explore.js?v=38",
  "./js/featured-place.js?v=38",
  "./js/home.js?v=38",
  "./js/hotels.js?v=38",
  "./js/itinerary.js?v=38",
  "./js/itinerary-photos.js?v=38",
  "./js/onboarding.js?v=38",
  "./js/persistence.js?v=38",
  "./js/planner.js?v=38",
  "./js/profile.js?v=38",
  "./js/pwa.js?v=38",
  "./js/safety.js?v=38",
  "./js/smart-add.js?v=38",
  "./js/state.js?v=38",
  "./js/trip-model.js?v=38",
  "./js/today.js?v=38",
  "./js/ui.js?v=38"
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
      .catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("./?app_version=38") : undefined)))
  );
});
