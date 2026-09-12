const CACHE_NAME = "ai-travel-director-v31";
const APP_FILES = ["./?app_version=31", "./index.html", "./styles.css?v=31", "./app.js?v=31", "./firebase-client.js?v=31", "./firebase-config.js", "./affiliate-config.js?v=31", "./maps.js?v=31", "./manifest.json?v=31", "./icon.svg",
  "./js/community-data.js?v=31",
  "./js/community.js?v=31",
  "./js/directions.js?v=31",
  "./js/explore.js?v=31",
  "./js/home.js?v=31",
  "./js/hotels.js?v=31",
  "./js/itinerary.js?v=31",
  "./js/onboarding.js?v=31",
  "./js/persistence.js?v=31",
  "./js/planner.js?v=31",
  "./js/profile.js?v=31",
  "./js/pwa.js?v=31",
  "./js/safety.js?v=31",
  "./js/state.js?v=31",
  "./js/trip-model.js?v=31",
  "./js/today.js?v=31",
  "./js/ui.js?v=31"
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
      .catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("./?app_version=31") : undefined)))
  );
});
