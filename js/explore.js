import { state, saveLocalState } from "./state.js?v=33";
import { escapeHTML, safeImageURL, toast } from "./ui.js?v=33";
import { scheduleSave } from "./persistence.js?v=33";
import { trackAppEvent } from "../firebase-client.js?v=33";
import { focusGooglePlaceResult, renderGoogleMap, renderGooglePlaceResultsMap, renderGoogleRouteMap, searchNearbyPlaces } from "../maps.js?v=33";
import { currentDestination, tripRouteStops } from "./trip-model.js?v=33";

export function createExplore({ showView, renderHome, renderCommunityMapPicks }) {
  let mapRequestId = 0;
  let categoryRequestId = 0;
  let selectedRouteStop = "";
  let activeCategory = "";
  let currentPlaceResults = [];
  let currentResultsLocation = "";
  let currentResultsArePlanningOnly = false;

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
    currentPlaceResults = [];
    currentResultsLocation = "";
    currentResultsArePlanningOnly = false;
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

  function mapsSearchURL(place, location) {
    const query = place.searchQuery || place.address || `${place.name}, ${location}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  function renderPlaceOptions(places, category, location, { planningOnly = false } = {}) {
    const label = categoryLabels[category] || "Places";
    const section = document.getElementById("mapResultsSection");
    currentPlaceResults = places;
    currentResultsLocation = location;
    currentResultsArePlanningOnly = planningOnly;
    document.getElementById("mapResultsHeading").textContent = `${planningOnly ? `${label} map searches` : label} near ${location}`;
    document.getElementById("mapResultCount").textContent = `${places.length} options`;
    document.getElementById("placeList").innerHTML = places.map((place, index) => {
      const photoURL = safeImageURL(place.photoURL);
      const rating = place.rating ? `${place.rating.toFixed(1)} ★${place.reviewCount ? ` · ${place.reviewCount.toLocaleString()} reviews` : ""}` : "Map search suggestion";
      const address = place.address || location;
      const externalURL = planningOnly ? mapsSearchURL(place, location) : directionsURL({ ...place, location });
      return `<article class="place-card">
        ${photoURL ? `<img class="place-card-photo" src="${escapeHTML(photoURL)}" alt="" loading="lazy" />` : `<span class="place-pin" aria-hidden="true">${index + 1}</span>`}
        <div class="place-card-main">
          <strong>${escapeHTML(place.name)}</strong>
          <p>${escapeHTML(rating)}</p>
          <small>${escapeHTML(address)}</small>
          <div class="place-option-actions">
            <button class="place-option-action primary" type="button" data-show-place-index="${index}">${planningOnly ? "Show map search" : "Show on map"}</button>
            ${planningOnly ? "" : `<button class="place-option-action" type="button" data-add-place="${escapeHTML(place.name)}" data-place-category="${escapeHTML(place.category || label)}" data-place-cost="${Number(place.cost || 0)}" data-place-location="${escapeHTML(address)}">Add to trip</button>`}
            <a class="place-option-action" href="${escapeHTML(externalURL)}" target="_blank" rel="noopener">${planningOnly ? "Open Maps" : "Directions"}</a>
          </div>
        </div>
      </article>`;
    }).join("");
    if (planningOnly) document.getElementById("placeList").innerHTML += `<p class="field-note">Live place details are unavailable on this hostname. Choose a category-specific map search above, or open it in Google Maps.</p>`;
    section.hidden = false;
    renderCommunityMapPicks(location);
  }

  function planningFallback(category, location) {
    const options = {
      "top sights": ["Top landmarks", "Best viewpoints", "Historic center highlights", "Popular attractions"],
      "historic architecture": ["History museums", "Historic architecture", "Heritage sites", "Old town sights"],
      "local restaurants no alcohol": ["Top-rated local restaurants", "Traditional local cuisine", "Food markets", "Quiet cafés"],
      "train station": ["Main train station", "Public transit hubs", "Intercity bus station", "Accessible transit stops"],
      "quiet parks": ["Quiet parks", "Botanical gardens", "Riverside walks", "Peaceful neighborhoods"]
    }[category] || ["Top places", "Local highlights", "Nearby attractions", "Traveler favorites"];
    return options.map((name, index) => ({
      id: `planning-${index}`,
      name: `${name} in ${location}`,
      searchQuery: `${name} in ${location}`,
      address: `Search area: ${location}`,
      category: categoryLabels[category] || "Places",
      location
    }));
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

  async function showPlaceOnMap(index) {
    const place = currentPlaceResults[Number(index)];
    if (!place) return;
    document.getElementById("placeList").querySelectorAll("[data-show-place-index]").forEach(button => {
      const selected = Number(button.dataset.showPlaceIndex) === Number(index);
      button.closest(".place-card")?.classList.toggle("selected", selected);
      button.textContent = selected ? "Shown on map" : (currentResultsArePlanningOnly ? "Show map search" : "Show on map");
    });
    const query = place.searchQuery || place.address || `${place.name}, ${currentResultsLocation}`;
    const request = prepareMapRequest(`Showing ${place.name}…`, currentResultsLocation || selectedRouteStop || query);
    document.getElementById("mapFrameWrap").scrollIntoView?.({ behavior: "smooth", block: "center" });
    try {
      if (currentResultsArePlanningOnly) {
        const resolvedLabel = await renderGoogleMap(request.canvas, query);
        if (request.requestId !== mapRequestId) return;
        document.getElementById("mapLabelText").textContent = `Map search · ${resolvedLabel}`;
      } else {
        await focusGooglePlaceResult(request.canvas, place);
        if (request.requestId !== mapRequestId) return;
        document.getElementById("mapLabelText").textContent = `Selected · ${place.name}`;
      }
      request.fallback.hidden = true;
      request.canvas.hidden = false;
    } catch (error) {
      console.warn("Selected place could not load in the interactive map; using embedded search.", error);
      showMapFallback(request, query, `Map search · ${place.name}`);
    }
    trackAppEvent("map_place_selected", { category: activeCategory, planning_only: currentResultsArePlanningOnly });
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
  document.getElementById("placeList").addEventListener("click", event => {
    const mapButton = event.target.closest("[data-show-place-index]");
    if (mapButton) return showPlaceOnMap(mapButton.dataset.showPlaceIndex);
    const addButton = event.target.closest("[data-add-place]");
    if (addButton) addPlaceToTrip(addButton.dataset.addPlace, addButton.dataset.placeCategory, addButton.dataset.placeCost, addButton.dataset.placeLocation);
  });

  document.getElementById("communityMapList").addEventListener("click", event => { const button = event.target.closest("[data-map-community]"); if (button) { activeCategory = ""; state.mapQuery = button.dataset.mapCommunity; updateMap(state.mapQuery); } });
  document.getElementById("locateMeButton").addEventListener("click", () => {
    trackAppEvent("location_permission_prompted", { source: "explore" });
    if (!navigator.geolocation) { trackAppEvent("location_permission_result", { source: "explore", result: "unsupported" }); return toast("Location is unavailable in this browser"); }
    navigator.geolocation.getCurrentPosition(position => { activeCategory = ""; trackAppEvent("location_permission_result", { source: "explore", result: "granted" }); updateMap(`${position.coords.latitude.toFixed(5)},${position.coords.longitude.toFixed(5)}`); }, () => { trackAppEvent("location_permission_result", { source: "explore", result: "denied" }); toast("Location permission was not granted"); }, { enableHighAccuracy: true, timeout: 10000 });
  });

  return { renderMap };
}
