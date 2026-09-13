import { state } from "./state.js?v=48";
import { normalizeInterests, trackAppError } from "./ui.js?v=48";
import { scheduleSave } from "./persistence.js?v=48";
import { requestAITrip, trackAppEvent } from "../firebase-client.js?v=48";
import { normalizeAITrip, buildLocalTrip, tripForAIContext, preserveActiveTripDetails } from "./trip-model.js?v=48";
import { communityItems } from "./community-data.js?v=48";

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
    const plannerView = document.getElementById("plannerView");
    const prompts = document.getElementById("plannerPrompts");
    const active = Boolean(state.trip);
    plannerView.classList.toggle("has-active-trip", active);
    document.getElementById("plannerHeading").textContent = active ? "Ask about your trip" : "Build the whole trip";
    context.hidden = !state.trip;
    context.textContent = state.trip ? `✦  Active trip · ${state.trip.destination} · ${state.trip.days} days` : "";
    prompts.innerHTML = active
      ? `<button class="prompt-chip" type="button" data-planner-prompt="Improve the route without changing completed activities or selected hotels.">Improve route</button><button class="prompt-chip" type="button" data-planner-prompt="Reduce walking and use public transportation where possible.">Reduce walking</button><button class="prompt-chip" type="button" data-planner-prompt="Add one flexible backup activity without disrupting the itinerary.">Add backup</button>`
      : `<button class="prompt-chip" type="button">5 days of history and architecture under $1,500</button><button class="prompt-chip" type="button">A relaxed public-transit trip with little walking</button><button class="prompt-chip" type="button">Plan a day trip and keep the schedule flexible</button>`;
    document.getElementById("chatInput").placeholder = state.trip ? "Ask about or change your active trip" : "Where do you want to go?";
    if (chat.children.length) return;
    if (state.trip) {
      const mode = state.user && state.cloudConfigured ? "Secure AI" : "Your planning assistant";
      addMessage(`${mode} is ready for your ${state.trip.destination} trip. Ask a question or describe a change. Completed activities and selected hotels stay protected.`);
    } else {
      addMessage(`Tell me where and when you want to travel, your budget, and what matters most. I’ll build a flexible draft around ${normalizeInterests(state.profile.interests)}.`);
    }
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

  document.getElementById("plannerPrompts").addEventListener("click", event => {
    const button = event.target.closest(".prompt-chip");
    if (!button) return;
    document.getElementById("chatInput").value = button.dataset.plannerPrompt || button.textContent;
    document.getElementById("chatInput").focus();
  });

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
      initializeChat();
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
