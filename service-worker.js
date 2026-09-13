const CACHE_NAME = "ai-travel-director-v46";
const APP_FILES = ["./?app_version=46", "./index.html", "./styles.css?v=46", "./app.js?v=46", "./firebase-client.js?v=46", "./firebase-config.js", "./affiliate-config.js?v=46", "./maps.js?v=46", "./manifest.json?v=46", "./icon.svg", "./assets/travel-backdrop.webp",
  "./js/community-data.js?v=46",
  "./js/community.js?v=46",
  "./js/directions.js?v=46",
  "./js/explore.js?v=46",
  "./js/featured-place.js?v=46",
  "./js/home.js?v=46",
  "./js/hotels.js?v=46",
  "./js/itinerary.js?v=46",
  "./js/itinerary-photos.js?v=46",
  "./js/onboarding.js?v=46",
  "./js/persistence.js?v=46",
  "./js/planner.js?v=46",
  "./js/profile.js?v=46",
  "./js/pwa.js?v=46",
  "./js/safety.js?v=46",
  "./js/smart-add.js?v=46",
  "./js/state.js?v=46",
  "./js/trip-model.js?v=46",
  "./js/trip-adjustments.js?v=46",
  "./js/today.js?v=46",
  "./js/ui.js?v=46"
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
      .catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("./?app_version=46") : undefined)))
  );
});
