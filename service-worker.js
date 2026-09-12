const CACHE_NAME = "ai-travel-director-v34";
const APP_FILES = ["./?app_version=34", "./index.html", "./styles.css?v=34", "./app.js?v=34", "./firebase-client.js?v=34", "./firebase-config.js", "./affiliate-config.js?v=34", "./maps.js?v=34", "./manifest.json?v=34", "./icon.svg",
  "./js/community-data.js?v=34",
  "./js/community.js?v=34",
  "./js/directions.js?v=34",
  "./js/explore.js?v=34",
  "./js/home.js?v=34",
  "./js/hotels.js?v=34",
  "./js/itinerary.js?v=34",
  "./js/onboarding.js?v=34",
  "./js/persistence.js?v=34",
  "./js/planner.js?v=34",
  "./js/profile.js?v=34",
  "./js/pwa.js?v=34",
  "./js/safety.js?v=34",
  "./js/state.js?v=34",
  "./js/trip-model.js?v=34",
  "./js/today.js?v=34",
  "./js/ui.js?v=34"
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
      .catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("./?app_version=34") : undefined)))
  );
});
