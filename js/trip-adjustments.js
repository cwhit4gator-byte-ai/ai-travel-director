import { state } from "./state.js?v=45";
import { toast } from "./ui.js?v=45";
import { scheduleSave } from "./persistence.js?v=45";
import { trackAppEvent } from "../firebase-client.js?v=45";

const REASON_LABELS = {
  late: "Running late",
  closed: "Place closed",
  weather: "Weather",
  walking: "Less walking",
  replace: "New stop"
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

export function buildTripAdjustmentProposal(item, reason) {
  const name = item?.name || "Next stop";
  const location = item?.location || "nearby";
  const base = {
    name,
    location,
    time: item?.time || "Flexible",
    category: item?.category || "Sightseeing",
    cost: Number(item?.cost || 0),
    note: item?.note || ""
  };
  if (reason === "late") return { ...base, time: shiftTime(base.time), note: `Shifted one hour later. Keep the rest of the day flexible if needed.` };
  if (reason === "closed") return { ...base, name: `Nearby alternative to ${name}`, category: "Sightseeing", note: `Swap in a nearby open attraction with a similar feel. Confirm today’s hours before leaving.` };
  if (reason === "weather") return { ...base, name: `Indoor highlight near ${location}`, category: "Museum", note: `A weather-friendly indoor stop that keeps you close to the original route.` };
  if (reason === "walking") return { ...base, name: `Low-walking alternative near ${location}`, category: "Sightseeing", note: `Use public transportation or a short ride and keep walking segments brief.` };
  return { ...base, name: `A fresh local highlight in ${location}`, category: "Sightseeing", note: `Try a different nearby experience that fits the pace of this day.` };
}

export function createTripAdjustments({ showView, renderAll }) {
  const dialog = document.getElementById("tripAdjustmentDialog");
  const reasonStep = document.getElementById("tripAdjustmentReasonStep");
  const reviewStep = document.getElementById("tripAdjustmentReviewStep");
  let pending = null;

  function showReasonStep() {
    reasonStep.hidden = false;
    reviewStep.hidden = true;
    document.getElementById("tripAdjustmentTitle").textContent = "What changed?";
  }

  function open(context) {
    if (!context?.next || !context?.day) return;
    if (context.next.category === "Hotel") {
      toast("Hotel stays are protected. Opening your hotel choices.");
      showView("hotelsView");
      return;
    }
    pending = { dayNumber: Number(context.day.day || 1), itemId: context.next.id, item: context.next, proposal: null, reason: null };
    document.getElementById("tripAdjustmentContext").textContent = `${context.next.name || "Next stop"} · ${context.next.time || "Flexible"} · Day ${pending.dayNumber}`;
    showReasonStep();
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

  function review(reason) {
    if (!pending) return;
    if (reason === "custom") {
      openCustomRequest();
      return;
    }
    pending.reason = reason;
    pending.proposal = buildTripAdjustmentProposal(pending.item, reason);
    const currentDetails = `${pending.item.time || "Flexible"} · ${pending.item.location || "Location flexible"}`;
    const proposedDetails = `${pending.proposal.time || "Flexible"} · ${pending.proposal.location || "Location flexible"}`;
    document.getElementById("tripAdjustmentBeforeName").textContent = pending.item.name || "Next stop";
    document.getElementById("tripAdjustmentBeforeDetails").textContent = currentDetails;
    document.getElementById("tripAdjustmentAfterName").textContent = pending.proposal.name;
    document.getElementById("tripAdjustmentAfterDetails").textContent = proposedDetails;
    document.getElementById("tripAdjustmentAfterNote").textContent = pending.proposal.note;
    document.getElementById("tripAdjustmentReasonBadge").textContent = REASON_LABELS[reason] || "Adjusted";
    reasonStep.hidden = true;
    reviewStep.hidden = false;
    document.getElementById("tripAdjustmentTitle").textContent = "Review the update";
    trackAppEvent("trip_adjustment_reviewed", { day: pending.dayNumber, reason });
  }

  function apply() {
    if (!pending?.proposal) return;
    const day = state.trip?.itinerary?.find(candidate => Number(candidate.day) === pending.dayNumber);
    const item = day?.items?.find(candidate => candidate.id === pending.itemId);
    if (!item || item.done || item.category === "Hotel") {
      dialog.close();
      toast("That stop changed before this update could be applied.");
      return;
    }
    const changedPlace = pending.proposal.name !== item.name;
    Object.assign(item, pending.proposal);
    if (changedPlace) {
      delete item.placeId;
      delete item.photoURL;
      delete item.photoAttribution;
    }
    scheduleSave();
    renderAll();
    dialog.close();
    trackAppEvent("trip_adjustment_applied", { day: pending.dayNumber, reason: pending.reason });
    toast("Next stop updated. The rest of your trip is unchanged.");
    pending = null;
  }

  document.getElementById("tripAdjustmentReasons").addEventListener("click", event => {
    const choice = event.target.closest("[data-adjustment-reason]");
    if (choice) review(choice.dataset.adjustmentReason);
  });
  document.getElementById("backTripAdjustment").addEventListener("click", showReasonStep);
  document.getElementById("applyTripAdjustment").addEventListener("click", apply);
  document.getElementById("closeTripAdjustment").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });

  return { open };
}
