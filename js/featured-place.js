import { state, saveLocalState } from "./state.js?v=49";
import { safeImageURL } from "./ui.js?v=49";
import { tripDayNumberForDate, tripRouteStops } from "./trip-model.js?v=49";
import { searchNearbyPlaces, searchPlaceDetails } from "../maps.js?v=49";
import { trackAppEvent } from "../firebase-client.js?v=49";

const featuredPlaceCache = new Map();

function localISODate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function plainMetadata(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchJSON(url, timeout = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Photo source returned ${response.status}.`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
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

export function selectWikimediaPage(pages = [], preferredTerms = []) {
  const terms = preferredTerms.map(term => String(term || "").toLocaleLowerCase()).filter(Boolean);
  return [...pages]
    .filter(page => page?.thumbnail?.source && page?.pageimage && !/^list of\b/i.test(String(page.title || "")))
    .sort((first, second) => {
      const score = page => terms.reduce((total, term) => total + (String(page.title || "").toLocaleLowerCase().includes(term) ? 1 : 0), 0);
      return score(second) - score(first) || Number(first.index || 999) - Number(second.index || 999);
    })[0] || null;
}

export async function fetchWikimediaHighlight(location, searchTerms = `${location} landmark tourist attraction`, preferredTerms = []) {
  const search = new URL("https://en.wikipedia.org/w/api.php");
  Object.entries({
    action: "query", format: "json", origin: "*", generator: "search",
    gsrsearch: searchTerms, gsrnamespace: "0", gsrlimit: "6",
    prop: "pageimages|info", piprop: "thumbnail|name", pithumbsize: "1400", pilicense: "free", inprop: "url"
  }).forEach(([key, value]) => search.searchParams.set(key, value));
  const searchData = await fetchJSON(search.href);
  const page = selectWikimediaPage(Object.values(searchData.query?.pages || {}), preferredTerms);
  if (!page) return null;

  let photoURL = safeImageURL(page.thumbnail.source);
  let attributionName = "Wikimedia Commons";
  let attributionURL = safeImageURL(page.fullurl);
  try {
    const details = new URL("https://commons.wikimedia.org/w/api.php");
    Object.entries({
      action: "query", format: "json", origin: "*", prop: "imageinfo", titles: `File:${page.pageimage}`,
      iiprop: "url|extmetadata", iiurlwidth: "1400", iiextmetadatalanguage: "en",
      iiextmetadatafilter: "Artist|LicenseShortName"
    }).forEach(([key, value]) => details.searchParams.set(key, value));
    const detailsData = await fetchJSON(details.href);
    const imageInfo = Object.values(detailsData.query?.pages || {})[0]?.imageinfo?.[0];
    photoURL = safeImageURL(imageInfo?.thumburl || imageInfo?.url) || photoURL;
    attributionURL = safeImageURL(imageInfo?.descriptionurl) || attributionURL;
    const artist = plainMetadata(imageInfo?.extmetadata?.Artist?.value);
    const license = plainMetadata(imageInfo?.extmetadata?.LicenseShortName?.value);
    attributionName = [artist || "Wikimedia Commons", license].filter(Boolean).join(" · ");
  } catch (error) {
    console.info("Using the Wikipedia destination image without extended photo details.", error);
  }
  if (!photoURL) return null;
  return {
    id: `wikimedia-${page.pageid || page.title}`,
    name: String(page.title || location),
    address: `${page.title || location}, ${location}`,
    category: "Destination highlight",
    heroPhotoURL: photoURL,
    photoAttribution: { displayName: attributionName, uri: attributionURL },
    source: "wikimedia"
  };
}

export function activityPhotoSearch(item, day = {}) {
  const name = String(item?.name || "").trim();
  const exactLocation = String(item?.location || "").trim();
  const city = String(day?.overnightLocation || exactLocation || "").trim();
  const intent = name.toLocaleLowerCase();
  const genericSearches = [
    { pattern: /food|restaurant|cuisine|market|lunch|dinner|cafe/, query: `${city} cuisine`, terms: ["cuisine", "food", "market"] },
    { pattern: /river|waterfront|riverside/, query: `${city} river`, terms: ["river", "vltava", "danube", "waterfront"] },
    { pattern: /old town|architecture walk/, query: `${city} old town`, terms: ["old town", "historic centre", "historic center"] },
    { pattern: /museum|history/, query: `${city} history museum`, terms: ["museum", "history"] },
    { pattern: /square|civic district/, query: `${city} main square`, terms: ["square", "plaza"] },
    { pattern: /indoor|backup/, query: `${city} museum`, terms: ["museum", "gallery"] },
    { pattern: /landmark interior/, query: `${city} castle cathedral`, terms: ["castle", "cathedral"] },
    { pattern: /train|station|transit/, query: `${city} main railway station`, terms: ["station", "railway"] }
  ];
  const generic = genericSearches.find(option => option.pattern.test(intent));
  if (generic && city) return { query: generic.query, terms: generic.terms };
  const preferredTerms = name.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(term => term.length > 3);
  return { query: [name, exactLocation || city].filter(Boolean).join(", "), terms: preferredTerms };
}

export async function loadActivityPhoto(item, day = {}) {
  const existingPhoto = safeImageURL(item?.photoURL);
  if (existingPhoto) {
    return {
      name: String(item.name || "Itinerary activity"),
      address: String(item.location || day.overnightLocation || ""),
      category: String(item.category || "Activity"),
      photoURL: existingPhoto,
      photoAttribution: item.photoAttribution || null,
      mapsURL: safeImageURL(item.mapsURL)
    };
  }
  const location = String(day?.overnightLocation || item?.location || "").trim();
  const search = activityPhotoSearch(item, day);
  if (!search.query) return null;
  try {
    const exactMatches = rankFeaturedPlaces(await searchPlaceDetails(search.query, 3));
    if (exactMatches.length) return exactMatches[0];
  } catch (error) {
    console.info("Live place photography is unavailable for an itinerary card; using a public destination photo.", error);
  }
  try {
    const exactFallback = await fetchWikimediaHighlight(location || item.name, search.query, search.terms);
    if (exactFallback) return exactFallback;
    return location && location !== search.query ? fetchWikimediaHighlight(location) : null;
  } catch (error) {
    console.info("No suitable itinerary photo is available for this activity.", error);
    return null;
  }
}

async function loadFeaturedPlaces(location) {
  try {
    const googlePlaces = rankFeaturedPlaces(await searchNearbyPlaces(location, "top sights", 6));
    if (googlePlaces.length) return googlePlaces;
  } catch (error) {
    console.info("Google Places is unavailable for the destination banner; using a public destination photo.", error);
  }
  try {
    const fallback = await fetchWikimediaHighlight(location);
    return fallback ? [fallback] : [];
  } catch (error) {
    console.info("No destination banner photo is available; keeping the branded background.", error);
    return [];
  }
}

export function createFeaturedPlace() {
  let featuredLocationKey = "";
  let featuredLoadingKey = "";
  let featuredPlaces = [];
  let featuredPlaceIndex = 0;
  let featuredRequestId = 0;

  function resetFeaturedHero() {
    const hero = document.getElementById("tripHero");
    const image = document.getElementById("tripHeroImage");
    hero.classList.remove("has-destination-photo");
    image.hidden = true;
    image.removeAttribute?.("src");
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

  async function render() {
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
    if (!featuredPlaceCache.has(key)) featuredPlaceCache.set(key, loadFeaturedPlaces(location));
    const places = await featuredPlaceCache.get(key);
    if (requestId !== featuredRequestId || key !== featuredLocationKey) return;
    featuredLoadingKey = "";
    featuredPlaces = places;
    if (featuredPlaces.length) displayFeaturedPlace(0);
  }

  function initialize() {
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

  return { initialize, render };
}
