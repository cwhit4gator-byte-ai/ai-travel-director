import { state } from "./state.js?v=37";
import { escapeHTML, safeImageURL, toast } from "./ui.js?v=37";
import { scheduleSave } from "./persistence.js?v=37";
import { trackAppEvent } from "../firebase-client.js?v=37";
import { formatTripDate, tripDateForDay } from "./trip-model.js?v=37";

function comparableText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function meaningfulWords(value) {
  return comparableText(value).split(" ").filter(word => word.length > 2);
}

export function parseClockMinutes(value) {
  const text = String(value || "").trim().toUpperCase().replaceAll(".", "");
  const match = text.match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || (match[3] ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (match[3] === "AM" && hour === 12) hour = 0;
  if (match[3] === "PM" && hour < 12) hour += 12;
  return hour * 60 + minute;
}

export function formatClockTime(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return "Flexible";
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function dayLocation(day) {
  return String(day?.overnightLocation || [...(day?.items || [])].reverse().find(item => item.location)?.location || day?.title || "").trim();
}

function dayLabel(day, trip = state.trip) {
  const date = tripDateForDay(day.day, trip);
  const location = dayLocation(day);
  return `Day ${day.day}${date ? ` · ${formatTripDate(date, { month: "short", day: "numeric" })}` : ""}${location ? ` · ${location}` : ""}`;
}

function activeItemCount(day) {
  return (day?.items || []).filter(item => item.category !== "Hotel").length;
}

export function recommendTripDay(trip, place, contextLocation = "") {
  const days = trip?.itinerary || [];
  if (!days.length) return null;
  const focus = comparableText(contextLocation);
  const address = comparableText(place?.address || place?.location);
  const placeWords = new Set([...meaningfulWords(contextLocation), ...meaningfulWords(place?.address || place?.location)]);
  return days.map((day, index) => {
    const primary = comparableText(dayLocation(day));
    const dayText = comparableText([day.title, day.overnightLocation, ...(day.items || []).flatMap(item => [item.name, item.location])].join(" "));
    let score = 0;
    if (focus && primary === focus) score += 160;
    if (focus && primary && (primary.includes(focus) || focus.includes(primary))) score += 90;
    if (focus && dayText.includes(focus)) score += 70;
    if (primary && address.includes(primary)) score += 55;
    for (const word of placeWords) if (dayText.split(" ").includes(word)) score += 5;
    return { day, index, score, itemCount: activeItemCount(day) };
  }).sort((left, right) => right.score - left.score || left.itemCount - right.itemCount || left.index - right.index)[0]?.day || days[0];
}

function defaultVisitMinutes(category, name) {
  const text = comparableText(`${category} ${name}`);
  if (/transit|train|station|bus/.test(text)) return 45;
  if (/museum|history|historic|architecture|castle|gallery|tour/.test(text)) return 120;
  if (/restaurant|food|cafe|market|lunch|dinner/.test(text)) return 90;
  if (/park|garden|quiet|walk|viewpoint/.test(text)) return 75;
  return 90;
}

function defaultStartTime(category, name) {
  const text = comparableText(`${category} ${name}`);
  if (/restaurant|food|cafe|market|lunch|dinner/.test(text)) return "12:30";
  if (/park|garden|quiet|walk|viewpoint/.test(text)) return "15:30";
  if (/transit|train|station|bus/.test(text)) return "09:00";
  return "10:00";
}

function estimateTravelMinutes(fromLocation, toLocation, contextLocation) {
  const from = comparableText(fromLocation);
  const to = comparableText(toLocation);
  const context = comparableText(contextLocation);
  if (!from || !to) return 20;
  if (from === to || from.includes(to) || to.includes(from)) return 10;
  if (context && from.includes(context) && to.includes(context)) return 20;
  const fromWords = new Set(meaningfulWords(from));
  if (meaningfulWords(to).some(word => fromWords.has(word))) return 20;
  return 45;
}

export function assessSmartAddSchedule(trip, { place, dayNumber, time, durationMinutes, contextLocation = "" }) {
  const day = (trip?.itinerary || []).find(entry => String(entry.day) === String(dayNumber));
  const placeName = comparableText(place?.name);
  const placeLocation = comparableText(place?.address || place?.location || contextLocation);
  const context = comparableText(contextLocation);
  const duplicate = (trip?.itinerary || []).flatMap(entry => (entry.items || []).map(item => ({ day: entry, item }))).find(({ item }) => {
    if (place?.id && item.placeId === place.id) return true;
    if (!placeName || comparableText(item.name) !== placeName) return false;
    const itemLocation = comparableText(item.location);
    if (!placeLocation || !itemLocation) return true;
    if (placeLocation === itemLocation || placeLocation.includes(itemLocation) || itemLocation.includes(placeLocation)) return true;
    return Boolean(context && placeLocation.includes(context) && itemLocation.includes(context));
  });
  if (!day) return { day: null, duplicate, conflicts: ["Choose an itinerary day."], travelText: "Choose a day to see its travel buffer." };
  const start = parseClockMinutes(time);
  const duration = Math.max(30, Math.min(480, Number(durationMinutes) || 90));
  const end = start === null ? null : start + duration;
  const timed = (day.items || []).map(item => {
    const itemStart = parseClockMinutes(item.time);
    const itemDuration = Math.max(30, Math.min(480, Number(item.durationMinutes) || 90));
    return itemStart === null ? null : { item, start: itemStart, end: itemStart + itemDuration };
  }).filter(Boolean).sort((left, right) => left.start - right.start);
  const conflicts = [];
  if (start === null) conflicts.push("Choose a valid start time.");
  if (end !== null) {
    timed.filter(entry => start < entry.end && end > entry.start).forEach(entry => conflicts.push(`Time conflict with ${entry.item.name} at ${entry.item.time}.`));
    if (end > 1440) conflicts.push("This visit would continue past midnight.");
  }
  const previous = start === null ? null : timed.filter(entry => entry.start <= start).at(-1) || null;
  const next = start === null ? null : timed.find(entry => entry.start > start) || null;
  const destination = place?.address || place?.location || contextLocation || place?.name;
  const travelMinutes = previous ? estimateTravelMinutes(previous.item.location || previous.item.name, destination, contextLocation) : 0;
  if (previous && start >= previous.end && start - previous.end < travelMinutes) conflicts.push(`Only ${start - previous.end} minutes remain after ${previous.item.name}; allow about ${travelMinutes} minutes for travel.`);
  if (next && end !== null && next.start >= end) {
    const onwardMinutes = estimateTravelMinutes(destination, next.item.location || next.item.name, contextLocation);
    if (next.start - end < onwardMinutes) conflicts.push(`Allow about ${onwardMinutes} minutes to reach ${next.item.name} after this visit.`);
  }
  const travelText = previous ? `Allow about ${travelMinutes} minutes from ${previous.item.name} to this stop. This is a planning estimate; live transit can vary.` : `This would be the first timed stop on ${dayLabel(day, trip)}.`;
  return { day, duplicate, conflicts: [...new Set(conflicts)], previous, next, travelMinutes, travelText };
}

export function insertTripItemChronologically(day, item) {
  const ordered = [...(day.items || []), item].map((entry, index) => ({ entry, index, start: parseClockMinutes(entry.time) }));
  ordered.sort((left, right) => {
    if (left.start === null && right.start === null) return left.index - right.index;
    if (left.start === null) return 1;
    if (right.start === null) return -1;
    return left.start - right.start || left.index - right.index;
  });
  day.items = ordered.map(({ entry }) => entry);
  return day.items.indexOf(item);
}

export function createSmartAdd({ showView, renderAll }) {
  const dialog = document.getElementById("smartAddDialog");
  const form = document.getElementById("smartAddForm");
  let pending = null;

  function currentAssessment() {
    return assessSmartAddSchedule(state.trip, {
      place: pending?.place,
      dayNumber: document.getElementById("smartAddDay").value,
      time: document.getElementById("smartAddTime").value,
      durationMinutes: document.getElementById("smartAddDuration").value,
      contextLocation: pending?.contextLocation
    });
  }

  function updateSummary() {
    if (!pending) return;
    const assessment = currentAssessment();
    const selectedDay = assessment.day;
    const recommended = pending.recommendedDay;
    document.getElementById("smartAddRecommendation").textContent = selectedDay === recommended
      ? `Best fit: ${dayLabel(recommended)}. It matches this stop and has ${activeItemCount(recommended)} scheduled activit${activeItemCount(recommended) === 1 ? "y" : "ies"}.`
      : `Selected: ${selectedDay ? dayLabel(selectedDay) : "Choose a day"}. The recommended fit is ${dayLabel(recommended)}.`;
    document.getElementById("smartAddTravel").textContent = assessment.travelText;
    const warnings = document.getElementById("smartAddWarnings");
    const messages = assessment.duplicate ? [`Already in your trip on Day ${assessment.duplicate.day.day} at ${assessment.duplicate.item.time}.`] : assessment.conflicts;
    warnings.hidden = !messages.length;
    warnings.classList.toggle("danger", Boolean(assessment.duplicate));
    warnings.innerHTML = messages.map(message => `<span>${escapeHTML(message)}</span>`).join("");
    const submit = document.getElementById("smartAddSubmit");
    submit.disabled = Boolean(assessment.duplicate || !selectedDay || parseClockMinutes(document.getElementById("smartAddTime").value) === null);
    submit.textContent = selectedDay ? `Add to Day ${selectedDay.day}` : "Add to trip";
  }

  function openSmartAddDialog({ place, category = "Place", contextLocation = "", markerNumber = 0, onAdded = null }) {
    if (!state.trip?.itinerary?.length) {
      toast("Plan a destination before adding places");
      showView("plannerView");
      return;
    }
    const recommendedDay = recommendTripDay(state.trip, place, contextLocation);
    pending = { place, category, contextLocation, markerNumber, recommendedDay, onAdded };
    document.getElementById("smartAddTitle").textContent = place.name || "Add this place";
    document.getElementById("smartAddPlaceContext").textContent = `${markerNumber ? `Map option ${markerNumber} · ` : ""}${place.address || contextLocation || "Selected place"}`;
    const daySelect = document.getElementById("smartAddDay");
    daySelect.innerHTML = state.trip.itinerary.map(day => `<option value="${escapeHTML(day.day)}">${escapeHTML(dayLabel(day))}</option>`).join("");
    daySelect.value = String(recommendedDay.day);
    document.getElementById("smartAddTime").value = defaultStartTime(category, place.name);
    document.getElementById("smartAddDuration").value = String(defaultVisitMinutes(category, place.name));
    document.getElementById("smartAddCost").value = Math.max(0, Number(place.cost || 0));
    document.getElementById("smartAddNote").value = "Saved from Explore. Confirm opening hours, tickets, and availability before visiting.";
    updateSummary();
    if (!dialog.open) dialog.showModal();
    daySelect.focus();
    trackAppEvent("smart_add_opened", { category, recommended_day: Number(recommendedDay.day) });
  }

  document.getElementById("closeSmartAddDialog").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  form.addEventListener("change", updateSummary);
  form.addEventListener("input", updateSummary);
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!pending) return;
    const assessment = currentAssessment();
    if (!assessment.day || assessment.duplicate || parseClockMinutes(document.getElementById("smartAddTime").value) === null) return updateSummary();
    const start = parseClockMinutes(document.getElementById("smartAddTime").value);
    const item = {
      id: crypto.randomUUID(),
      placeId: String(pending.place.id || ""),
      time: formatClockTime(start),
      durationMinutes: Math.max(30, Math.min(480, Number(document.getElementById("smartAddDuration").value) || 90)),
      name: String(pending.place.name || "Selected place").slice(0, 160),
      location: String(pending.place.address || pending.contextLocation || pending.place.name || "").slice(0, 240),
      category: String(pending.place.category || pending.category || "Explore").slice(0, 80),
      photoURL: safeImageURL(pending.place.photoURL),
      photoAttribution: pending.place.photoAttribution || null,
      mapsURL: safeImageURL(pending.place.mapsURL),
      cost: Math.max(0, Number(document.getElementById("smartAddCost").value) || 0),
      note: String(document.getElementById("smartAddNote").value || "").trim().slice(0, 600),
      source: "explore",
      done: false
    };
    insertTripItemChronologically(assessment.day, item);
    scheduleSave();
    renderAll();
    dialog.close();
    pending.onAdded?.(assessment.day, item);
    trackAppEvent("trip_activity_added", { source: "smart_explore", day: Number(assessment.day.day), had_warning: assessment.conflicts.length > 0 });
    toast(`${item.name} added to Day ${assessment.day.day} at ${item.time}`);
    pending = null;
  });

  return { openSmartAddDialog };
}
