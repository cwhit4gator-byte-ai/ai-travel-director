import { state } from "./state.js?v=46";
import { escapeHTML, safeImageURL, toast } from "./ui.js?v=46";
import { scheduleSave } from "./persistence.js?v=46";
import { trackAppEvent } from "../firebase-client.js?v=46";
import { tripDateForDay, formatTripDate, tripDayNumberForDate, tripOvernightStops } from "./trip-model.js?v=46";
import { nextIncompleteTripStop, currentLocationDirectionsURL, preferredTripTravelMode } from "./directions.js?v=46";
import { loadCachedActivityPhoto } from "./itinerary-photos.js?v=46";

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

export function createToday({ showView, openTripAdjustment }) {
  const dashboard = document.getElementById("todayDashboard");
  const section = document.getElementById("todaySection");
  const statusBadge = document.getElementById("todayStatusBadge");
  let photoSequence = 0;

  async function hydrateNextStopPhoto(next, day) {
    const sequence = ++photoSequence;
    const panel = dashboard.querySelector("[data-today-photo]");
    if (!next || !panel) return;
    const photo = await loadCachedActivityPhoto(next, day);
    if (!photo || sequence !== photoSequence || panel.isConnected === false) return;
    const image = panel.querySelector(".today-next-photo");
    const credit = panel.querySelector(".today-next-photo-credit");
    const photoURL = safeImageURL(photo.photoURL || photo.heroPhotoURL);
    if (!image || !photoURL) return;
    image.onload = () => {
      if (sequence === photoSequence && panel.isConnected !== false) panel.classList.add("has-photo");
    };
    image.onerror = () => {
      panel.classList.remove("has-photo");
      image.hidden = true;
      image.removeAttribute("src");
    };
    image.src = photoURL;
    image.hidden = false;
    const attribution = photo.photoAttribution || {};
    const attributionURL = safeImageURL(attribution.uri || photo.mapsURL);
    if (credit && attribution.displayName) {
      credit.textContent = `Photo: ${attribution.displayName}`;
      if (attributionURL) credit.href = attributionURL;
      else credit.removeAttribute("href");
      credit.hidden = false;
    }
  }

  function renderToday(now = new Date()) {
    if (!state.trip) {
      photoSequence++;
      section.hidden = true;
      dashboard.innerHTML = "";
      return;
    }
    section.hidden = false;
    const context = tripTodayContext(state.trip, localISODate(now));
    if (context.phase === "undated") {
      photoSequence++;
      document.getElementById("todayEyebrow").textContent = "GET TRIP-READY";
      document.getElementById("todayHeading").textContent = "Add your travel dates";
      if (statusBadge) {
        statusBadge.textContent = "SETUP";
        statusBadge.setAttribute("data-phase", "setup");
      }
      dashboard.innerHTML = `<article class="today-setup-card"><span class="today-icon" aria-hidden="true">□</span><div><strong>Turn the itinerary into a dated plan</strong><p>Set the trip start date once. Every day and overnight hotel stop will line up automatically.</p></div><button class="primary-button" type="button" data-today-action="trip">Set trip date</button></article>`;
      return;
    }
    const day = context.day;
    const next = context.next;
    const dayDate = tripDateForDay(day?.day);
    const dateLabel = formatTripDate(dayDate, { weekday: "long", month: "long", day: "numeric" });
    const activities = (day?.items || []).filter(item => item.category !== "Hotel");
    const completed = activities.filter(item => item.done).length;
    const remaining = activities.length - completed;
    const progressPercent = activities.length ? Math.round((completed / activities.length) * 100) : 100;
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
    if (statusBadge) {
      statusBadge.textContent = { upcoming: "UPCOMING", today: "LIVE", ahead: "NEXT DAY", overdue: "RESUME", complete: "COMPLETE" }[context.phase] || "READY";
      statusBadge.setAttribute("data-phase", context.phase);
    }
    const timeline = activities.slice(0, 5).map(item => {
      const progressState = item.done ? "complete" : item === next ? "current" : "upcoming";
      const stateLabel = progressState === "complete" ? "complete" : progressState === "current" ? "next stop" : "upcoming";
      return `<li class="${progressState}" aria-label="${escapeHTML(`${item.time || "Flexible"} ${item.name || "Activity"}, ${stateLabel}`)}"><span aria-hidden="true">${item.done ? "✓" : ""}</span><small>${escapeHTML(item.time || "Flexible")}</small></li>`;
    }).join("");
    const travelMode = preferredTripTravelMode();
    const travelModeLabel = { transit: "Transit", walking: "Walking", driving: "Driving" }[travelMode] || "Directions";
    const directionsURL = next ? currentLocationDirectionsURL(day, next, travelMode) : "";
    dashboard.innerHTML = `<article class="today-card${next ? "" : " is-complete"}">
      <div class="today-next${next ? "" : " is-complete"}"${next ? ' data-today-photo="true"' : ""}>${next ? '<img class="today-next-photo" alt="" loading="lazy" hidden />' : ""}<span class="today-icon" aria-hidden="true">${next ? "↗" : "✓"}</span><div><small>${next ? "NEXT STOP" : "DAY COMPLETE"}</small><h3>${escapeHTML(next?.name || "All scheduled stops are complete")}</h3><p>${next ? `${escapeHTML(next.time || "Flexible")} · ${escapeHTML(next.location || day?.overnightLocation || state.trip.destination)}` : "Your next unfinished day will appear here automatically."}</p>${next ? '<a class="today-next-photo-credit" target="_blank" rel="noopener noreferrer" hidden></a>' : ""}</div></div>
      ${next ? `<div class="today-quick-actions" aria-label="Next stop actions"><a class="today-quick-action directions" href="${escapeHTML(directionsURL)}" target="_blank" rel="noopener" data-today-route="${travelMode}" aria-label="Open ${escapeHTML(travelModeLabel)} directions to ${escapeHTML(next.name)}"><span aria-hidden="true">↗</span><strong>Directions</strong><small>${travelModeLabel}</small></a><button class="today-quick-action complete" type="button" data-today-action="complete" aria-label="Mark ${escapeHTML(next.name)} complete"><span aria-hidden="true">✓</span><strong>Complete</strong><small>Mark done</small></button><button class="today-quick-action change" type="button" data-today-action="change" aria-label="Adjust ${escapeHTML(next.name)}"><span aria-hidden="true">✦</span><strong>Change</strong><small>Adjust plan</small></button></div>` : ""}
      <div class="today-progress" aria-label="${completed} of ${activities.length} scheduled activities complete"><div class="today-progress-copy"><span>Today's progress</span><strong>${activities.length ? `${completed} of ${activities.length} complete` : "No activities scheduled"}</strong></div><div class="today-progress-bar" aria-hidden="true"><span style="width:${progressPercent}%"></span></div>${timeline ? `<ol class="today-mini-timeline">${timeline}</ol>` : ""}</div>
      <div class="today-facts"><div><small>REMAINING</small><strong>${remaining} activit${remaining === 1 ? "y" : "ies"}</strong></div><div><small>TONIGHT</small><strong>${escapeHTML(hotel?.name || (stop ? `Choose a hotel in ${stop.location}` : day?.overnightLocation || "No overnight stop"))}</strong></div></div>
      <div class="today-secondary-actions"><button type="button" data-today-action="trip">Open Day ${day?.day || 1}</button><button type="button" data-today-action="hotels">${hotel ? "View hotel" : "Choose hotel"}</button></div>
    </article>`;
    void hydrateNextStopPhoto(next, day);
  }

  dashboard.addEventListener("click", event => {
    const route = event.target.closest("[data-today-route]");
    if (route) trackAppEvent("today_route_opened", { method: route.dataset.todayRoute });
    const action = event.target.closest("[data-today-action]");
    if (!action) return;
    if (action.dataset.todayAction === "complete") {
      const context = tripTodayContext(state.trip);
      if (!context.next) return;
      const completedStop = context.next;
      completedStop.done = true;
      scheduleSave();
      trackAppEvent("today_stop_completed", { day: Number(context.day?.day || 1), stop_name: completedStop.name || "Activity" });
      renderToday();
      toast(`${completedStop.name || "Activity"} marked complete`);
      return;
    }
    if (action.dataset.todayAction === "change") {
      const context = tripTodayContext(state.trip);
      openTripAdjustment?.(context);
      trackAppEvent("today_change_requested", { day: Number(context.day?.day || 1) });
      return;
    }
    showView(action.dataset.todayAction === "hotels" ? "hotelsView" : "itineraryView");
    if (action.dataset.todayAction === "trip") {
      const context = tripTodayContext(state.trip);
      document.getElementById(`tripDay${context.day?.day || 1}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (!state.trip?.startDate) document.getElementById("tripStartDate")?.focus();
    }
  });

  return { renderToday };
}
