const CACHE_NAME = "ai-travel-director-v42";
const APP_FILES = ["./?app_version=42", "./index.html", "./styles.css?v=42", "./app.js?v=42", "./firebase-client.js?v=42", "./firebase-config.js", "./affiliate-config.js?v=42", "./maps.js?v=42", "./manifest.json?v=42", "./icon.svg", "./assets/travel-backdrop.webp",
  "./js/community-data.js?v=42",
  "./js/community.js?v=42",
  "./js/directions.js?v=42",
  "./js/explore.js?v=42",
  "./js/featured-place.js?v=42",
  "./js/home.js?v=42",
  "./js/hotels.js?v=42",
  "./js/itinerary.js?v=42",
  "./js/itinerary-photos.js?v=42",
  "./js/onboarding.js?v=42",
  "./js/persistence.js?v=42",
  "./js/planner.js?v=42",
  "./js/profile.js?v=42",
  "./js/pwa.js?v=42",
  "./js/safety.js?v=42",
  "./js/smart-add.js?v=42",
  "./js/state.js?v=42",
  "./js/trip-model.js?v=42",
  "./js/today.js?v=42",
  "./js/ui.js?v=42"
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
      .catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("./?app_version=42") : undefined)))
  );
});
