import { state, saveLocalState } from "./state.js?v=32";
import { escapeHTML, safeImageURL, toast } from "./ui.js?v=32";
import { scheduleSave } from "./persistence.js?v=32";
import { trackAppEvent } from "../firebase-client.js?v=32";
import { renderGoogleMap, renderGooglePlaceResultsMap, renderGoogleRouteMap, searchNearbyPlaces } from "../maps.js?v=32";
import { currentDestination, activityCatalog, tripRouteStops } from "./trip-model.js?v=32";

export function createExplore({ showView, renderHome, renderCommunityMapPicks }) {
  let mapRequestId = 0;
  let categoryRequestId = 0;
  let selectedRouteStop = "";
  let activeCategory = "";

  const categoryLabels = {
    "top sights": "Top sights",
    "historic architecture": "History",
    "local restaurants no alcohol": "Food",
    "train station": "Transit",
    "quiet parks": "Quiet places"
  };

  function currentRouteStops() {
    return tripRouteStops().map(location => String(location).trim()).filter(Boolean);
  }

  function renderRouteStopPicker(stops = currentRouteStops()) {
    const picker = document.getElementById("routeStopPicker");
    const list = document.getElementById("routeStopList");
    picker.hidden = stops.length < 2;
    if (picker.hidden) {
      list.innerHTML = "";
      return;
    }
    const buttons = [{ label: "Full route", value: "" }, ...stops.map(location => ({ label: location, value: location }))];
    list.innerHTML = buttons.map((item, index) => `<button class="route-stop-button${item.value === selectedRouteStop ? " active" : ""}" type="button" data-route-stop-index="${index - 1}" aria-pressed="${item.value === selectedRouteStop}">${escapeHTML(item.label)}</button>`).join("");
  }

  function mapElements() {
    return { canvas: document.getElementById("mapCanvas"), fallback: document.getElementById("mapFallback") };
  }

  function hidePlaceResults() {
    const section = document.getElementById("mapResultsSection");
    section.hidden = true;
    document.getElementById("placeList").innerHTML = "";
    document.getElementById("mapResultCount").textContent = "";
  }

  function setPlaceResultsLoading(category, location) {
    const label = categoryLabels[category] || "Places";
    const section = document.getElementById("mapResultsSection");
    document.getElementById("mapResultsHeading").textContent = `${label} near ${location}`;
    document.getElementById("mapResultCount").textContent = "Searching…";
    document.getElementById("placeList").innerHTML = `<div class="place-loading" role="status">Finding selectable ${escapeHTML(label.toLowerCase())} options near ${escapeHTML(location)}…</div>`;
    section.hidden = false;
    section.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }

  function directionsURL(place) {
    const safeMapsURL = safeImageURL(place.mapsURL);
    if (safeMapsURL) return safeMapsURL;
    const destination = place.address || `${place.name}, ${place.location}`;
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  }

  function renderPlaceOptions(places, category, location, { planningOnly = false } = {}) {
    const label = categoryLabels[category] || "Places";
    const section = document.getElementById("mapResultsSection");
    document.getElementById("mapResultsHeading").textContent = `${label} near ${location}`;
    document.getElementById("mapResultCount").textContent = `${places.length} options`;
    document.getElementById("placeList").innerHTML = places.map((place, index) => {
      const photoURL = safeImageURL(place.photoURL);
      const rating = place.rating ? `${place.rating.toFixed(1)} ★${place.reviewCount ? ` · ${place.reviewCount.toLocaleString()} reviews` : ""}` : "Traveler planning option";
      const address = place.address || location;
      return `<article class="place-card">
        ${photoURL ? `<img class="place-card-photo" src="${escapeHTML(photoURL)}" alt="" loading="lazy" />` : `<span class="place-pin" aria-hidden="true">${index + 1}</span>`}
        <div class="place-card-main">
          <strong>${escapeHTML(place.name)}</strong>
          <p>${escapeHTML(rating)}</p>
          <small>${escapeHTML(address)}</small>
          <div class="place-option-actions">
            <button class="place-option-action primary" type="button" data-add-place="${escapeHTML(place.name)}" data-place-category="${escapeHTML(place.category || label)}" data-place-cost="${Number(place.cost || 0)}" data-place-location="${escapeHTML(address)}">Add to trip</button>
            <a class="place-option-action" href="${escapeHTML(directionsURL({ ...place, location }))}" target="_blank" rel="noopener">Directions</a>
          </div>
        </div>
      </article>`;
    }).join("");
    if (planningOnly) document.getElementById("placeList").innerHTML += `<p class="field-note">Live place details are temporarily unavailable. These are planning suggestions; confirm details before visiting.</p>`;
    section.hidden = false;
    renderCommunityMapPicks(location);
  }

  function planningFallback(category, location) {
    const query = String(category || "").toLowerCase();
    return [...activityCatalog]
      .sort((a, b) => Number(`${b.name} ${b.category}`.toLowerCase().includes(query)) - Number(`${a.name} ${a.category}`.toLowerCase().includes(query)))
      .slice(0, 4)
      .map(place => ({ ...place, address: location, location }));
  }

  function prepareMapRequest(label, inputValue) {
    const requestId = ++mapRequestId;
    const { canvas, fallback } = mapElements();
    canvas.hidden = false;
    fallback.hidden = true;
    document.getElementById("mapLabelText").textContent = label;
    document.getElementById("mapSearchInput").value = inputValue;
    return { requestId, canvas, fallback };
  }

  function showMapFallback({ requestId, canvas, fallback }, query, label) {
    if (requestId !== mapRequestId) return;
    canvas.hidden = true;
    canvas.replaceChildren();
    fallback.hidden = false;
    fallback.src = `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
    document.getElementById("mapLabelText").textContent = label;
  }

  async function updateRouteMap(stops = currentRouteStops()) {
    if (stops.length < 2) return updateMap(stops[0] || currentDestination());
    selectedRouteStop = "";
    state.mapQuery = currentDestination();
    saveLocalState();
    renderRouteStopPicker(stops);
    hidePlaceResults();
    renderCommunityMapPicks(stops[0]);
    const request = prepareMapRequest(`Mapping ${stops.length} itinerary stops…`, stops.join(" → "));
    try {
      const label = await renderGoogleRouteMap(request.canvas, stops);
      if (request.requestId !== mapRequestId) return;
      document.getElementById("mapLabelText").textContent = label;
    } catch (error) {
      console.warn("Interactive route map unavailable; using embedded fallback.", error);
      showMapFallback(request, stops[0], `Route map unavailable · Showing ${stops[0]}`);
    }
  }

  async function updateMap(query, { inputValue = query, keepResults = false } = {}) {
    const normalized = String(query || currentDestination()).trim();
    const routeStops = currentRouteStops();
    selectedRouteStop = routeStops.find(location => location.toLocaleLowerCase() === normalized.toLocaleLowerCase()) || "";
    state.mapQuery = normalized;
    saveLocalState();
    const destination = state.trip?.destination && state.trip.destination !== "Your destination" ? state.trip.destination : "";
    const destinationContext = routeStops.length > 1 ? "" : destination;
    const fullQuery = !destinationContext || normalized.toLowerCase().includes(destinationContext.toLowerCase()) ? normalized : `${normalized} in ${destinationContext}`;
    renderRouteStopPicker(routeStops);
    if (!keepResults) hidePlaceResults();
    renderCommunityMapPicks(selectedRouteStop || normalized);
    const request = prepareMapRequest(`Finding ${fullQuery}…`, inputValue);

    try {
      const resolvedLabel = await renderGoogleMap(request.canvas, fullQuery);
      if (request.requestId !== mapRequestId) return;
      document.getElementById("mapLabelText").textContent = resolvedLabel;
    } catch (error) {
      console.warn("Interactive Maps view unavailable; using embedded fallback.", error);
      showMapFallback(request, fullQuery, `Showing map results for ${fullQuery}`);
    }
  }

  function renderMap() {
    const stops = currentRouteStops();
    const query = String(state.mapQuery || currentDestination()).trim();
    const destination = String(state.trip?.destination || "").trim();
    if (stops.length > 1 && (!query || query.toLocaleLowerCase() === destination.toLocaleLowerCase())) updateRouteMap(stops);
    else updateMap(query);
  }

  async function showCategoryOptions(category, location) {
    const normalizedLocation = String(location || currentDestination()).trim();
    const requestId = ++categoryRequestId;
    activeCategory = category;
    const routeStops = currentRouteStops();
    selectedRouteStop = routeStops.find(stop => stop.toLocaleLowerCase() === normalizedLocation.toLocaleLowerCase()) || selectedRouteStop;
    state.mapQuery = normalizedLocation;
    saveLocalState();
    renderRouteStopPicker(routeStops);
    setPlaceResultsLoading(category, normalizedLocation);
    const request = prepareMapRequest(`Finding ${categoryLabels[category] || category} near ${normalizedLocation}…`, normalizedLocation);
    try {
      const places = await searchNearbyPlaces(normalizedLocation, category, 6);
      if (requestId !== categoryRequestId || request.requestId !== mapRequestId) return;
      if (!places.length) throw new Error("No live place results were found.");
      renderPlaceOptions(places, category, normalizedLocation);
      await renderGooglePlaceResultsMap(request.canvas, places);
      if (requestId !== categoryRequestId || request.requestId !== mapRequestId) return;
      document.getElementById("mapLabelText").textContent = `${places.length} ${categoryLabels[category] || "place"} options in ${normalizedLocation}`;
    } catch (error) {
      if (requestId !== categoryRequestId || request.requestId !== mapRequestId) return;
      console.warn("Live nearby places unavailable; showing planning suggestions.", error);
      renderPlaceOptions(planningFallback(category, normalizedLocation), category, normalizedLocation, { planningOnly: true });
      try {
        const resolvedLabel = await renderGoogleMap(request.canvas, normalizedLocation);
        if (requestId === categoryRequestId && request.requestId === mapRequestId) document.getElementById("mapLabelText").textContent = resolvedLabel;
      } catch (mapError) {
        showMapFallback(request, normalizedLocation, `Showing ${normalizedLocation}`);
      }
    }
  }

  function addPlaceToTrip(name, category, cost, location) {
    if (!state.trip) {
      toast("Plan a destination before adding places");
      showView("plannerView");
      return;
    }
    const day = state.trip.itinerary[0];
    day.items.push({ id: crypto.randomUUID(), time: "Flexible", name, location: location || name, category, cost: Number(cost || 0), note: "Saved from Explore. Confirm hours and availability before visiting.", done: false });
    scheduleSave();
    renderHome();
    toast("Added to your trip");
  }

  document.getElementById("mapSearchForm").addEventListener("submit", event => { event.preventDefault(); const query = document.getElementById("mapSearchInput").value.trim(); if (query) { activeCategory = ""; trackAppEvent("map_search", { method: "typed" }); updateMap(query); } });
  document.querySelectorAll("[data-map-filter]").forEach(button => button.addEventListener("click", () => { document.querySelectorAll("[data-map-filter]").forEach(item => item.classList.remove("active")); button.classList.add("active"); trackAppEvent("map_search", { method: "category", category: button.dataset.mapFilter }); const focus = selectedRouteStop || currentRouteStops()[0] || currentDestination(); showCategoryOptions(button.dataset.mapFilter, focus); }));
  document.getElementById("routeStopList").addEventListener("click", event => {
    const button = event.target.closest("[data-route-stop-index]");
    if (!button) return;
    const stops = currentRouteStops();
    const index = Number(button.dataset.routeStopIndex);
    trackAppEvent("map_search", { method: index < 0 ? "route" : "route_stop" });
    if (index < 0) { activeCategory = ""; updateRouteMap(stops); }
    else if (stops[index] && activeCategory) showCategoryOptions(activeCategory, stops[index]);
    else if (stops[index]) updateMap(stops[index]);
  });
  document.getElementById("placeList").addEventListener("click", event => { const button = event.target.closest("[data-add-place]"); if (button) addPlaceToTrip(button.dataset.addPlace, button.dataset.placeCategory, button.dataset.placeCost, button.dataset.placeLocation); });

  document.getElementById("communityMapList").addEventListener("click", event => { const button = event.target.closest("[data-map-community]"); if (button) { activeCategory = ""; state.mapQuery = button.dataset.mapCommunity; updateMap(state.mapQuery); } });
  document.getElementById("locateMeButton").addEventListener("click", () => {
    trackAppEvent("location_permission_prompted", { source: "explore" });
    if (!navigator.geolocation) { trackAppEvent("location_permission_result", { source: "explore", result: "unsupported" }); return toast("Location is unavailable in this browser"); }
    navigator.geolocation.getCurrentPosition(position => { activeCategory = ""; trackAppEvent("location_permission_result", { source: "explore", result: "granted" }); updateMap(`${position.coords.latitude.toFixed(5)},${position.coords.longitude.toFixed(5)}`); }, () => { trackAppEvent("location_permission_result", { source: "explore", result: "denied" }); toast("Location permission was not granted"); }, { enableHighAccuracy: true, timeout: 10000 });
  });

  return { renderMap };
}
