const CACHE_NAME = "ai-travel-director-v27";
const APP_FILES = ["./?app_version=27", "./index.html", "./styles.css?v=27", "./app.js?v=27", "./firebase-client.js?v=27", "./firebase-config.js", "./affiliate-config.js?v=27", "./maps.js?v=27", "./manifest.json?v=27", "./icon.svg",
  "./js/community-data.js?v=27",
  "./js/community.js?v=27",
  "./js/directions.js?v=27",
  "./js/explore.js?v=27",
  "./js/home.js?v=27",
  "./js/hotels.js?v=27",
  "./js/itinerary.js?v=27",
  "./js/onboarding.js?v=27",
  "./js/persistence.js?v=27",
  "./js/planner.js?v=27",
  "./js/profile.js?v=27",
  "./js/pwa.js?v=27",
  "./js/safety.js?v=27",
  "./js/state.js?v=27",
  "./js/trip-model.js?v=27",
  "./js/ui.js?v=27"
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
      .catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("./?app_version=27") : undefined)))
  );
});
