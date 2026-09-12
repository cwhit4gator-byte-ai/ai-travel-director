const CACHE_NAME = "ai-travel-director-v35";
const APP_FILES = ["./?app_version=35", "./index.html", "./styles.css?v=35", "./app.js?v=35", "./firebase-client.js?v=35", "./firebase-config.js", "./affiliate-config.js?v=35", "./maps.js?v=35", "./manifest.json?v=35", "./icon.svg",
  "./js/community-data.js?v=35",
  "./js/community.js?v=35",
  "./js/directions.js?v=35",
  "./js/explore.js?v=35",
  "./js/home.js?v=35",
  "./js/hotels.js?v=35",
  "./js/itinerary.js?v=35",
  "./js/onboarding.js?v=35",
  "./js/persistence.js?v=35",
  "./js/planner.js?v=35",
  "./js/profile.js?v=35",
  "./js/pwa.js?v=35",
  "./js/safety.js?v=35",
  "./js/state.js?v=35",
  "./js/trip-model.js?v=35",
  "./js/today.js?v=35",
  "./js/ui.js?v=35"
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
      .catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("./?app_version=35") : undefined)))
  );
});
