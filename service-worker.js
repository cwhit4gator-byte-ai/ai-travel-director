const CACHE_NAME = "ai-travel-director-v33";
const APP_FILES = ["./?app_version=33", "./index.html", "./styles.css?v=33", "./app.js?v=33", "./firebase-client.js?v=33", "./firebase-config.js", "./affiliate-config.js?v=33", "./maps.js?v=33", "./manifest.json?v=33", "./icon.svg",
  "./js/community-data.js?v=33",
  "./js/community.js?v=33",
  "./js/directions.js?v=33",
  "./js/explore.js?v=33",
  "./js/home.js?v=33",
  "./js/hotels.js?v=33",
  "./js/itinerary.js?v=33",
  "./js/onboarding.js?v=33",
  "./js/persistence.js?v=33",
  "./js/planner.js?v=33",
  "./js/profile.js?v=33",
  "./js/pwa.js?v=33",
  "./js/safety.js?v=33",
  "./js/state.js?v=33",
  "./js/trip-model.js?v=33",
  "./js/today.js?v=33",
  "./js/ui.js?v=33"
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
      .catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("./?app_version=33") : undefined)))
  );
});
