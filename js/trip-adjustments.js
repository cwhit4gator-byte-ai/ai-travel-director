import { state } from "./state.js?v=49";
import { escapeHTML, safeImageURL, toast } from "./ui.js?v=49";
import { scheduleSave } from "./persistence.js?v=49";
import { trackAppEvent } from "../firebase-client.js?v=49";
import { searchNearbyPlaces, searchPlaceDetails } from "../maps.js?v=49";

const REASON_LABELS = { late: "Running late", closed: "Place closed", weather: "Weather", walking: "Less walking", replace: "New stop" };
const REASON_SEARCHES = {
  closed: item => `open attractions similar to ${item.category || item.name}`,
  weather: () => "indoor museums, galleries, and historic attractions",
  walking: () => "accessible attractions with easy public transportation",
  replace: () => `popular ${String(state.profile.interests || "local culture")} attractions`
};

function timeMinutes(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + Number(match[2]);
}

export function shiftTime(value, minutes = 60) {
  const parsed = timeMinutes(value);
  if (parsed === null) return value || "Flexible";
  const total = (parsed + minutes + 1440) % 1440;
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

export function scheduleUpdatesForDelay(day, item, delayMinutes) {
  const start = (day?.items || []).indexOf(item);
  if (start < 0) return [];
  return day.items.slice(start).filter(candidate => !candidate.done && candidate.category !== "Hotel" && timeMinutes(candidate.time) !== null).map(candidate => ({
    itemId: candidate.id,
    name: candidate.name || "Activity",
    before: candidate.time,
    after: shiftTime(candidate.time, delayMinutes)
  }));
}

function milesBetween(origin, destination) {
  const lat1 = Number(origin?.latitude), lon1 = Number(origin?.longitude), lat2 = Number(destination?.latitude), lon2 = Number(destination?.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const radians = value => value * Math.PI / 180;
  const dLat = radians(lat2 - lat1), dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function placeDistanceLabel(origin, place) {
  const miles = milesBetween(origin, place);
  if (miles === null) return "Near today’s route";
  if (miles < .15) return "Same area · about a 3-minute walk";
  const rounded = miles.toFixed(1);
  const walkMinutes = Math.max(5, Math.round(miles * 20 / 5) * 5);
  return miles <= 1.5 ? `${rounded} mi · about ${walkMinutes} min walking` : `${rounded} mi away · transit recommended`;
}

function priceLabel(value) {
  const normalized = String(value || "").toUpperCase();
  if (!normalized) return "Cost varies";
  const numeric = Number(normalized.match(/\d+/)?.[0]);
  if (Number.isFinite(numeric) && numeric > 0) return "$".repeat(Math.min(4, numeric));
  return normalized.replace("PRICE_LEVEL_", "").replaceAll("_", " ").toLocaleLowerCase();
}

function placeOption(item, place, reason, distanceLabel) {
  const reasonNotes = {
    closed: "A real nearby alternative. Confirm current admission details before leaving.",
    weather: "An indoor option that keeps the day moving despite the weather.",
    walking: "A lower-friction choice near the route with transit or a shorter walk.",
    replace: "A highly rated alternative matched to your interests."
  };
  return {
    kind: "place",
    title: place.name,
    subtitle: place.category || "Local attraction",
    imageURL: place.photoURL || place.heroPhotoURL || "",
    photoAttribution: place.photoAttribution || null,
    ratingText: place.rating ? `${place.rating.toFixed(1)} ★${place.reviewCount ? ` · ${place.reviewCount.toLocaleString()} reviews` : ""}` : "Google place",
    openingText: place.openingText || "Check today’s hours",
    openNow: place.openNow,
    distanceLabel,
    priceText: priceLabel(place.priceLevel),
    proposal: {
      name: place.name,
      location: place.address,
      time: item.time || "Flexible",
      category: place.category || item.category || "Sightseeing",
      cost: Number(item.cost || 0),
      note: reasonNotes[reason],
      placeId: place.id,
      photoURL: place.heroPhotoURL || place.photoURL || "",
      photoAttribution: place.photoAttribution || null,
      mapsURL: place.mapsURL || "",
      latitude: place.latitude,
      longitude: place.longitude
    }
  };
}

function scheduleOption(day, item, delayMinutes) {
  const updates = scheduleUpdatesForDelay(day, item, delayMinutes);
  const label = delayMinutes === 60 ? "1 hour later" : `${delayMinutes} minutes later`;
  return {
    kind: "schedule",
    title: label,
    subtitle: `Next stop starts at ${shiftTime(item.time, delayMinutes)}`,
    openingText: `${updates.length} unfinished stop${updates.length === 1 ? "" : "s"} rescheduled`,
    distanceLabel: "Locations stay the same",
    priceText: "No cost change",
    scheduleUpdates: updates,
    proposal: { ...item, time: shiftTime(item.time, delayMinutes), note: `Schedule shifted ${label}.` }
  };
}

export function createTripAdjustments({ showView, renderAll }) {
  const dialog = document.getElementById("tripAdjustmentDialog");
  const steps = {
    reason: document.getElementById("tripAdjustmentReasonStep"),
    options: document.getElementById("tripAdjustmentOptionsStep"),
    review: document.getElementById("tripAdjustmentReviewStep")
  };
  let pending = null;
  let requestSequence = 0;

  function showStep(name, title) {
    Object.entries(steps).forEach(([key, element]) => { element.hidden = key !== name; });
    document.getElementById("tripAdjustmentTitle").textContent = title;
  }

  function open(context) {
    if (!context?.next || !context?.day) return;
    if (context.next.category === "Hotel") {
      toast("Hotel stays are protected. Opening your hotel choices.");
      showView("hotelsView");
      return;
    }
    pending = { dayNumber: Number(context.day.day || 1), day: context.day, itemId: context.next.id, item: context.next, reason: null, options: [], selection: null };
    document.getElementById("tripAdjustmentContext").textContent = `${context.next.name || "Next stop"} · ${context.next.time || "Flexible"} · Day ${pending.dayNumber}`;
    showStep("reason", "What changed?");
    if (!dialog.open) dialog.showModal();
  }

  function openCustomRequest() {
    if (!pending) return;
    dialog.close();
    showView("plannerView");
    const input = document.getElementById("chatInput");
    if (input) {
      input.value = `Change ${pending.item.name || "my next stop"} on Day ${pending.dayNumber}: `;
      input.focus();
    }
    trackAppEvent("trip_adjustment_custom_requested", { day: pending.dayNumber });
  }

  function renderOptions(options, reason) {
    document.getElementById("tripAdjustmentOptions").innerHTML = options.map((option, index) => {
      const imageURL = safeImageURL(option.imageURL);
      const statusClass = option.openNow === true ? " open" : option.openNow === false ? " closed" : "";
      return `<button class="trip-adjustment-option" type="button" data-adjustment-option="${index}">
        <span class="trip-adjustment-option-media${imageURL ? " has-photo" : ""}">${imageURL ? `<img src="${escapeHTML(imageURL)}" alt="" loading="lazy" />${option.photoAttribution?.displayName ? `<small>Photo: ${escapeHTML(option.photoAttribution.displayName)}</small>` : ""}` : "✦"}<b aria-hidden="true">${index + 1}</b></span>
        <span class="trip-adjustment-option-copy"><span><em class="option-status${statusClass}">${escapeHTML(option.openingText)}</em><em>${escapeHTML(option.priceText)}</em></span><strong>${escapeHTML(option.title)}</strong><small>${escapeHTML(option.subtitle)}</small><span>${escapeHTML(option.ratingText || option.distanceLabel)}</span><span>${escapeHTML(option.distanceLabel)}</span></span>
        <span class="trip-adjustment-option-arrow" aria-hidden="true">›</span>
      </button>`;
    }).join("");
    document.getElementById("tripAdjustmentOptionsContext").textContent = reason === "late" ? "Choose how far to move the remaining schedule." : `${options.length} real places matched near ${pending.day.overnightLocation || pending.item.location || state.trip.destination}.`;
  }

  async function loadOptions(reason) {
    if (!pending) return;
    if (reason === "custom") return openCustomRequest();
    pending.reason = reason;
    const sequence = ++requestSequence;
    showStep("options", reason === "late" ? "Adjust today’s timing" : "Choose an alternative");
    document.getElementById("tripAdjustmentOptionsContext").textContent = reason === "late" ? "Preparing schedule choices…" : "Searching Google for current nearby options…";
    document.getElementById("tripAdjustmentOptions").innerHTML = `<div class="trip-rescue-loading" role="status"><span class="ai-pulse" aria-hidden="true">✦</span><strong>Finding the best options…</strong><small>Checking fit, ratings, hours, and route distance</small></div>`;
    try {
      let options;
      if (reason === "late") options = [30, 60, 90].map(delay => scheduleOption(pending.day, pending.item, delay));
      else {
        const location = pending.day.overnightLocation || pending.item.location || state.trip.destination;
        const [currentPlaces, nearbyPlaces] = await Promise.all([
          searchPlaceDetails(`${pending.item.name}, ${location}`, 1).catch(() => []),
          searchNearbyPlaces(location, REASON_SEARCHES[reason](pending.item), 6)
        ]);
        const currentPlace = currentPlaces[0] || pending.item;
        const currentName = String(pending.item.name || "").toLocaleLowerCase();
        const otherItems = (state.trip?.itinerary || []).flatMap(day => day.items || []).filter(item => item !== pending.item);
        const existingIds = new Set(otherItems.map(item => item.placeId).filter(Boolean));
        const existingNames = new Set(otherItems.map(item => String(item.name || "").toLocaleLowerCase()).filter(Boolean));
        const candidates = nearbyPlaces.filter(place => place.id !== pending.item.placeId && !existingIds.has(place.id) && String(place.name).toLocaleLowerCase() !== currentName && !existingNames.has(String(place.name).toLocaleLowerCase()) && (reason !== "closed" || place.openNow !== false)).sort((a, b) => {
          const availability = Number(b.openNow === true) - Number(a.openNow === true);
          if (availability) return availability;
          if (reason === "walking") {
            const distanceA = milesBetween(currentPlace, a) ?? Number.POSITIVE_INFINITY;
            const distanceB = milesBetween(currentPlace, b) ?? Number.POSITIVE_INFINITY;
            if (distanceA !== distanceB) return distanceA - distanceB;
          }
          return (b.rating * Math.log10(b.reviewCount + 10)) - (a.rating * Math.log10(a.reviewCount + 10));
        }).slice(0, 3);
        options = candidates.map(place => placeOption(pending.item, place, reason, placeDistanceLabel(currentPlace, place)));
      }
      if (sequence !== requestSequence || !pending) return;
      if (!options.length) throw new Error("No suitable live alternatives were returned.");
      pending.options = options;
      renderOptions(options, reason);
      trackAppEvent("trip_rescue_options_loaded", { day: pending.dayNumber, reason, option_count: options.length });
    } catch (error) {
      if (sequence !== requestSequence || !pending) return;
      console.warn("Live trip rescue options unavailable.", error);
      document.getElementById("tripAdjustmentOptionsContext").textContent = "Live place details could not load right now.";
      document.getElementById("tripAdjustmentOptions").innerHTML = `<div class="trip-rescue-error"><span aria-hidden="true">⌁</span><strong>Let the planner handle this change</strong><p>Describe what you need and the full planner will keep your existing trip as context.</p><button type="button" data-adjustment-custom>Open planner</button></div>`;
    }
  }

  function reviewOption(index) {
    const option = pending?.options?.[Number(index)];
    if (!option) return;
    pending.selection = option;
    document.getElementById("tripAdjustmentBeforeName").textContent = pending.item.name || "Next stop";
    document.getElementById("tripAdjustmentBeforeDetails").textContent = `${pending.item.time || "Flexible"} · ${pending.item.location || "Location flexible"}`;
    document.getElementById("tripAdjustmentAfterName").textContent = option.proposal.name;
    document.getElementById("tripAdjustmentAfterDetails").textContent = `${option.proposal.time || "Flexible"} · ${option.proposal.location || "Location flexible"}`;
    document.getElementById("tripAdjustmentAfterMeta").textContent = [option.openingText, option.ratingText, option.distanceLabel].filter(Boolean).join(" · ");
    document.getElementById("tripAdjustmentAfterNote").textContent = option.proposal.note;
    document.getElementById("tripAdjustmentReasonBadge").textContent = REASON_LABELS[pending.reason] || "Adjusted";
    const photoURL = safeImageURL(option.imageURL);
    const photoWrap = document.getElementById("tripAdjustmentReviewPhoto");
    photoWrap.hidden = !photoURL;
    if (photoURL) document.getElementById("tripAdjustmentAfterPhoto").src = photoURL;
    document.getElementById("tripAdjustmentPhotoCredit").textContent = option.photoAttribution?.displayName ? `Photo: ${option.photoAttribution.displayName}` : "";
    const schedulePreview = document.getElementById("tripAdjustmentSchedulePreview");
    const scheduleUpdates = option.scheduleUpdates || [];
    schedulePreview.hidden = !scheduleUpdates.length;
    schedulePreview.innerHTML = scheduleUpdates.length ? `<strong>REMAINING SCHEDULE</strong>${scheduleUpdates.map(update => `<div><span>${escapeHTML(update.name)}</span><small><s>${escapeHTML(update.before)}</s> → <b>${escapeHTML(update.after)}</b></small></div>`).join("")}` : "";
    document.getElementById("tripAdjustmentProtection").innerHTML = `<span aria-hidden="true">✓</span>${scheduleUpdates.length ? "Only unfinished activities with scheduled times will move. Completed activities and lodging are protected." : "Only this unfinished stop will change. Completed activities and lodging are protected."}`;
    showStep("review", "Review the update");
    trackAppEvent("trip_adjustment_reviewed", { day: pending.dayNumber, reason: pending.reason });
  }

  function apply() {
    const option = pending?.selection;
    if (!option) return;
    const day = state.trip?.itinerary?.find(candidate => Number(candidate.day) === pending.dayNumber);
    const item = day?.items?.find(candidate => candidate.id === pending.itemId);
    if (!item || item.done || item.category === "Hotel") {
      dialog.close();
      toast("That stop changed before this update could be applied.");
      return;
    }
    if (option.kind === "schedule") {
      (option.scheduleUpdates || []).forEach(update => {
        const candidate = day.items.find(dayItem => dayItem.id === update.itemId);
        if (candidate && !candidate.done && candidate.category !== "Hotel" && candidate.time === update.before) candidate.time = update.after;
      });
      item.note = option.proposal.note;
    } else {
      Object.assign(item, option.proposal);
      if (!option.proposal.placeId) {
        delete item.placeId;
        delete item.photoURL;
        delete item.photoAttribution;
      }
    }
    scheduleSave();
    renderAll();
    dialog.close();
    trackAppEvent("trip_adjustment_applied", { day: pending.dayNumber, reason: pending.reason });
    toast(option.kind === "schedule" ? "Today’s remaining schedule was updated." : "Next stop updated. The rest of your trip is unchanged.");
    pending = null;
  }

  document.getElementById("tripAdjustmentReasons").addEventListener("click", async event => {
    const choice = event.target.closest("[data-adjustment-reason]");
    if (choice) await loadOptions(choice.dataset.adjustmentReason);
  });
  document.getElementById("tripAdjustmentOptions").addEventListener("click", event => {
    const option = event.target.closest("[data-adjustment-option]");
    if (option) reviewOption(option.dataset.adjustmentOption);
    else if (event.target.closest("[data-adjustment-custom]")) openCustomRequest();
  });
  document.getElementById("backTripAdjustmentOptions").addEventListener("click", () => showStep("reason", "What changed?"));
  document.getElementById("backTripAdjustment").addEventListener("click", () => showStep("options", pending?.reason === "late" ? "Adjust today’s timing" : "Choose an alternative"));
  document.getElementById("applyTripAdjustment").addEventListener("click", apply);
  document.getElementById("closeTripAdjustment").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });

  return { open };
}
