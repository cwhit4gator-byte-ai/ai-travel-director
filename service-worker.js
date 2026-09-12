const CACHE_NAME = "ai-travel-director-v29";
const APP_FILES = ["./?app_version=29", "./index.html", "./styles.css?v=29", "./app.js?v=29", "./firebase-client.js?v=29", "./firebase-config.js", "./affiliate-config.js?v=29", "./maps.js?v=29", "./manifest.json?v=29", "./icon.svg",
  "./js/community-data.js?v=29",
  "./js/community.js?v=29",
  "./js/directions.js?v=29",
  "./js/explore.js?v=29",
  "./js/home.js?v=29",
  "./js/hotels.js?v=29",
  "./js/itinerary.js?v=29",
  "./js/onboarding.js?v=29",
  "./js/persistence.js?v=29",
  "./js/planner.js?v=29",
  "./js/profile.js?v=29",
  "./js/pwa.js?v=29",
  "./js/safety.js?v=29",
  "./js/state.js?v=29",
  "./js/trip-model.js?v=29",
  "./js/today.js?v=29",
  "./js/ui.js?v=29"
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
      .catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("./?app_version=29") : undefined)))
  );
});
