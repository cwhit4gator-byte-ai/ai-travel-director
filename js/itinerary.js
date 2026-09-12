import { state } from "./state.js?v=43";
import { escapeHTML, toast, trackAppError } from "./ui.js?v=43";
import { scheduleSave } from "./persistence.js?v=43";
import { trackAppEvent } from "../firebase-client.js?v=43";
import { tripTotals, findTripItem, refreshTripOvernightLocations, communityTripItems, tripDateForDay, formatTripDate, normalizeISODate } from "./trip-model.js?v=43";
import { dayRouteURL, currentLocationTransitURL, nextIncompleteTripStop, itemDirectionsURL } from "./directions.js?v=43";
import { hydrateItineraryPhotos } from "./itinerary-photos.js?v=43";

export function createItinerary({ showView, renderAll, bindViewLinks, replanCommunityPicks, updateTripHotelDates, renderToday }) {
  function dayShareText(day) {
    const items = (day.items || []).map(item => {
      const location = item.location ? ` · ${item.location}` : "";
      const completed = item.done ? " ✓" : "";
      return `${item.time} — ${item.name}${location}${completed}`;
    });
    const date = tripDateForDay(day.day);
    return [`Day ${day.day}${date ? ` · ${formatTripDate(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}` : ""}: ${day.title}`, ...items, day.overnightLocation ? `Overnight: ${day.overnightLocation}` : "", `Route: ${dayRouteURL(day)}`].filter(Boolean).join("\n");
  }

  async function shareItineraryDay(day) {
    const text = dayShareText(day);
    try {
      if (navigator.share) {
        await navigator.share({ title: `Day ${day.day} · ${state.trip.destination}`, text });
        trackAppEvent("trip_day_shared", { method: "native" });
        return;
      }
      await navigator.clipboard.writeText(text);
      trackAppEvent("trip_day_shared", { method: "clipboard" });
      toast("Day plan copied");
    } catch (error) {
      if (error?.name !== "AbortError") {
        trackAppError("trip_day_share", error);
        toast("Could not share this day");
      }
    }
  }

  function openTripItemDialog(dayNumber, itemId = "") {
    const day = state.trip?.itinerary?.find(item => String(item.day) === String(dayNumber));
    if (!day) return;
    const item = itemId ? day.items.find(entry => entry.id === itemId) : null;
    document.getElementById("tripItemDialogTitle").textContent = item ? "Edit activity" : `Add to day ${day.day}`;
    document.getElementById("tripItemId").value = item?.id || "";
    document.getElementById("tripItemDay").value = day.day;
    document.getElementById("tripItemTime").value = item?.time || "6:00 PM";
    document.getElementById("tripItemCost").value = Number(item?.cost || 0);
    document.getElementById("tripItemName").value = item?.name || "";
    document.getElementById("tripItemLocation").value = item?.location || day.overnightLocation || "";
    document.getElementById("tripItemNote").value = item?.note || "";
    document.getElementById("deleteTripItem").hidden = !item;
    document.getElementById("tripItemDialog").showModal();
    document.getElementById("tripItemName").focus();
  }

  function renderItinerary() {
    const content = document.getElementById("itineraryContent");
    if (!state.trip) {
      content.innerHTML = `<div class="empty-state"><span class="empty-icon">▦</span><h2>No trip yet</h2><p>Use the AI planner to build your first itinerary.</p><button class="primary-button" data-view-link="plannerView">Plan a trip</button></div>`;
      bindViewLinks(content);
      return;
    }
    const totals = tripTotals();
    const budget = Math.max(1, Number(state.trip.budget || 0));
    const budgetPercent = Math.min(100, Math.round((totals.planned / budget) * 100));
    content.innerHTML = `
      <article class="trip-summary-card"><p class="eyebrow light">${state.trip.generatedBy === "openai" ? "AI-GENERATED DRAFT" : "WORKING ITINERARY"}</p><h2>${escapeHTML(state.trip.destination)}</h2><p>${state.trip.days} days · Purchases and live availability are not verified.</p><div class="trip-date-control"><label for="tripStartDate">Trip start date</label><input id="tripStartDate" type="date" data-trip-start-date value="${escapeHTML(state.trip.startDate || "")}" aria-describedby="tripDateHelp"><small id="tripDateHelp">Sets every itinerary date and automatically fills hotel dates for each overnight city.</small></div><div class="trip-stats"><div class="trip-stat"><small>ACTIVITIES</small><strong>${totals.items}</strong></div><div class="trip-stat"><small>EST. PLAN</small><strong>${totals.planned.toLocaleString("en-US")}</strong></div><div class="trip-stat"><small>BUDGET</small><strong>${budget.toLocaleString("en-US")}</strong></div></div><div class="budget-bar" aria-label="${budgetPercent}% of working budget represented by listed activity estimates"><span style="width:${budgetPercent}%"></span></div></article>
      ${communityTripItems().length ? `<aside class="community-replan-card"><div><span class="community-replan-icon" aria-hidden="true">✦</span><p><strong>${communityTripItems().length} community pick${communityTripItems().length === 1 ? "" : "s"} saved</strong><small>Let AI choose the best day and time while keeping your travel preferences.</small></p></div><button class="primary-button compact-button" type="button" data-replan-community ${state.isReplanningCommunity ? "disabled" : ""}>${state.isReplanningCommunity ? "Replanning…" : "Fit with AI"}</button></aside>` : ""}
      <aside class="trip-route-note"><strong>Getting around</strong><span>Check public transit from your current location to the day's next unfinished stop. The highlighted button updates as you mark stops complete. Some routes may not be available by transit, so walking or a taxi may be required. Google Maps may ask for your location or a starting point.</span></aside>
      <div class="day-tabs">${state.trip.itinerary.map(day => { const date = tripDateForDay(day.day); return `<button class="day-tab" data-scroll-day="${day.day}">Day ${day.day}${date ? ` · ${escapeHTML(formatTripDate(date, { month: "short", day: "numeric" }))}` : ""}</button>`; }).join("")}</div>
      ${state.trip.itinerary.map(day => {
        const routeURL = dayRouteURL(day);
        const transitURL = currentLocationTransitURL(day);
        const dayDate = tripDateForDay(day.day);
        const nextStopName = nextIncompleteTripStop(day)?.name || "the next stop";
        const dayCost = (day.items || []).reduce((sum, item) => sum + Number(item.cost || 0), 0);
        const dayCompleted = (day.items || []).filter(item => item.done).length;
        return `<section class="day-card" id="tripDay${day.day}" data-day-number="${day.day}">
          <div class="day-card-heading"><div><p class="eyebrow">DAY ${day.day}${dayDate ? ` · ${escapeHTML(formatTripDate(dayDate))}` : ""}</p><h3>${escapeHTML(day.title)}</h3></div><span class="day-progress">${dayCompleted}/${(day.items || []).length} done</span></div>
          <div class="day-meta"><span>⌖ ${escapeHTML(day.overnightLocation || state.trip.destination)}</span><span>${dayCost.toLocaleString("en-US")} estimated</span></div>
          ${transitURL ? `<a class="day-transit-button" href="${escapeHTML(transitURL)}" target="_blank" rel="noopener" data-trip-route="transit" aria-label="Check transit from my location to ${escapeHTML(nextStopName)}"><span class="day-transit-icon" aria-hidden="true">↗</span><span><strong>Check transit from my location</strong><small>Next stop: ${escapeHTML(nextStopName)}</small></span></a>` : day.items?.length ? '<p class="day-transit-complete" role="status"><span aria-hidden="true">✓</span> All stops complete for this day</p>' : ""}
          ${(day.items || []).map((item, index) => `
            <article class="timeline-item ${item.done ? "done" : ""}" data-item-id="${escapeHTML(item.id)}" data-itinerary-photo="true">
              <img class="timeline-photo" alt="" loading="lazy" hidden />
              <div class="timeline-time">${escapeHTML(item.time)}</div>
              <div class="timeline-main"><strong>${escapeHTML(item.name)}</strong>${item.communityPostId ? '<span class="community-source">Community pick</span>' : ""}${item.location ? `<span class="timeline-location">⌖ ${escapeHTML(item.location)}</span>` : ""}<p>${escapeHTML(item.note || item.category || "Flexible plan item")}</p><a class="timeline-photo-credit" target="_blank" rel="noopener noreferrer" hidden></a></div>
              <div class="timeline-actions"><button class="mini-button activity-action" data-trip-action="toggle" aria-label="${item.done ? "Mark incomplete" : "Mark complete"}"><span aria-hidden="true">✓</span><span>${item.done ? "Undo" : "Complete"}</span></button><a class="mini-button activity-action" href="${escapeHTML(itemDirectionsURL(day, index))}" target="_blank" rel="noopener" data-trip-route="item" aria-label="Directions ${index ? "from the previous stop" : "to this stop"}"><span aria-hidden="true">↗</span><span>Directions</span></a><button class="mini-button activity-action" data-trip-action="edit" aria-label="Edit ${escapeHTML(item.name)}"><span aria-hidden="true">✎</span><span>Edit</span></button>${index > 0 ? '<button class="mini-button activity-action" data-trip-action="up" aria-label="Move activity earlier"><span aria-hidden="true">↑</span><span>Earlier</span></button>' : ""}</div>
            </article>
          `).join("")}
          <div class="day-tools"><button class="secondary-button" type="button" data-day-action="add" data-day-number="${day.day}">＋ Add activity</button>${routeURL ? `<a class="secondary-button" href="${escapeHTML(routeURL)}" target="_blank" rel="noopener" data-trip-route="day">Open day route</a>` : ""}<button class="secondary-button" type="button" data-day-action="share" data-day-number="${day.day}">Share day</button></div>
        </section>`;
      }).join("")}
    `;
    void hydrateItineraryPhotos(content);
  }

  document.getElementById("itineraryContent").addEventListener("click", event => {
    const routeLink = event.target.closest("[data-trip-route]");
    if (routeLink) trackAppEvent("trip_route_opened", { source: routeLink.dataset.tripRoute });
    const replanButton = event.target.closest("[data-replan-community]");
    if (replanButton) {
      replanCommunityPicks();
      return;
    }
    const dayButton = event.target.closest("[data-scroll-day]");
    if (dayButton) document.getElementById(`tripDay${dayButton.dataset.scrollDay}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    const dayAction = event.target.closest("[data-day-action]");
    if (dayAction) {
      const day = state.trip?.itinerary?.find(item => String(item.day) === String(dayAction.dataset.dayNumber));
      if (!day) return;
      if (dayAction.dataset.dayAction === "add") openTripItemDialog(day.day);
      if (dayAction.dataset.dayAction === "share") shareItineraryDay(day);
      return;
    }
    const action = event.target.closest("[data-trip-action]");
    if (!action) return;
    const row = action.closest("[data-item-id]");
    const found = findTripItem(row.dataset.itemId);
    if (!found) return;
    if (action.dataset.tripAction === "toggle") found.item.done = !found.item.done;
    if (action.dataset.tripAction === "edit") {
      openTripItemDialog(found.day.day, found.item.id);
      return;
    }
    if (action.dataset.tripAction === "up" && found.index > 0) {
      [found.day.items[found.index - 1], found.day.items[found.index]] = [found.day.items[found.index], found.day.items[found.index - 1]];
      refreshTripOvernightLocations(found.day);
    }
    if (action.dataset.tripAction === "map") { state.mapQuery = `${found.item.name} in ${state.trip.destination}`; showView("exploreView"); return; }
    scheduleSave();
    renderItinerary();
    renderToday();
  });

  document.getElementById("itineraryContent").addEventListener("change", event => {
    if (!event.target.matches("[data-trip-start-date]") || !state.trip) return;
    state.trip.startDate = normalizeISODate(event.target.value);
    updateTripHotelDates();
    scheduleSave();
    trackAppEvent("trip_dates_updated", { status: state.trip.startDate ? "set" : "cleared" });
    renderAll();
    toast(state.trip.startDate ? "Trip dates and automatic hotel dates updated" : "Trip dates cleared");
  });

  const tripItemDialog = document.getElementById("tripItemDialog");
  document.getElementById("closeTripItemDialog").addEventListener("click", () => tripItemDialog.close());
  tripItemDialog.addEventListener("click", event => { if (event.target === tripItemDialog) tripItemDialog.close(); });
  document.getElementById("tripItemForm").addEventListener("submit", event => {
    event.preventDefault();
    const day = state.trip?.itinerary?.find(item => String(item.day) === String(document.getElementById("tripItemDay").value));
    if (!day) return;
    const itemId = document.getElementById("tripItemId").value;
    const values = {
      time: document.getElementById("tripItemTime").value.trim(),
      name: document.getElementById("tripItemName").value.trim(),
      location: document.getElementById("tripItemLocation").value.trim(),
      note: document.getElementById("tripItemNote").value.trim(),
      cost: Math.max(0, Number(document.getElementById("tripItemCost").value) || 0)
    };
    if (!values.name || !values.time) return;
    const existing = itemId ? day.items.find(item => item.id === itemId) : null;
    if (existing) Object.assign(existing, values);
    else day.items.push({ id: crypto.randomUUID(), category: "Custom", done: false, ...values });
    refreshTripOvernightLocations(day);
    scheduleSave();
    renderAll();
    tripItemDialog.close();
    trackAppEvent(existing ? "trip_activity_edited" : "trip_activity_added", { source: "itinerary" });
    toast(existing ? "Activity updated" : `Added to day ${day.day}`);
  });
  document.getElementById("deleteTripItem").addEventListener("click", () => {
    const day = state.trip?.itinerary?.find(item => String(item.day) === String(document.getElementById("tripItemDay").value));
    const itemId = document.getElementById("tripItemId").value;
    const item = day?.items?.find(entry => entry.id === itemId);
    if (!day || !item || !window.confirm(`Remove “${item.name}” from day ${day.day}?`)) return;
    day.items = day.items.filter(entry => entry.id !== itemId);
    refreshTripOvernightLocations(day);
    scheduleSave();
    renderAll();
    tripItemDialog.close();
    trackAppEvent("trip_activity_removed", { source: "itinerary" });
    toast("Activity removed");
  });

  document.getElementById("clearTripButton").addEventListener("click", () => { state.trip = null; state.selectedOvernightLocation = ""; state.hotelStay.checkIn = ""; state.hotelStay.checkOut = ""; scheduleSave(); renderAll(); toast("Trip cleared"); });

  return { renderItinerary };
}
