const CACHE_NAME = "ai-travel-director-v30";
const APP_FILES = ["./?app_version=30", "./index.html", "./styles.css?v=30", "./app.js?v=30", "./firebase-client.js?v=30", "./firebase-config.js", "./affiliate-config.js?v=30", "./maps.js?v=30", "./manifest.json?v=30", "./icon.svg",
  "./js/community-data.js?v=30",
  "./js/community.js?v=30",
  "./js/directions.js?v=30",
  "./js/explore.js?v=30",
  "./js/home.js?v=30",
  "./js/hotels.js?v=30",
  "./js/itinerary.js?v=30",
  "./js/onboarding.js?v=30",
  "./js/persistence.js?v=30",
  "./js/planner.js?v=30",
  "./js/profile.js?v=30",
  "./js/pwa.js?v=30",
  "./js/safety.js?v=30",
  "./js/state.js?v=30",
  "./js/trip-model.js?v=30",
  "./js/today.js?v=30",
  "./js/ui.js?v=30"
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
      .catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("./?app_version=30") : undefined)))
  );
});
