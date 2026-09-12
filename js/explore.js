import { state, saveLocalState } from "./state.js?v=31";
import { escapeHTML, toast } from "./ui.js?v=31";
import { scheduleSave } from "./persistence.js?v=31";
import { trackAppEvent } from "../firebase-client.js?v=31";
import { renderGoogleMap, renderGoogleRouteMap } from "../maps.js?v=31";
import { currentDestination, activityCatalog, tripRouteStops } from "./trip-model.js?v=31";

export function createExplore({ showView, renderHome, renderCommunityMapPicks }) {
  let mapRequestId = 0;
  let selectedRouteStop = "";

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
    renderPlaces("", stops[0]);
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

  async function updateMap(query, { inputValue = query, placeQuery = query } = {}) {
    const normalized = String(query || currentDestination()).trim();
    const routeStops = currentRouteStops();
    selectedRouteStop = routeStops.find(location => location.toLocaleLowerCase() === normalized.toLocaleLowerCase()) || "";
    state.mapQuery = normalized;
    saveLocalState();
    const destination = state.trip?.destination && state.trip.destination !== "Your destination" ? state.trip.destination : "";
    const destinationContext = routeStops.length > 1 ? "" : destination;
    const fullQuery = !destinationContext || normalized.toLowerCase().includes(destinationContext.toLowerCase()) ? normalized : `${normalized} in ${destinationContext}`;
    renderRouteStopPicker(routeStops);
    renderPlaces(placeQuery, selectedRouteStop || normalized);
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

  function renderPlaces(query, mapLocation = "") {
    const destination = String(mapLocation || currentDestination()).trim();
    const queryText = String(query || "").toLowerCase();
    const ranked = [...activityCatalog].sort((a, b) => Number(`${a.name} ${a.category}`.toLowerCase().includes(queryText)) - Number(`${b.name} ${b.category}`.toLowerCase().includes(queryText))).reverse().slice(0, 4);
    document.getElementById("mapResultCount").textContent = `${ranked.length} ideas`;
    document.getElementById("placeList").innerHTML = ranked.map(place => {
      const destinationQuery = `${place.name}, ${destination}`;
      const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destinationQuery)}`;
      return `<article class="place-card"><span class="place-pin">${place.icon}</span><div><strong>${escapeHTML(place.name)}</strong><p>${escapeHTML(place.category)} · ${place.cost ? `$${place.cost} estimate` : "Free"}</p></div><div class="place-actions"><button class="icon-action" data-add-place="${escapeHTML(place.name)}" data-place-category="${escapeHTML(place.category)}" data-place-cost="${place.cost}" title="Add to trip">＋</button><a class="icon-action" href="${directions}" target="_blank" rel="noopener" title="Directions">↗</a></div></article>`;
    }).join("");
    renderCommunityMapPicks(destination);
  }

  function addPlaceToTrip(name, category, cost) {
    if (!state.trip) {
      toast("Plan a destination before adding places");
      showView("plannerView");
      return;
    }
    const day = state.trip.itinerary[0];
    day.items.push({ id: crypto.randomUUID(), time: "Flexible", name, category, cost: Number(cost || 0), note: "Saved from Explore. Confirm hours and availability before visiting.", done: false });
    scheduleSave();
    renderHome();
    toast("Added to your trip");
  }

  document.getElementById("mapSearchForm").addEventListener("submit", event => { event.preventDefault(); const query = document.getElementById("mapSearchInput").value.trim(); if (query) { trackAppEvent("map_search", { method: "typed" }); updateMap(query); } });
  document.querySelectorAll("[data-map-filter]").forEach(button => button.addEventListener("click", () => { document.querySelectorAll("[data-map-filter]").forEach(item => item.classList.remove("active")); button.classList.add("active"); trackAppEvent("map_search", { method: "category" }); const focus = selectedRouteStop || currentRouteStops()[0] || currentDestination(); updateMap(focus, { inputValue: focus, placeQuery: button.dataset.mapFilter }); }));
  document.getElementById("routeStopList").addEventListener("click", event => {
    const button = event.target.closest("[data-route-stop-index]");
    if (!button) return;
    const stops = currentRouteStops();
    const index = Number(button.dataset.routeStopIndex);
    trackAppEvent("map_search", { method: index < 0 ? "route" : "route_stop" });
    if (index < 0) updateRouteMap(stops);
    else if (stops[index]) updateMap(stops[index]);
  });
  document.getElementById("placeList").addEventListener("click", event => { const button = event.target.closest("[data-add-place]"); if (button) addPlaceToTrip(button.dataset.addPlace, button.dataset.placeCategory, button.dataset.placeCost); });

  document.getElementById("communityMapList").addEventListener("click", event => { const button = event.target.closest("[data-map-community]"); if (button) { state.mapQuery = button.dataset.mapCommunity; updateMap(state.mapQuery); } });
  document.getElementById("locateMeButton").addEventListener("click", () => {
    trackAppEvent("location_permission_prompted", { source: "explore" });
    if (!navigator.geolocation) { trackAppEvent("location_permission_result", { source: "explore", result: "unsupported" }); return toast("Location is unavailable in this browser"); }
    navigator.geolocation.getCurrentPosition(position => { trackAppEvent("location_permission_result", { source: "explore", result: "granted" }); updateMap(`${position.coords.latitude.toFixed(5)},${position.coords.longitude.toFixed(5)}`); }, () => { trackAppEvent("location_permission_result", { source: "explore", result: "denied" }); toast("Location permission was not granted"); }, { enableHighAccuracy: true, timeout: 10000 });
  });

  return { renderMap };
}
