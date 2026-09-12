const CACHE_NAME = "ai-travel-director-v41";
const APP_FILES = ["./?app_version=41", "./index.html", "./styles.css?v=41", "./app.js?v=41", "./firebase-client.js?v=41", "./firebase-config.js", "./affiliate-config.js?v=41", "./maps.js?v=41", "./manifest.json?v=41", "./icon.svg", "./assets/travel-backdrop.webp",
  "./js/community-data.js?v=41",
  "./js/community.js?v=41",
  "./js/directions.js?v=41",
  "./js/explore.js?v=41",
  "./js/featured-place.js?v=41",
  "./js/home.js?v=41",
  "./js/hotels.js?v=41",
  "./js/itinerary.js?v=41",
  "./js/itinerary-photos.js?v=41",
  "./js/onboarding.js?v=41",
  "./js/persistence.js?v=41",
  "./js/planner.js?v=41",
  "./js/profile.js?v=41",
  "./js/pwa.js?v=41",
  "./js/safety.js?v=41",
  "./js/smart-add.js?v=41",
  "./js/state.js?v=41",
  "./js/trip-model.js?v=41",
  "./js/today.js?v=41",
  "./js/ui.js?v=41"
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
      .catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("./?app_version=41") : undefined)))
  );
});
