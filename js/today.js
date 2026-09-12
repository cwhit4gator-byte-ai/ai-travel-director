import { state } from "./state.js?v=29";
import { escapeHTML } from "./ui.js?v=29";
import { trackAppEvent } from "../firebase-client.js?v=29";
import { tripDateForDay, formatTripDate, tripDayNumberForDate, tripOvernightStops } from "./trip-model.js?v=29";
import { nextIncompleteTripStop, currentLocationDirectionsURL } from "./directions.js?v=29";

export function localISODate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function tripTodayContext(trip, today = localISODate()) {
  const itinerary = Array.isArray(trip?.itinerary) ? trip.itinerary : [];
  if (!trip?.startDate || !itinerary.length) return { phase: "undated", day: itinerary[0] || null, next: itinerary[0] ? nextIncompleteTripStop(itinerary[0]) : null };
  const currentNumber = tripDayNumberForDate(today, trip);
  let day = currentNumber >= 1 && currentNumber <= itinerary.length ? itinerary.find(item => Number(item.day) === currentNumber) || itinerary[currentNumber - 1] : null;
  const pendingDays = itinerary.filter(item => nextIncompleteTripStop(item));
  if (currentNumber < 1) day = itinerary[0];
  if (!day || !nextIncompleteTripStop(day)) {
    day = pendingDays.find(item => Number(item.day) >= Math.max(1, currentNumber || 1)) || day || pendingDays[0] || itinerary.at(-1);
  }
  return {
    phase: currentNumber < 1 ? "upcoming" : currentNumber > itinerary.length ? (pendingDays.length ? "overdue" : "complete") : (Number(day?.day) === currentNumber ? "today" : "ahead"),
    currentNumber,
    day,
    next: day ? nextIncompleteTripStop(day) : null
  };
}

export function createToday({ showView }) {
  const dashboard = document.getElementById("todayDashboard");
  const section = document.getElementById("todaySection");

  function renderToday(now = new Date()) {
    if (!state.trip) {
      section.hidden = true;
      dashboard.innerHTML = "";
      return;
    }
    section.hidden = false;
    const context = tripTodayContext(state.trip, localISODate(now));
    if (context.phase === "undated") {
      document.getElementById("todayEyebrow").textContent = "GET TRIP-READY";
      document.getElementById("todayHeading").textContent = "Add your travel dates";
      dashboard.innerHTML = `<article class="today-setup-card"><span class="today-icon" aria-hidden="true">□</span><div><strong>Turn the itinerary into a dated plan</strong><p>Set the trip start date once. Every day and overnight hotel stop will line up automatically.</p></div><button class="primary-button" type="button" data-today-action="trip">Set trip date</button></article>`;
      return;
    }
    const day = context.day;
    const next = context.next;
    const dayDate = tripDateForDay(day?.day);
    const dateLabel = formatTripDate(dayDate, { weekday: "long", month: "long", day: "numeric" });
    const remaining = (day?.items || []).filter(item => !item.done && item.category !== "Hotel").length;
    const stop = tripOvernightStops().find(item => item.days.includes(Number(day?.day)));
    const hotel = stop ? state.trip.hotelSelections?.[stop.id] : null;
    const phaseCopy = {
      upcoming: [`UP NEXT · ${dateLabel}`, `Day ${day.day} is ready`],
      today: [`TODAY · ${dateLabel}`, `Day ${day.day} at a glance`],
      ahead: [`NEXT DAY · ${dateLabel}`, `Day ${day.day} is next`],
      overdue: [`CONTINUE YOUR TRIP`, `Resume Day ${day.day}`],
      complete: [`TRIP COMPLETE`, `Your itinerary is complete`]
    }[context.phase];
    document.getElementById("todayEyebrow").textContent = phaseCopy[0];
    document.getElementById("todayHeading").textContent = phaseCopy[1];
    const routeLinks = next ? [
      ["Transit", "transit", "primary-button"],
      ["Walk", "walking", "today-route-button"],
      ["Drive", "driving", "today-route-button"]
    ].map(([label, mode, className]) => `<a class="${className}" href="${escapeHTML(currentLocationDirectionsURL(day, next, mode))}" target="_blank" rel="noopener" data-today-route="${mode}">${label}</a>`).join("") : "";
    dashboard.innerHTML = `<article class="today-card">
      <div class="today-next"><span class="today-icon" aria-hidden="true">${next ? "↗" : "✓"}</span><div><small>${next ? "NEXT STOP" : "DAY COMPLETE"}</small><h3>${escapeHTML(next?.name || "All scheduled stops are complete")}</h3><p>${next ? `${escapeHTML(next.time || "Flexible")} · ${escapeHTML(next.location || day?.overnightLocation || state.trip.destination)}` : "Your next unfinished day will appear here automatically."}</p></div></div>
      <div class="today-facts"><div><small>REMAINING</small><strong>${remaining} activit${remaining === 1 ? "y" : "ies"}</strong></div><div><small>TONIGHT</small><strong>${escapeHTML(hotel?.name || (stop ? `Choose a hotel in ${stop.location}` : day?.overnightLocation || "No overnight stop"))}</strong></div></div>
      ${routeLinks ? `<div class="today-route-actions" aria-label="Directions from your current location">${routeLinks}</div>` : ""}
      <div class="today-secondary-actions"><button type="button" data-today-action="trip">Open Day ${day?.day || 1}</button><button type="button" data-today-action="hotels">${hotel ? "View hotel" : "Choose hotel"}</button></div>
    </article>`;
  }

  dashboard.addEventListener("click", event => {
    const route = event.target.closest("[data-today-route]");
    if (route) trackAppEvent("today_route_opened", { method: route.dataset.todayRoute });
    const action = event.target.closest("[data-today-action]");
    if (!action) return;
    showView(action.dataset.todayAction === "hotels" ? "hotelsView" : "itineraryView");
    if (action.dataset.todayAction === "trip") {
      const context = tripTodayContext(state.trip);
      document.getElementById(`tripDay${context.day?.day || 1}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (!state.trip?.startDate) document.getElementById("tripStartDate")?.focus();
    }
  });

  return { renderToday };
}
