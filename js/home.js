import { state, saveLocalState } from "./state.js?v=37";
import { escapeHTML, normalizeInterests, safeImageURL, toast } from "./ui.js?v=37";
import { tripDateForDay, formatTripDate, tripDayNumberForDate, tripRouteStops } from "./trip-model.js?v=37";
import { searchNearbyPlaces } from "../maps.js?v=37";
import { trackAppEvent } from "../firebase-client.js?v=37";

const featuredPlaceCache = new Map();
let featuredLocationKey = "";
let featuredLoadingKey = "";
let featuredPlaces = [];
let featuredPlaceIndex = 0;
let featuredRequestId = 0;

function localISODate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function featuredTripLocation(trip = state.trip, date = new Date()) {
  if (!trip) return "";
  const itinerary = Array.isArray(trip.itinerary) ? trip.itinerary : [];
  let selectedDay;
  const datedDay = tripDayNumberForDate(localISODate(date), trip);
  if (datedDay && datedDay >= 1 && datedDay <= itinerary.length) selectedDay = itinerary[datedDay - 1];
  else if (datedDay && datedDay < 1) selectedDay = itinerary[0];
  else selectedDay = itinerary.find(day => (day.items || []).some(item => !item.done)) || itinerary.at(-1);
  const overnight = String(selectedDay?.overnightLocation || selectedDay?.location || "").trim();
  if (overnight) return overnight;
  const finalActivityLocation = [...(selectedDay?.items || [])].reverse().map(item => String(item?.location || "").trim()).find(Boolean);
  return finalActivityLocation || tripRouteStops(trip)[0] || String(trip.destination || "").trim();
}

export function rankFeaturedPlaces(places = []) {
  return [...places]
    .filter(place => safeImageURL(place.heroPhotoURL || place.photoURL))
    .sort((first, second) => {
      const score = place => Math.max(1, Number(place.rating || 0)) * Math.log10(Math.max(10, Number(place.reviewCount || 0) + 10));
      return score(second) - score(first);
    });
}

function resetFeaturedHero() {
  const hero = document.getElementById("tripHero");
  const image = document.getElementById("tripHeroImage");
  hero.classList.remove("has-destination-photo");
  image.hidden = true;
  image.src = "";
  document.getElementById("tripHeroFeatured").hidden = true;
  const mapButton = document.getElementById("featuredPlaceButton");
  mapButton.textContent = state.trip ? "Explore route" : "Explore map";
  mapButton.dataset.heroMapQuery = state.trip?.destination || "";
}

function displayFeaturedPlace(index = featuredPlaceIndex) {
  const place = featuredPlaces[index];
  if (!place) return resetFeaturedHero();
  const imageURL = safeImageURL(place.heroPhotoURL || place.photoURL);
  if (!imageURL) return resetFeaturedHero();
  featuredPlaceIndex = index;
  const hero = document.getElementById("tripHero");
  const image = document.getElementById("tripHeroImage");
  const featured = document.getElementById("tripHeroFeatured");
  const location = featuredTripLocation();
  image.src = imageURL;
  image.hidden = false;
  image.onerror = () => {
    if (image.src === imageURL) resetFeaturedHero();
  };
  hero.classList.add("has-destination-photo");
  document.getElementById("tripHeroFeaturedLabel").textContent = `FEATURED IN ${location.toLocaleUpperCase()}`;
  document.getElementById("tripHeroPlace").textContent = place.name;
  const details = [place.category, place.rating ? `${place.rating.toFixed(1)} ★` : "", place.reviewCount ? `${place.reviewCount.toLocaleString()} reviews` : ""].filter(Boolean);
  document.getElementById("tripHeroPlaceMeta").textContent = details.join(" · ");
  const mapButton = document.getElementById("featuredPlaceButton");
  mapButton.textContent = "View featured place";
  mapButton.dataset.heroMapQuery = place.address || `${place.name}, ${location}`;
  const rotateButton = document.getElementById("rotateHeroPlace");
  rotateButton.hidden = featuredPlaces.length < 2;
  rotateButton.setAttribute?.("aria-label", `Show another popular place in ${location}`);
  const attribution = place.photoAttribution || {};
  const attributionURL = safeImageURL(attribution.uri);
  const attributionLink = document.getElementById("tripHeroAttribution");
  attributionLink.hidden = !attribution.displayName;
  if (attributionURL) attributionLink.href = attributionURL;
  else attributionLink.removeAttribute?.("href");
  attributionLink.textContent = attribution.displayName ? `Photo: ${attribution.displayName}` : "";
  featured.hidden = false;
}

async function refreshFeaturedHero() {
  const location = featuredTripLocation();
  const key = location.toLocaleLowerCase();
  if (!key) {
    featuredLocationKey = "";
    featuredPlaces = [];
    resetFeaturedHero();
    return;
  }
  if (key === featuredLocationKey && featuredPlaces.length) {
    displayFeaturedPlace(Math.min(featuredPlaceIndex, featuredPlaces.length - 1));
    return;
  }
  if (key === featuredLoadingKey) return;
  const requestId = ++featuredRequestId;
  featuredLocationKey = key;
  featuredLoadingKey = key;
  featuredPlaces = [];
  featuredPlaceIndex = 0;
  resetFeaturedHero();
  if (!featuredPlaceCache.has(key)) featuredPlaceCache.set(key, searchNearbyPlaces(location, "top sights", 6).then(rankFeaturedPlaces).catch(() => []));
  const places = await featuredPlaceCache.get(key);
  if (requestId !== featuredRequestId || key !== featuredLocationKey) return;
  featuredLoadingKey = "";
  featuredPlaces = places;
  if (featuredPlaces.length) displayFeaturedPlace(0);
}

export function renderHome() {
  const title = document.getElementById("homeHeading");
  const summary = document.getElementById("tripSummary");
  const metric = document.getElementById("homeTripMetric");
  const collectionsMetric = document.getElementById("homeCollectionsMetric");
  const savedCount = state.collections.reduce((total, collection) => total + (collection.items || []).length, 0);
  if (collectionsMetric) collectionsMetric.textContent = savedCount ? `${savedCount} saved place${savedCount === 1 ? "" : "s"}` : "Nothing saved yet";
  if (state.trip) {
    const firstDate = tripDateForDay(1);
    const lastDate = tripDateForDay(state.trip.days);
    const dateSummary = firstDate ? `${formatTripDate(firstDate, { month: "short", day: "numeric" })}–${formatTripDate(lastDate, { month: "short", day: "numeric", year: "numeric" })} · ` : "";
    title.textContent = state.trip.destination;
    summary.textContent = `${dateSummary}${state.trip.days}-day working itinerary · $${Number(state.trip.budget || 0).toLocaleString("en-US")} budget · no bookings made`;
    metric.textContent = `${state.trip.days} days in ${state.trip.destination}`;
    document.getElementById("startPlanningButton").textContent = "Ask AI about this trip";
  } else {
    title.textContent = "Where should we go next?";
    summary.textContent = "Describe the trip you want. Your AI director will shape the route around your budget, pace, history, and architecture interests.";
    metric.textContent = "No active trip";
    document.getElementById("startPlanningButton").textContent = "Plan with AI";
  }
  void refreshFeaturedHero();
}

export function renderRecommendations() {
  const interests = normalizeInterests(state.profile.interests).split(",").map(item => item.trim()).filter(Boolean);
  const destination = state.trip?.destination || "your next destination";
  const cards = [
    { icon: "⌂", title: "Architecture before the crowds", text: `Start ${destination} with a historic district matched to your ${state.profile.pace} pace.`, tag: interests[0] || "History" },
    { icon: "↔", title: "Transit-first route", text: `Keep walking segments near ${state.profile.walking} minutes and connect major stops by public transportation.`, tag: "Low friction" },
    { icon: "✦", title: "A flexible final afternoon", text: "Hold one indoor and one outdoor option so the day can adapt without disrupting the trip.", tag: "AI suggestion" }
  ];
  document.getElementById("recommendationList").innerHTML = cards.map(card => `
    <article class="recommendation-card"><span class="card-icon">${card.icon}</span><h3>${escapeHTML(card.title)}</h3><p>${escapeHTML(card.text)}</p><div class="tag-row"><span class="tag">${escapeHTML(card.tag)}</span></div></article>
  `).join("");
}

export function initializeHome() {
  document.getElementById("refreshRecommendations").addEventListener("click", () => { renderRecommendations(); toast("Recommendations refreshed"); });
  document.getElementById("rotateHeroPlace").addEventListener("click", () => {
    if (featuredPlaces.length < 2) return;
    displayFeaturedPlace((featuredPlaceIndex + 1) % featuredPlaces.length);
    trackAppEvent("featured_place_rotated", { location: featuredTripLocation() });
  });
  document.getElementById("featuredPlaceButton").addEventListener("click", event => {
    const query = event.currentTarget?.dataset?.heroMapQuery || event.target?.dataset?.heroMapQuery;
    if (!query) return;
    state.mapQuery = query;
    saveLocalState();
    trackAppEvent("featured_place_opened", { location: featuredTripLocation() });
  });
}
