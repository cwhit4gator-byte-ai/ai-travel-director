const CACHE_NAME = "ai-travel-director-v28";
const APP_FILES = ["./?app_version=28", "./index.html", "./styles.css?v=28", "./app.js?v=28", "./firebase-client.js?v=28", "./firebase-config.js", "./affiliate-config.js?v=28", "./maps.js?v=28", "./manifest.json?v=28", "./icon.svg",
  "./js/community-data.js?v=28",
  "./js/community.js?v=28",
  "./js/directions.js?v=28",
  "./js/explore.js?v=28",
  "./js/home.js?v=28",
  "./js/hotels.js?v=28",
  "./js/itinerary.js?v=28",
  "./js/onboarding.js?v=28",
  "./js/persistence.js?v=28",
  "./js/planner.js?v=28",
  "./js/profile.js?v=28",
  "./js/pwa.js?v=28",
  "./js/safety.js?v=28",
  "./js/state.js?v=28",
  "./js/trip-model.js?v=28",
  "./js/today.js?v=28",
  "./js/ui.js?v=28"
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
      .catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("./?app_version=28") : undefined)))
  );
});
