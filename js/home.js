import { state } from "./state.js?v=31";
import { escapeHTML, normalizeInterests, toast } from "./ui.js?v=31";
import { tripDateForDay, formatTripDate } from "./trip-model.js?v=31";

export function renderHome() {
  const title = document.getElementById("homeHeading");
  const summary = document.getElementById("tripSummary");
  const metric = document.getElementById("homeTripMetric");
  const collectionsMetric = document.getElementById("homeCollectionsMetric");
  const savedCount = state.collections.reduce((total, collection) => total + (collection.items || []).length, 0);
  if (collectionsMetric) collectionsMetric.textContent = savedCount ? `${savedCount} saved place${savedCount === 1 ? "" : "s"}` : "Nothing saved yet";
  if (state.trip) {
    const firstDate = tripDateForDay(1);
    const lastDate = tripDateForDay(state.trip.days);
    const dateSummary = firstDate ? `${formatTripDate(firstDate, { month: "short", day: "numeric" })}–${formatTripDate(lastDate, { month: "short", day: "numeric", year: "numeric" })} · ` : "";
    title.textContent = state.trip.destination;
    summary.textContent = `${dateSummary}${state.trip.days}-day working itinerary · $${Number(state.trip.budget || 0).toLocaleString("en-US")} budget · no bookings made`;
    metric.textContent = `${state.trip.days} days in ${state.trip.destination}`;
  } else {
    title.textContent = "Where should we go next?";
    summary.textContent = "Describe the trip you want. Your AI director will shape the route around your budget, pace, history, and architecture interests.";
    metric.textContent = "No active trip";
  }
}

export function renderRecommendations() {
  const interests = normalizeInterests(state.profile.interests).split(",").map(item => item.trim()).filter(Boolean);
  const destination = state.trip?.destination || "your next destination";
  const cards = [
    { icon: "⌂", title: "Architecture before the crowds", text: `Start ${destination} with a historic district matched to your ${state.profile.pace} pace.`, tag: interests[0] || "History" },
    { icon: "↔", title: "Transit-first route", text: `Keep walking segments near ${state.profile.walking} minutes and connect major stops by public transportation.`, tag: "Low friction" },
    { icon: "✦", title: "A flexible final afternoon", text: "Hold one indoor and one outdoor option so the day can adapt without disrupting the trip.", tag: "AI suggestion" }
  ];
  document.getElementById("recommendationList").innerHTML = cards.map(card => `
    <article class="recommendation-card"><span class="card-icon">${card.icon}</span><h3>${escapeHTML(card.title)}</h3><p>${escapeHTML(card.text)}</p><div class="tag-row"><span class="tag">${escapeHTML(card.tag)}</span></div></article>
  `).join("");
}

export function initializeHome() {
  document.getElementById("refreshRecommendations").addEventListener("click", () => { renderRecommendations(); toast("Recommendations refreshed"); });
}
