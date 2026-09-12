import { state, saveLocalState } from "./state.js?v=29";
import { escapeHTML, toast } from "./ui.js?v=29";
import { scheduleSave } from "./persistence.js?v=29";
import { trackAppEvent } from "../firebase-client.js?v=29";
import { renderGoogleMap } from "../maps.js?v=29";
import { currentDestination, activityCatalog } from "./trip-model.js?v=29";

export function createExplore({ showView, renderHome, renderCommunityMapPicks }) {
  let mapRequestId = 0;

  async function updateMap(query) {
    const normalized = String(query || currentDestination()).trim();
    state.mapQuery = normalized;
    saveLocalState();
    const destination = state.trip?.destination && state.trip.destination !== "Your destination" ? state.trip.destination : "";
    const fullQuery = !destination || normalized.toLowerCase().includes(destination.toLowerCase()) ? normalized : `${normalized} in ${destination}`;
    const requestId = ++mapRequestId;
    const canvas = document.getElementById("mapCanvas");
    const fallback = document.getElementById("mapFallback");

    document.getElementById("mapLabelText").textContent = `Finding ${fullQuery}…`;
    document.getElementById("mapSearchInput").value = normalized;
    renderPlaces(normalized);

    try {
      canvas.hidden = false;
      fallback.hidden = true;
      const resolvedLabel = await renderGoogleMap(canvas, fullQuery);
      if (requestId !== mapRequestId) return;
      document.getElementById("mapLabelText").textContent = resolvedLabel;
    } catch (error) {
      if (requestId !== mapRequestId) return;
      console.warn("Interactive Maps view unavailable; using embedded fallback.", error);
      canvas.hidden = true;
      canvas.replaceChildren();
      fallback.hidden = false;
      fallback.src = `https://www.google.com/maps?q=${encodeURIComponent(fullQuery)}&output=embed`;
      document.getElementById("mapLabelText").textContent = `Showing map results for ${fullQuery}`;
    }
  }

  function renderMap() {
    updateMap(state.mapQuery || currentDestination());
  }

  function renderPlaces(query) {
    const destination = currentDestination();
    const queryText = String(query || "").toLowerCase();
    const ranked = [...activityCatalog].sort((a, b) => Number(`${a.name} ${a.category}`.toLowerCase().includes(queryText)) - Number(`${b.name} ${b.category}`.toLowerCase().includes(queryText))).reverse().slice(0, 4);
    document.getElementById("mapResultCount").textContent = `${ranked.length} ideas`;
    document.getElementById("placeList").innerHTML = ranked.map(place => {
      const destinationQuery = `${place.name}, ${destination}`;
      const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destinationQuery)}`;
      return `<article class="place-card"><span class="place-pin">${place.icon}</span><div><strong>${escapeHTML(place.name)}</strong><p>${escapeHTML(place.category)} · ${place.cost ? `$${place.cost} estimate` : "Free"}</p></div><div class="place-actions"><button class="icon-action" data-add-place="${escapeHTML(place.name)}" data-place-category="${escapeHTML(place.category)}" data-place-cost="${place.cost}" title="Add to trip">＋</button><a class="icon-action" href="${directions}" target="_blank" rel="noopener" title="Directions">↗</a></div></article>`;
    }).join("");
    renderCommunityMapPicks(query);
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
  document.querySelectorAll("[data-map-filter]").forEach(button => button.addEventListener("click", () => { document.querySelectorAll("[data-map-filter]").forEach(item => item.classList.remove("active")); button.classList.add("active"); trackAppEvent("map_search", { method: "category" }); updateMap(button.dataset.mapFilter); }));
  document.getElementById("placeList").addEventListener("click", event => { const button = event.target.closest("[data-add-place]"); if (button) addPlaceToTrip(button.dataset.addPlace, button.dataset.placeCategory, button.dataset.placeCost); });

  document.getElementById("communityMapList").addEventListener("click", event => { const button = event.target.closest("[data-map-community]"); if (button) { state.mapQuery = button.dataset.mapCommunity; updateMap(state.mapQuery); } });
  document.getElementById("locateMeButton").addEventListener("click", () => {
    trackAppEvent("location_permission_prompted", { source: "explore" });
    if (!navigator.geolocation) { trackAppEvent("location_permission_result", { source: "explore", result: "unsupported" }); return toast("Location is unavailable in this browser"); }
    navigator.geolocation.getCurrentPosition(position => { trackAppEvent("location_permission_result", { source: "explore", result: "granted" }); updateMap(`${position.coords.latitude.toFixed(5)},${position.coords.longitude.toFixed(5)}`); }, () => { trackAppEvent("location_permission_result", { source: "explore", result: "denied" }); toast("Location permission was not granted"); }, { enableHighAccuracy: true, timeout: 10000 });
  });

  return { renderMap };
}
