import { state } from "./state.js?v=28";
import { normalizeInterests, trackAppError } from "./ui.js?v=28";
import { scheduleSave } from "./persistence.js?v=28";
import { requestAITrip, trackAppEvent } from "../firebase-client.js?v=28";
import { normalizeAITrip, buildLocalTrip } from "./trip-model.js?v=28";
import { communityItems } from "./community-data.js?v=28";

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
    if (chat.children.length) return;
    const mode = state.user && state.cloudConfigured ? "secure AI" : "local planning assistant";
    addMessage(`You are using the ${mode}. Tell me where you want to go, how many days you have, your budget, and any must-see places. I’ll use your interests in ${normalizeInterests(state.profile.interests)}.`);
  }

  async function createTripFromRequest(text) {
    if (state.user && state.cloudConfigured && navigator.onLine) {
      const itineraryRequest = `${text}\nGive every itinerary event its city or town in a location field. Set each day’s overnightLocation to the location of that day’s final event. Also begin the day title with that city, formatted exactly as "City — theme". For a route, use the actual city rather than the country or region.`;
      const result = await requestAITrip({ request: itineraryRequest, profile: state.profile, communityInsights: communityItems().slice(0, 8) });
      return { trip: normalizeAITrip(result, text), message: result.message || "I created a personalized draft itinerary. No bookings were made." };
    }
    const trip = buildLocalTrip(text);
    return { trip, message: `I created a ${trip.days}-day working plan for ${trip.destination} with a $${trip.budget.toLocaleString("en-US")} budget. It prioritizes ${normalizeInterests(state.profile.interests)}, a ${state.profile.pace} pace, and short walking segments. No bookings were made.` };
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
      state.trip = result.trip;
      state.selectedOvernightLocation = "";
      state.hotelLocationsAttempted = false;
      state.hotelStay.checkIn = "";
      state.hotelStay.checkOut = "";
      trackAppEvent("trip_created", { method: state.trip.generatedBy === "openai" ? "cloud_ai" : "local" });
      state.mapQuery = state.trip.destination;
      scheduleSave();
      pending.textContent = result.message;
      pending.classList.remove("pending");
      renderAll();
    } catch (error) {
      console.error(error);
      trackAppError("trip_planner", error);
      pending.textContent = `I could not reach the secure AI service. ${error.message || "Please try again."}`;
      pending.classList.remove("pending");
    } finally { submit.disabled = false; }
  });

  return { initializeChat };
}
