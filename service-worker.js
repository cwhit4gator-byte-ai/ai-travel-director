const CACHE_NAME = "ai-travel-director-v40";
const APP_FILES = ["./?app_version=40", "./index.html", "./styles.css?v=40", "./app.js?v=40", "./firebase-client.js?v=40", "./firebase-config.js", "./affiliate-config.js?v=40", "./maps.js?v=40", "./manifest.json?v=40", "./icon.svg", "./assets/travel-backdrop.webp",
  "./js/community-data.js?v=40",
  "./js/community.js?v=40",
  "./js/directions.js?v=40",
  "./js/explore.js?v=40",
  "./js/featured-place.js?v=40",
  "./js/home.js?v=40",
  "./js/hotels.js?v=40",
  "./js/itinerary.js?v=40",
  "./js/itinerary-photos.js?v=40",
  "./js/onboarding.js?v=40",
  "./js/persistence.js?v=40",
  "./js/planner.js?v=40",
  "./js/profile.js?v=40",
  "./js/pwa.js?v=40",
  "./js/safety.js?v=40",
  "./js/smart-add.js?v=40",
  "./js/state.js?v=40",
  "./js/trip-model.js?v=40",
  "./js/today.js?v=40",
  "./js/ui.js?v=40"
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
      .catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("./?app_version=40") : undefined)))
  );
});
