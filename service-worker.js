const CACHE_NAME = "ai-travel-director-v43";
const APP_FILES = ["./?app_version=43", "./index.html", "./styles.css?v=43", "./app.js?v=43", "./firebase-client.js?v=43", "./firebase-config.js", "./affiliate-config.js?v=43", "./maps.js?v=43", "./manifest.json?v=43", "./icon.svg", "./assets/travel-backdrop.webp",
  "./js/community-data.js?v=43",
  "./js/community.js?v=43",
  "./js/directions.js?v=43",
  "./js/explore.js?v=43",
  "./js/featured-place.js?v=43",
  "./js/home.js?v=43",
  "./js/hotels.js?v=43",
  "./js/itinerary.js?v=43",
  "./js/itinerary-photos.js?v=43",
  "./js/onboarding.js?v=43",
  "./js/persistence.js?v=43",
  "./js/planner.js?v=43",
  "./js/profile.js?v=43",
  "./js/pwa.js?v=43",
  "./js/safety.js?v=43",
  "./js/smart-add.js?v=43",
  "./js/state.js?v=43",
  "./js/trip-model.js?v=43",
  "./js/today.js?v=43",
  "./js/ui.js?v=43"
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
      .catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("./?app_version=43") : undefined)))
  );
});
