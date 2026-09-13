import { state, saveLocalState } from "./state.js?v=49";
import { escapeHTML, normalizeInterests, toast } from "./ui.js?v=49";
import { tripDateForDay, formatTripDate, tripOvernightStops, tripRouteStops } from "./trip-model.js?v=49";
import { trackAppEvent } from "../firebase-client.js?v=49";

let recommendationRotation = 0;

export function renderHome() {
  const hero = document.getElementById("tripHero");
  const heroEyebrow = document.getElementById("tripHeroEyebrow");
  const title = document.getElementById("homeHeading");
  const summary = document.getElementById("tripSummary");
  const metric = document.getElementById("homeTripMetric");
  const toolsHeading = document.getElementById("homeToolsHeading");
  const flightsMetric = document.getElementById("homeFlightsMetric");
  const collectionsMetric = document.getElementById("homeCollectionsMetric");
  const savedCount = state.collections.reduce((total, collection) => total + (collection.items || []).length, 0);
  if (collectionsMetric) collectionsMetric.textContent = savedCount ? `${savedCount} saved place${savedCount === 1 ? "" : "s"}` : "Nothing saved yet";
  if (state.trip) {
    hero?.classList.add("has-active-trip");
    if (heroEyebrow) heroEyebrow.textContent = "TRIP COMMAND CENTER";
    const firstDate = tripDateForDay(1);
    const lastDate = tripDateForDay(state.trip.days);
    const dateSummary = firstDate ? `${formatTripDate(firstDate, { month: "short", day: "numeric" })}–${formatTripDate(lastDate, { month: "short", day: "numeric", year: "numeric" })} · ` : "";
    title.textContent = state.trip.destination;
    summary.textContent = `${dateSummary}${state.trip.days}-day working itinerary · $${Number(state.trip.budget || 0).toLocaleString("en-US")} budget · no bookings made`;
    metric.textContent = `${state.trip.days} days in ${state.trip.destination}`;
    const flightStops = tripRouteStops();
    if (flightsMetric) flightsMetric.textContent = flightStops.length > 1 ? `${flightStops[0]} in · ${flightStops.at(-1)} home` : `Flights for ${flightStops[0] || state.trip.destination}`;
    if (toolsHeading) toolsHeading.textContent = "More for your trip";
    document.getElementById("startPlanningButton").textContent = "Ask AI about this trip";
  } else {
    hero?.classList.remove("has-active-trip");
    if (heroEyebrow) heroEyebrow.textContent = "START A NEW JOURNEY";
    title.textContent = "Where should we go next?";
    summary.textContent = "Describe the trip you want. Your AI director will shape the route around your budget, pace, history, and architecture interests.";
    metric.textContent = "No active trip";
    if (flightsMetric) flightsMetric.textContent = "Plan arrival and flight home";
    if (toolsHeading) toolsHeading.textContent = "Start exploring";
    document.getElementById("startPlanningButton").textContent = "Plan with AI";
  }
}

export function renderRecommendations() {
  const interests = normalizeInterests(state.profile.interests).split(",").map(item => item.trim()).filter(Boolean);
  const selectedInterest = interests[recommendationRotation % Math.max(1, interests.length)] || "local culture";
  const summary = document.getElementById("recommendationSummary");
  const list = document.getElementById("recommendationList");

  if (!state.trip) {
    if (summary) summary.textContent = "Start with your preferences, then turn inspiration into a plan.";
    list.innerHTML = recommendationMarkup({
      status: "BEST NEXT STEP",
      title: "Build a trip around what you enjoy",
      text: `Your ${state.profile.pace} pace, ${state.profile.walking}-minute walking preference, and interest in ${selectedInterest} are ready to guide the AI.`,
      action: "Plan with AI",
      view: "plannerView",
      prompt: `Plan a trip around ${selectedInterest} with a ${state.profile.pace} pace, public transportation, and walking segments near ${state.profile.walking} minutes.`,
      progressLabel: "Preferences ready",
      progress: 34,
      steps: [{ label: "Preferences", ready: true }, { label: "Destination", ready: false }, { label: "Trip plan", ready: false }],
      secondary: [
        { icon: "⌖", label: "DISCOVER", title: `Explore ${selectedInterest} ideas`, text: "Open the map and see places that fit your interests.", action: "Explore places", view: "exploreView", query: selectedInterest },
        { icon: "◎", label: "YOUR STYLE", title: "Review travel preferences", text: `Keep recommendations aligned with your pace, budget, and ${state.profile.walking}-minute walking limit.`, action: "Open profile", view: "profileView" }
      ]
    });
    return;
  }

  const itinerary = state.trip.itinerary || [];
  const activities = itinerary.flatMap(day => (day.items || []).filter(item => item.category !== "Hotel"));
  const pendingEntry = itinerary.map(day => ({ day, item: (day.items || []).find(item => item.category !== "Hotel" && !item.done) })).find(entry => entry.item);
  const stops = tripOvernightStops();
  const flightStops = tripRouteStops();
  const missingHotel = stops.find(stop => !state.trip.hotelSelections?.[stop.id]);
  const flightsReady = Boolean(state.trip.startDate && state.flightSearch.homeAirport && flightStops.length);
  const readinessSteps = [
    { label: "Dates", ready: Boolean(state.trip.startDate) },
    { label: "Flights", ready: flightsReady },
    { label: "Stays", ready: stops.length === 0 || !missingHotel },
    { label: "Route", ready: activities.length > 0 }
  ];
  const readyCount = readinessSteps.filter(step => step.ready).length;
  const location = pendingEntry?.day?.overnightLocation || pendingEntry?.item?.location || stops[0]?.location || state.trip.destination;
  let lead;
  if (!state.trip.startDate) {
    lead = { status: "TRIP SETUP", title: "Add your travel dates", text: "Set the start date once to align every itinerary day and hotel stay automatically.", action: "Set trip dates", view: "itineraryView", focus: "tripStartDate" };
  } else if (!flightsReady) {
    const firstStop = flightStops[0] || state.trip.destination;
    const finalStop = flightStops.at(-1) || firstStop;
    lead = { status: "FLIGHT SETUP", title: `Fly into ${firstStop} and home from ${finalStop}`, text: "Add your home airport to compare the complete route without backtracking to the first city.", action: "Set up flights", view: "flightsView" };
  } else if (missingHotel) {
    lead = { status: "NEEDS ATTENTION", title: `Choose your stay in ${missingHotel.location}`, text: "Compare three real properties and keep this overnight stop connected to the itinerary.", action: "Compare hotels", view: "hotelsView", hotelStop: missingHotel.id };
  } else if (!activities.length) {
    lead = { status: "BUILD YOUR DAYS", title: "Fill in your itinerary", text: `Ask the AI to add useful activities across ${state.trip.destination}, matched to your interests and pace.`, action: "Build with AI", view: "plannerView", prompt: `Add a complete day-by-day itinerary to my ${state.trip.destination} trip. Prioritize ${selectedInterest}, public transportation, and walking segments near ${state.profile.walking} minutes.` };
  } else if (activities.every(item => item.done)) {
    lead = { status: "TRIP COMPLETE", title: "Capture what you discovered", text: "Share a useful place or lesson with other travelers, or start shaping your next trip.", action: "Share an insight", view: "communityView" };
  } else {
    lead = { status: "TRIP READY", title: `Review Day ${pendingEntry?.day?.day || 1}`, text: `${pendingEntry?.item?.name || "Your next activity"} is the next unfinished stop. Review the full day before you go.`, action: `Open Day ${pendingEntry?.day?.day || 1}`, view: "itineraryView", focus: `tripDay${pendingEntry?.day?.day || 1}` };
  }

  if (summary) summary.textContent = `${readyCount} of ${readinessSteps.length} trip essentials ready · suggestions update with your plan.`;
  const prompt = `Make this trip easier with public transit and walks near ${state.profile.walking} minutes.`;
  list.innerHTML = recommendationMarkup({
    ...lead,
    progressLabel: `${readyCount} of ${readinessSteps.length} ready`,
    progress: Math.round((readyCount / readinessSteps.length) * 100),
    steps: readinessSteps,
    secondary: [
      { icon: "⌖", label: "NEAR YOUR ROUTE", title: `Explore around ${location}`, text: `Find ${selectedInterest} close to your planned stops.`, action: "Open map", view: "exploreView", query: `${selectedInterest} near ${location}` },
      { icon: "✦", label: "AI CHECK", title: "Fine-tune the whole trip", text: `Keep the route comfortable, transit-friendly, and near your ${state.profile.walking}-minute walking preference.`, action: "Ask AI", view: "plannerView", prompt }
    ]
  });
}

function recommendationMarkup({ status, title, text, action, view, prompt = "", query = "", hotelStop = "", focus = "", progressLabel, progress, steps, secondary }) {
  const attributes = item => `data-recommendation-view="${escapeHTML(item.view)}"${item.prompt ? ` data-recommendation-prompt="${escapeHTML(item.prompt)}"` : ""}${item.query ? ` data-recommendation-query="${escapeHTML(item.query)}"` : ""}${item.hotelStop ? ` data-recommendation-hotel-stop="${escapeHTML(item.hotelStop)}"` : ""}${item.focus ? ` data-recommendation-focus="${escapeHTML(item.focus)}"` : ""}`;
  return `<article class="recommendation-lead">
    <div class="recommendation-lead-top"><span>${escapeHTML(status)}</span><strong>${escapeHTML(progressLabel)}</strong></div>
    <div class="recommendation-lead-copy"><span class="recommendation-lead-icon" aria-hidden="true">✦</span><div><h3>${escapeHTML(title)}</h3><p>${escapeHTML(text)}</p></div></div>
    <div class="recommendation-readiness"><div class="recommendation-progress" aria-label="${escapeHTML(progressLabel)}"><span style="width:${progress}%"></span></div><div class="recommendation-steps">${steps.map(step => `<span class="${step.ready ? "ready" : ""}">${step.ready ? "✓" : "○"} ${escapeHTML(step.label)}</span>`).join("")}</div></div>
    <button class="recommendation-primary-action" type="button" ${attributes({ view, prompt, query, hotelStop, focus })}>${escapeHTML(action)}<span aria-hidden="true">›</span></button>
  </article>
  <div class="recommendation-secondary-grid">${secondary.map(item => `<button class="recommendation-option" type="button" ${attributes(item)}><span class="recommendation-option-icon" aria-hidden="true">${item.icon}</span><span class="recommendation-option-copy"><small>${escapeHTML(item.label)}</small><strong>${escapeHTML(item.title)}</strong><em>${escapeHTML(item.text)}</em><b>${escapeHTML(item.action)} <span aria-hidden="true">›</span></b></span></button>`).join("")}</div>`;
}

export function initializeHome({ showView } = {}) {
  document.getElementById("refreshRecommendations").addEventListener("click", () => {
    recommendationRotation++;
    renderRecommendations();
    toast("Fresh ideas added for your trip");
  });
  document.getElementById("recommendationList").addEventListener("click", event => {
    const action = event.target.closest("[data-recommendation-view]");
    if (!action) return;
    if (action.dataset.recommendationQuery) {
      state.mapQuery = action.dataset.recommendationQuery;
      saveLocalState();
    }
    if (action.dataset.recommendationHotelStop) state.selectedOvernightLocation = action.dataset.recommendationHotelStop;
    showView?.(action.dataset.recommendationView);
    if (action.dataset.recommendationPrompt) {
      const input = document.getElementById("chatInput");
      if (input) {
        input.value = action.dataset.recommendationPrompt;
        input.focus();
      }
    }
    if (action.dataset.recommendationFocus) document.getElementById(action.dataset.recommendationFocus)?.scrollIntoView({ behavior: "smooth", block: "start" });
    trackAppEvent("home_recommendation_opened", { destination: state.trip?.destination || "none", view_name: action.dataset.recommendationView });
  });
}
