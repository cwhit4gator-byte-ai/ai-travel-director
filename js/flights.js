import { state } from "./state.js?v=49";
import { escapeHTML, toast } from "./ui.js?v=49";
import { addDaysToISODate, normalizeISODate, tripRouteStops } from "./trip-model.js?v=49";
import { scheduleSave } from "./persistence.js?v=49";
import { trackAppEvent } from "../firebase-client.js?v=49";

const clean = value => String(value || "").trim();

export function tripFlightRoute(trip = state.trip) {
  const stops = tripRouteStops(trip);
  const arrivalDestination = clean(stops[0] || trip?.destination);
  const departureDestination = clean(stops.at(-1) || arrivalDestination);
  const arrivalDate = normalizeISODate(trip?.startDate);
  const departureDate = arrivalDate ? addDaysToISODate(arrivalDate, Math.max(0, Number(trip?.days || trip?.itinerary?.length || 1) - 1)) : "";
  return { arrivalDestination, departureDestination, arrivalDate, departureDate };
}

export function reconcileFlightSearch(trip = state.trip, search = state.flightSearch) {
  if (!trip) return search;
  const route = tripFlightRoute(trip);
  const tripKey = [route.arrivalDestination, route.departureDestination, route.arrivalDate, route.departureDate].join("|").toLocaleLowerCase();
  if (search.tripKey !== tripKey) {
    Object.assign(search, route, { tripKey });
  }
  return search;
}

function googleFlightsURL({ homeAirport, arrivalDestination, departureDestination, arrivalDate, departureDate, cabin = "economy" }, leg = "multi") {
  cabin = clean(cabin).replaceAll("_", " ");
  let query;
  if (leg === "arrival") query = `${cabin} flights from ${homeAirport} to ${arrivalDestination} on ${arrivalDate}`;
  else if (leg === "home") query = `${cabin} flights from ${departureDestination} to ${homeAirport} on ${departureDate}`;
  else query = `${cabin} flights from ${homeAirport} to ${arrivalDestination} on ${arrivalDate}, then from ${departureDestination} to ${homeAirport} on ${departureDate}`;
  const url = new URL("https://www.google.com/travel/flights");
  url.searchParams.set("q", query);
  url.searchParams.set("curr", "USD");
  return url.toString();
}

function kayakLocation(value) {
  return encodeURIComponent(clean(value).replaceAll("/", " "));
}

export function flightSearchLinks(search = state.flightSearch) {
  const values = {
    homeAirport: clean(search.homeAirport),
    arrivalDestination: clean(search.arrivalDestination),
    departureDestination: clean(search.departureDestination),
    arrivalDate: normalizeISODate(search.arrivalDate),
    departureDate: normalizeISODate(search.departureDate),
    cabin: clean(search.cabin || "economy")
  };
  const ready = [values.homeAirport, values.arrivalDestination, values.departureDestination, values.arrivalDate, values.departureDate].every(Boolean) && values.departureDate >= values.arrivalDate;
  if (!ready) return null;
  const travelers = Math.max(1, Math.min(9, Number(search.adults || 1)));
  const kayak = new URL(`https://www.kayak.com/flights/${kayakLocation(values.homeAirport)}-${kayakLocation(values.arrivalDestination)}/${values.arrivalDate}/${kayakLocation(values.departureDestination)}-${kayakLocation(values.homeAirport)}/${values.departureDate}`);
  kayak.searchParams.set("sort", "bestflight_a");
  kayak.searchParams.set("fs", `adults=${travelers}`);
  return {
    google: googleFlightsURL(values),
    kayak: kayak.toString(),
    arrival: googleFlightsURL(values, "arrival"),
    home: googleFlightsURL(values, "home")
  };
}

export function createFlights({ bindViewLinks, renderAll }) {
  function renderFlights() {
    const content = document.getElementById("flightSearchContent");
    if (!content) return;
    if (!state.trip) {
      document.getElementById("flightRouteTitle").textContent = "Plan a trip to build your flight route";
      document.getElementById("flightRouteSummary").textContent = "The app will use the first and final destinations from your itinerary.";
      content.innerHTML = `<div class="empty-state"><span class="empty-icon">↗</span><h2>No route yet</h2><p>Create an itinerary first. Flights will then use its first city for arrival and its final city for departure.</p><button class="primary-button" type="button" data-view-link="plannerView">Plan a trip</button></div>`;
      bindViewLinks(content);
      return;
    }

    const search = reconcileFlightSearch();
    const links = flightSearchLinks(search);
    const routeTitle = `Fly into ${search.arrivalDestination} · home from ${search.departureDestination}`;
    document.getElementById("flightRouteTitle").textContent = routeTitle;
    document.getElementById("flightRouteSummary").textContent = search.arrivalDestination === search.departureDestination
      ? "Your trip starts and ends in the same place. You can edit either airport below."
      : "This open-jaw route follows your itinerary and avoids backtracking to the first city.";

    const dateNotice = !search.arrivalDate || !search.departureDate
      ? `<aside class="flight-date-notice"><span aria-hidden="true">□</span><div><strong>Add trip dates first</strong><p>Your arrival and flight-home dates will fill automatically.</p></div><button type="button" data-view-link="itineraryView">Set dates</button></aside>`
      : "";
    const providerLinks = links
      ? `<div class="flight-provider-actions"><a class="primary-button" href="${escapeHTML(links.google)}" target="_blank" rel="noopener noreferrer" data-flight-provider="Google Flights">Compare the complete route</a><a class="secondary-button" href="${escapeHTML(links.kayak)}" target="_blank" rel="noopener noreferrer" data-flight-provider="KAYAK">Compare on KAYAK</a></div><div class="flight-leg-links"><a href="${escapeHTML(links.arrival)}" target="_blank" rel="noopener noreferrer" data-flight-provider="Google Flights inbound">Search arrival flight only</a><a href="${escapeHTML(links.home)}" target="_blank" rel="noopener noreferrer" data-flight-provider="Google Flights home">Search flight home only</a></div>`
      : `<div class="flight-action-prompt"><strong>Enter your home airport and trip dates</strong><span>Then you can compare both flights together or search either leg separately.</span></div>`;

    content.innerHTML = `${dateNotice}<form id="flightSearchForm" class="flight-search-form">
      <div class="flight-route-map" aria-label="Two-part flight route">
        <article class="flight-leg"><span class="flight-leg-number">1</span><div><small>ARRIVAL FLIGHT</small><strong>${escapeHTML(search.homeAirport || "Your home airport")} <b aria-hidden="true">→</b> ${escapeHTML(search.arrivalDestination)}</strong><em>${escapeHTML(search.arrivalDate || "Add trip start date")}</em></div></article>
        <article class="flight-leg"><span class="flight-leg-number">2</span><div><small>FLIGHT HOME</small><strong>${escapeHTML(search.departureDestination)} <b aria-hidden="true">→</b> ${escapeHTML(search.homeAirport || "Your home airport")}</strong><em>${escapeHTML(search.departureDate || "Add final trip date")}</em></div></article>
      </div>
      <div class="flight-fields">
        <label><span>Home airport or city</span><input type="text" data-flight-field="homeAirport" value="${escapeHTML(search.homeAirport)}" placeholder="Example: MCO or Orlando" autocomplete="off" required></label>
        <label><span>Arrive in</span><input type="text" data-flight-field="arrivalDestination" value="${escapeHTML(search.arrivalDestination)}" autocomplete="off" required></label>
        <label><span>Arrival date</span><input type="date" data-flight-field="arrivalDate" value="${escapeHTML(search.arrivalDate)}" required></label>
        <label><span>Depart from</span><input type="text" data-flight-field="departureDestination" value="${escapeHTML(search.departureDestination)}" autocomplete="off" required></label>
        <label><span>Flight-home date</span><input type="date" data-flight-field="departureDate" value="${escapeHTML(search.departureDate)}" min="${escapeHTML(search.arrivalDate)}" required></label>
        <label><span>Travelers</span><select data-flight-field="adults">${[1,2,3,4,5,6,7,8,9].map(number => `<option value="${number}"${Number(search.adults) === number ? " selected" : ""}>${number}</option>`).join("")}</select></label>
        <label><span>Cabin</span><select data-flight-field="cabin"><option value="economy"${search.cabin === "economy" ? " selected" : ""}>Economy</option><option value="premium_economy"${search.cabin === "premium_economy" ? " selected" : ""}>Premium economy</option><option value="business"${search.cabin === "business" ? " selected" : ""}>Business</option><option value="first"${search.cabin === "first" ? " selected" : ""}>First</option></select></label>
      </div>
      ${providerLinks}
      <p class="flight-approval-note"><span aria-hidden="true">✓</span> Nothing is booked automatically. Review the itinerary, baggage rules, total price, and refund terms before approving payment with the provider.</p>
    </form>`;
    bindViewLinks(content);
  }

  document.getElementById("flightSearchContent").addEventListener("change", event => {
    const field = event.target.dataset.flightField;
    if (!field) return;
    state.flightSearch[field] = field === "adults" ? Math.max(1, Number(event.target.value) || 1) : event.target.value;
    if (field === "arrivalDate" && state.flightSearch.departureDate < state.flightSearch.arrivalDate) state.flightSearch.departureDate = state.flightSearch.arrivalDate;
    scheduleSave();
    renderAll();
    toast("Flight search updated");
  });

  document.getElementById("flightSearchContent").addEventListener("click", event => {
    const provider = event.target.closest("[data-flight-provider]");
    if (!provider) return;
    trackAppEvent("flight_booking_link_opened", {
      provider: provider.dataset.flightProvider,
      route_type: state.flightSearch.arrivalDestination === state.flightSearch.departureDestination ? "round_trip" : "open_jaw",
      travelers: Math.max(1, Number(state.flightSearch.adults || 1)),
      cabin: state.flightSearch.cabin || "economy"
    });
  });

  return { renderFlights };
}
