import { state } from "./state.js?v=32";
import { normalizeInterests, trackAppError } from "./ui.js?v=32";
import { scheduleSave } from "./persistence.js?v=32";
import { requestAITrip, trackAppEvent } from "../firebase-client.js?v=32";
import { normalizeAITrip, buildLocalTrip, tripForAIContext, preserveActiveTripDetails } from "./trip-model.js?v=32";
import { communityItems } from "./community-data.js?v=32";

export function resolvePlannerTripAction(result, currentTrip) {
  if (["keep", "revise", "replace"].includes(result?.tripAction)) return result.tripAction;
  return currentTrip ? "keep" : "replace";
}

export function createPlanner({ renderAll }) {
  function addMessage(text, type = "ai", pending = false) {
    const message = document.createElement("div");
    message.className = `message ${type}${pending ? " pending" : ""}`;
    message.textContent = text;
    document.getElementById("chatMessages").appendChild(message);
    message.scrollIntoView({ behavior: "smooth", block: "end" });
    return message;
  }

  function initializeChat() {
    const chat = document.getElementById("chatMessages");
    const context = document.getElementById("plannerTripContext");
    context.hidden = !state.trip;
    context.textContent = state.trip ? `Active trip: ${state.trip.destination} · ${state.trip.days} days. Ask a question or request a change.` : "";
    document.getElementById("chatInput").placeholder = state.trip ? "Ask about or change your active trip" : "Where do you want to go?";
    if (chat.children.length) return;
    const mode = state.user && state.cloudConfigured ? "secure AI" : "local planning assistant";
    const activeTrip = state.trip ? ` I can see your active ${state.trip.destination} itinerary, so you can ask questions or request changes without describing it again.` : "";
    addMessage(`You are using the ${mode}.${activeTrip} Tell me what you want to plan or change. I’ll use your interests in ${normalizeInterests(state.profile.interests)}.`);
  }

  function clearlyRequestsNewTrip(text) {
    return /\b(?:new|different|another)\s+trip\b/i.test(text) || /\b(?:plan|build|create|start)\b[\s\S]{0,40}\b\d+\s*(?:day|night)s?\s+in\b/i.test(text);
  }

  async function createTripFromRequest(text) {
    if (state.user && state.cloudConfigured && navigator.onLine) {
      const currentTrip = tripForAIContext();
      const result = await requestAITrip({ request: text, profile: state.profile, communityInsights: communityItems().slice(0, 8), currentTrip });
      const tripAction = resolvePlannerTripAction(result, currentTrip);
      if (tripAction === "keep" && state.trip) {
        const legacyMessage = result?.tripAction ? "Your active itinerary is unchanged." : "The context-aware AI upgrade is not active on this server yet, so I kept your current itinerary unchanged.";
        return { trip: state.trip, tripAction, message: result.message && result?.tripAction ? result.message : legacyMessage };
      }
      const normalized = normalizeAITrip(result, text);
      return { trip: tripAction === "revise" ? preserveActiveTripDetails(normalized, state.trip) : normalized, tripAction, message: result.message || "I updated your personalized draft itinerary. No bookings were made." };
    }
    if (state.trip && !clearlyRequestsNewTrip(text)) return { trip: state.trip, tripAction: "keep", message: `Your active ${state.trip.destination} itinerary is still open. Connect to the secure AI to ask follow-up questions or revise it from chat; you can also edit individual activities in Trip.` };
    const trip = buildLocalTrip(text);
    return { trip, tripAction: "replace", message: `I created a ${trip.days}-day working plan for ${trip.destination} with a $${trip.budget.toLocaleString("en-US")} budget. It prioritizes ${normalizeInterests(state.profile.interests)}, a ${state.profile.pace} pace, and short walking segments. No bookings were made.` };
  }

  document.querySelectorAll(".prompt-chip").forEach(button => button.addEventListener("click", () => { document.getElementById("chatInput").value = button.textContent; document.getElementById("chatInput").focus(); }));

  document.getElementById("chatForm").addEventListener("submit", async event => {
    event.preventDefault();
    const input = document.getElementById("chatInput");
    const text = input.value.trim();
    if (!text) return;
    addMessage(text, "user");
    input.value = "";
    const submit = event.submitter;
    submit.disabled = true;
    const pending = addMessage("Building a route around your preferences…", "ai", true);
    try {
      trackAppEvent("trip_plan_requested", { method: state.user && state.cloudConfigured && navigator.onLine ? "cloud_ai" : "local" });
      const result = await createTripFromRequest(text);
      const replacingTrip = !state.trip || result.tripAction === "replace";
      state.trip = result.trip;
      if (replacingTrip) state.selectedOvernightLocation = "";
      if (result.tripAction !== "keep") state.hotelLocationsAttempted = false;
      if (replacingTrip) {
        state.hotelStay.checkIn = "";
        state.hotelStay.checkOut = "";
      }
      trackAppEvent(replacingTrip ? "trip_created" : "trip_updated", { method: state.trip.generatedBy === "openai" ? "cloud_ai" : "local", result: result.tripAction });
      if (result.tripAction !== "keep") state.mapQuery = state.trip.destination;
      scheduleSave();
      pending.textContent = result.message;
      pending.classList.remove("pending");
      renderAll();
    } catch (error) {
      console.error(error);
      trackAppError("trip_planner", error);
      pending.textContent = state.trip
        ? "I could not safely apply that request, so your active itinerary was not changed. Please try again after the context-aware AI update is live."
        : `I could not reach the secure AI service. ${error.message || "Please try again."}`;
      pending.classList.remove("pending");
    } finally { submit.disabled = false; }
  });

  return { initializeChat };
}
