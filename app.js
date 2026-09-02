import {
  initializeCloud,
  observeAuth,
  signInGoogle,
  signOutUser,
  loadCloudState,
  saveCloudState,
  requestAITrip,
  uploadExperiencePhotos,
  requestPhotoAnalysis
} from "./firebase-client.js";
import { renderGoogleMap } from "./maps.js";

const STORAGE_KEY = "aitd_v3_state";
const defaultProfile = {
  name: "Chris",
  language: "English",
  interests: "history, architecture, local culture",
  travelStyles: ["Independent", "Public transit", "Budget aware"],
  budget: 1500,
  pace: "balanced",
  diet: "No alcohol",
  walking: 20,
  aiPreference: "Suggestions only"
};

const defaultExperiences = [
  { id: crypto.randomUUID(), place: "Edinburgh Castle", rating: 5, text: "Go before 10 AM. The entrance area gets crowded, and the uphill approach can take longer than expected.", audience: "Travelers with mobility needs", anonymous: true },
  { id: crypto.randomUUID(), place: "Chicago Riverwalk", rating: 4, text: "Weekday mornings are quieter. Several cafés have easy seating and restroom access.", audience: "Everyone", anonymous: true }
];

const saved = readJSON(STORAGE_KEY, null) || {
  profile: readJSON("aitd_profile", {}),
  trip: readJSON("aitd_trip", null),
  experiences: readJSON("aitd_experiences", null)
};
const state = {
  profile: { ...defaultProfile, ...(saved.profile || {}) },
  trip: saved.trip || null,
  experiences: Array.isArray(saved.experiences) ? saved.experiences : defaultExperiences,
  user: null,
  cloudConfigured: false,
  syncTimer: null,
  mapQuery: saved.mapQuery || "historic architecture",
  currentView: "homeView"
};

const activityCatalog = [
  { name: "Old town architecture walk", category: "Architecture", time: "9:00 AM", cost: 0, icon: "⌂", note: "Begin early for quiet streets and softer light." },
  { name: "City history museum", category: "History", time: "11:00 AM", cost: 22, icon: "▥", note: "A focused introduction to the city and its people." },
  { name: "Central market lunch", category: "Local culture", time: "1:00 PM", cost: 24, icon: "◇", note: "Local food choices close to public transportation." },
  { name: "Riverside neighborhood", category: "Quiet places", time: "3:30 PM", cost: 0, icon: "≈", note: "A flexible, low-pressure afternoon stop." },
  { name: "Landmark interior tour", category: "Architecture", time: "10:00 AM", cost: 18, icon: "△", note: "Reserve enough time to study the building details." },
  { name: "Public square and civic district", category: "History", time: "2:00 PM", cost: 0, icon: "□", note: "Easy to reach by transit and simple to shorten." },
  { name: "Independent local restaurant", category: "Food", time: "6:30 PM", cost: 32, icon: "○", note: "Food-focused option with no alcohol-centered activity." },
  { name: "Flexible indoor alternative", category: "Backup", time: "4:00 PM", cost: 12, icon: "✦", note: "Use this when weather or energy changes the plan." }
];

const views = [...document.querySelectorAll(".view")];
const navItems = [...document.querySelectorAll(".nav-item")];

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; }
  catch { return fallback; }
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ profile: state.profile, trip: state.trip, experiences: state.experiences, mapQuery: state.mapQuery }));
}

function cloudPayload() {
  return {
    name: state.user?.displayName || state.profile.name || "",
    email: state.user?.email || "",
    photoURL: state.user?.photoURL || "",
    profile: state.profile,
    trip: state.trip,
    experiences: state.experiences
  };
}

function setCloudBanner(text, mode = "") {
  const banner = document.getElementById("cloudBanner");
  banner.textContent = text;
  banner.className = `banner cloud ${mode}`.trim();
}

function toast(message) {
  const element = document.getElementById("toast");
  element.textContent = message;
  element.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("visible"), 2300);
}

function showView(viewId) {
  state.currentView = viewId;
  views.forEach(view => view.classList.toggle("active", view.id === viewId));
  navItems.forEach(item => item.classList.toggle("active", item.dataset.viewLink === viewId));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (viewId === "plannerView") initializeChat();
  if (viewId === "itineraryView") renderItinerary();
  if (viewId === "exploreView") renderMap();
}

function scheduleSave() {
  saveLocalState();
  clearTimeout(state.syncTimer);
  state.syncTimer = setTimeout(() => syncToCloud({ silent: true }), 700);
}

async function syncToCloud({ silent = false } = {}) {
  saveLocalState();
  if (!state.user || !state.cloudConfigured || !navigator.onLine) {
    if (!silent) toast("Saved on this device");
    return;
  }
  try {
    setCloudBanner("Synchronizing your travel data…", "connected");
    await saveCloudState(state.user.uid, cloudPayload());
    setCloudBanner("Cloud connected · Your travel data is synchronized.", "connected");
    if (!silent) toast("Cloud data synchronized");
  } catch (error) {
    console.error(error);
    setCloudBanner("Cloud sync failed · Your device copy is still safe.", "error");
    if (!silent) toast("Cloud sync failed");
  }
}

function normalizeInterests(value) {
  return Array.isArray(value) ? value.join(", ") : String(value || "history, architecture, local culture");
}

function renderHome() {
  const title = document.getElementById("homeHeading");
  const summary = document.getElementById("tripSummary");
  const metric = document.getElementById("homeTripMetric");
  if (state.trip) {
    title.textContent = state.trip.destination;
    summary.textContent = `${state.trip.days}-day working itinerary · $${Number(state.trip.budget || 0).toLocaleString("en-US")} budget · no bookings made`;
    metric.textContent = `${state.trip.days} days in ${state.trip.destination}`;
  } else {
    title.textContent = "Where should we go next?";
    summary.textContent = "Describe the trip you want. Your AI director will shape the route around your budget, pace, history, and architecture interests.";
    metric.textContent = "No active trip";
  }
}

function renderRecommendations() {
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

function renderCommunity() {
  const list = document.getElementById("communityList");
  list.innerHTML = state.experiences.slice(-4).reverse().map(item => `
    <article class="info-card"><h3>${escapeHTML(item.place)} · ${"★".repeat(Math.max(1, Number(item.rating) || 1))}</h3><p>${escapeHTML(item.text)}</p><div class="tag-row"><span class="tag">${escapeHTML(item.audience)}</span><span class="tag">Traveler-reported</span></div></article>
  `).join("");
}

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

function parseDestination(text) {
  const patterns = [/(?:in|to|visit|for)\s+([A-Z][\p{L}' -]+?)(?:\s+(?:under|for|with|from|on|by|and)\b|[,.]|$)/iu, /^([A-Z][\p{L}' -]+?)(?:\s+for\s+|,|$)/u];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "Your destination";
}

function parseDays(text) {
  const match = text.match(/(\d+)\s*(?:-| )?(?:day|night)/i);
  return Math.max(1, Math.min(Number(match?.[1] || 4), 10));
}

function parseBudget(text) {
  const dollar = text.match(/\$\s*([\d,]+)/);
  const phrased = text.match(/(?:under|budget(?:\s+of)?|maximum|max)\s*\$?\s*([\d,]+)/i);
  return Number((dollar?.[1] || phrased?.[1] || state.profile.budget || 1500).replace?.(/,/g, "") || state.profile.budget);
}

function buildLocalTrip(text) {
  const destination = parseDestination(text);
  const days = parseDays(text);
  const budget = parseBudget(text);
  const itinerary = Array.from({ length: days }, (_, dayIndex) => {
    const offset = (dayIndex * 2) % activityCatalog.length;
    const dayActivities = [activityCatalog[offset], activityCatalog[(offset + 1) % activityCatalog.length], activityCatalog[(offset + 2) % activityCatalog.length]];
    return {
      day: dayIndex + 1,
      title: dayIndex === 0 ? "Arrival and orientation" : dayIndex === days - 1 ? "Flexible final day" : `${dayActivities[0].category} and local discovery`,
      items: dayActivities.map((activity, index) => ({ ...activity, id: crypto.randomUUID(), time: index === 0 ? "9:30 AM" : index === 1 ? "1:00 PM" : "4:00 PM", done: false }))
    };
  });
  return { destination, days, budget, itinerary, sourceRequest: text, generatedBy: "local", createdAt: new Date().toISOString() };
}

function normalizeAITrip(result, sourceRequest) {
  const raw = result?.trip || result;
  const days = Array.isArray(raw?.itinerary) ? raw.itinerary.slice(0, 10) : [];
  return {
    destination: String(raw?.destination || parseDestination(sourceRequest)),
    days: Math.max(1, Math.min(Number(raw?.days || days.length || parseDays(sourceRequest)), 10)),
    budget: Number(raw?.budget || parseBudget(sourceRequest)),
    sourceRequest,
    generatedBy: "openai",
    createdAt: new Date().toISOString(),
    itinerary: days.map((day, dayIndex) => ({
      day: Number(day.day || dayIndex + 1),
      title: String(day.title || `Day ${dayIndex + 1}`),
      items: (Array.isArray(day.items) ? day.items : []).slice(0, 5).map((item, itemIndex) => ({
        id: crypto.randomUUID(), time: String(item.time || `${9 + itemIndex * 2}:00`), name: String(item.name || "Planned activity"), note: String(item.reason || item.note || "Matched to your travel preferences."), category: String(item.category || "AI plan"), cost: Number(item.cost || 0), done: false
      }))
    }))
  };
}

async function createTripFromRequest(text) {
  if (state.user && state.cloudConfigured && navigator.onLine) {
    const result = await requestAITrip({ request: text, profile: state.profile, communityInsights: state.experiences.slice(-8) });
    return { trip: normalizeAITrip(result, text), message: result.message || "I created a personalized draft itinerary. No bookings were made." };
  }
  const trip = buildLocalTrip(text);
  return { trip, message: `I created a ${trip.days}-day working plan for ${trip.destination} with a $${trip.budget.toLocaleString("en-US")} budget. It prioritizes ${normalizeInterests(state.profile.interests)}, a ${state.profile.pace} pace, and short walking segments. No bookings were made.` };
}

function tripTotals() {
  const items = state.trip?.itinerary?.flatMap(day => day.items || []) || [];
  return { items: items.length, completed: items.filter(item => item.done).length, planned: items.reduce((sum, item) => sum + Number(item.cost || 0), 0) };
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
    <article class="trip-summary-card"><p class="eyebrow light">${state.trip.generatedBy === "openai" ? "AI-GENERATED DRAFT" : "WORKING ITINERARY"}</p><h2>${escapeHTML(state.trip.destination)}</h2><p>${state.trip.days} days · Purchases and live availability are not verified.</p><div class="trip-stats"><div class="trip-stat"><small>ACTIVITIES</small><strong>${totals.items}</strong></div><div class="trip-stat"><small>EST. PLAN</small><strong>$${totals.planned.toLocaleString("en-US")}</strong></div><div class="trip-stat"><small>BUDGET</small><strong>$${budget.toLocaleString("en-US")}</strong></div></div><div class="budget-bar" aria-label="${budgetPercent}% of working budget represented by listed activity estimates"><span style="width:${budgetPercent}%"></span></div></article>
    <div class="day-tabs">${state.trip.itinerary.map(day => `<button class="day-tab" data-scroll-day="${day.day}">Day ${day.day}</button>`).join("")}</div>
    ${state.trip.itinerary.map(day => `<section class="day-card" id="tripDay${day.day}"><p class="eyebrow">DAY ${day.day}</p><h3>${escapeHTML(day.title)}</h3>${(day.items || []).map((item, index) => `
      <article class="timeline-item ${item.done ? "done" : ""}" data-item-id="${item.id}"><div class="timeline-time">${escapeHTML(item.time)}</div><div class="timeline-main"><strong>${escapeHTML(item.name)}</strong><p>${escapeHTML(item.note || item.category || "Flexible plan item")}</p></div><div class="timeline-actions"><button class="mini-button" data-trip-action="toggle" title="Mark complete">✓</button><button class="mini-button" data-trip-action="map" title="Open on map">⌖</button>${index > 0 ? '<button class="mini-button" data-trip-action="up" title="Move earlier">↑</button>' : ""}</div></article>
    `).join("")}</section>`).join("")}
  `;
}

function findTripItem(itemId) {
  for (const day of state.trip?.itinerary || []) {
    const index = day.items.findIndex(item => item.id === itemId);
    if (index >= 0) return { day, index, item: day.items[index] };
  }
  return null;
}

function currentDestination() {
  return state.trip?.destination && state.trip.destination !== "Your destination" ? state.trip.destination : "your destination";
}

let mapRequestId = 0;

async function updateMap(query) {
  const normalized = String(query || currentDestination()).trim();
  state.mapQuery = normalized;
  saveLocalState();
  const destination = state.trip?.destination && state.trip.destination !== "Your destination" ? state.trip.destination : "";
  const fullQuery = !destination || normalized.toLowerCase().includes(destination.toLowerCase()) ? normalized : `${normalized} in ${destination}`;
  const requestId = ++mapRequestId;
  const canvas = document.getElementById("mapCanvas");
  const fallback = document.getElementById("mapFallback");

  document.getElementById("mapLabelText").textContent = `Finding ${fullQuery}…`;
  document.getElementById("mapSearchInput").value = normalized;
  renderPlaces(normalized);

  try {
    canvas.hidden = false;
    fallback.hidden = true;
    const resolvedLabel = await renderGoogleMap(canvas, fullQuery);
    if (requestId !== mapRequestId) return;
    document.getElementById("mapLabelText").textContent = resolvedLabel;
  } catch (error) {
    if (requestId !== mapRequestId) return;
    console.warn("Interactive Maps view unavailable; using embedded fallback.", error);
    canvas.hidden = true;
    fallback.hidden = false;
    fallback.src = `https://www.google.com/maps?q=${encodeURIComponent(fullQuery)}&output=embed`;
    document.getElementById("mapLabelText").textContent = fullQuery;
  }
}

function renderMap() {
  updateMap(state.mapQuery || currentDestination());
}

function renderPlaces(query) {
  const destination = currentDestination();
  const queryText = String(query || "").toLowerCase();
  const ranked = [...activityCatalog].sort((a, b) => Number(`${a.name} ${a.category}`.toLowerCase().includes(queryText)) - Number(`${b.name} ${b.category}`.toLowerCase().includes(queryText))).reverse().slice(0, 4);
  document.getElementById("mapResultCount").textContent = `${ranked.length} ideas`;
  document.getElementById("placeList").innerHTML = ranked.map(place => {
    const destinationQuery = `${place.name}, ${destination}`;
    const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destinationQuery)}`;
    return `<article class="place-card"><span class="place-pin">${place.icon}</span><div><strong>${escapeHTML(place.name)}</strong><p>${escapeHTML(place.category)} · ${place.cost ? `$${place.cost} estimate` : "Free"}</p></div><div class="place-actions"><button class="icon-action" data-add-place="${escapeHTML(place.name)}" data-place-category="${escapeHTML(place.category)}" data-place-cost="${place.cost}" title="Add to trip">＋</button><a class="icon-action" href="${directions}" target="_blank" rel="noopener" title="Directions">↗</a></div></article>`;
  }).join("");
}

function addPlaceToTrip(name, category, cost) {
  if (!state.trip) {
    toast("Plan a destination before adding places");
    showView("plannerView");
    return;
  }
  const day = state.trip.itinerary[0];
  day.items.push({ id: crypto.randomUUID(), time: "Flexible", name, category, cost: Number(cost || 0), note: "Saved from Explore. Confirm hours and availability before visiting.", done: false });
  scheduleSave();
  renderHome();
  toast("Added to your trip");
}

function hydrateProfileForm() {
  const fields = { profileName: state.profile.name, profileLanguage: state.profile.language, profileInterests: normalizeInterests(state.profile.interests), profileBudget: state.profile.budget, profilePace: state.profile.pace, profileDiet: state.profile.diet, profileWalking: state.profile.walking };
  Object.entries(fields).forEach(([id, value]) => { const element = document.getElementById(id); if (element) element.value = value ?? ""; });
  document.querySelectorAll(".travelStyle").forEach(input => { input.checked = (state.profile.travelStyles || []).includes(input.value); });
  document.getElementById("aiPreference").value = state.profile.aiPreference;
  document.querySelectorAll(".ai-choice").forEach(button => button.classList.toggle("selected", button.dataset.value === state.profile.aiPreference));
  updateAccountUI();
}

function updateAccountUI() {
  const initials = (state.user?.displayName || state.profile.name || "Traveler").split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
  document.querySelectorAll(".avatar-button, .account-avatar").forEach(element => { element.textContent = initials || "T"; });
  document.getElementById("accountName").textContent = state.user?.displayName || state.profile.name || "Your travel profile";
  document.getElementById("accountEmail").textContent = state.user?.email || (state.cloudConfigured ? "Not signed in" : "Saved on this device");
  document.getElementById("authButton").textContent = state.user ? "Sign out" : "Connect cloud";
}

async function handleAuthenticatedUser(user) {
  state.user = user;
  updateAccountUI();
  if (!user) {
    setCloudBanner(state.cloudConfigured ? "Cloud ready · Connect your account to synchronize data and use secure AI." : "Local travel mode · Cloud connection is ready to configure.");
    return;
  }
  setCloudBanner("Loading your cloud travel data…", "connected");
  try {
    const cloud = await loadCloudState(user.uid);
    if (cloud) {
      state.profile = { ...defaultProfile, ...(cloud.profile || {}) };
      state.trip = cloud.trip ?? state.trip;
      if (Array.isArray(cloud.experiences)) state.experiences = cloud.experiences;
      saveLocalState();
      hydrateProfileForm();
      renderAll();
    }
    await syncToCloud({ silent: true });
  } catch (error) {
    console.error(error);
    setCloudBanner("Signed in, but cloud data could not be loaded. Local mode remains available.", "error");
  }
}

function bindViewLinks(root = document) {
  root.querySelectorAll("[data-view-link]").forEach(button => {
    if (button.dataset.bound) return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => showView(button.dataset.viewLink));
  });
}

function renderAll() {
  renderHome();
  renderRecommendations();
  renderCommunity();
  renderItinerary();
}

bindViewLinks();
document.getElementById("startPlanningButton").addEventListener("click", () => showView("plannerView"));
document.getElementById("profileButton").addEventListener("click", () => showView("profileView"));
document.getElementById("shareExperienceButton").addEventListener("click", () => showView("communityView"));
document.getElementById("refreshRecommendations").addEventListener("click", () => { renderRecommendations(); toast("Recommendations refreshed"); });

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
    const result = await createTripFromRequest(text);
    state.trip = result.trip;
    state.mapQuery = state.trip.destination;
    scheduleSave();
    pending.textContent = result.message;
    pending.classList.remove("pending");
    renderAll();
  } catch (error) {
    console.error(error);
    pending.textContent = `I could not reach the secure AI service. ${error.message || "Please try again."}`;
    pending.classList.remove("pending");
  } finally { submit.disabled = false; }
});

document.getElementById("mapSearchForm").addEventListener("submit", event => { event.preventDefault(); const query = document.getElementById("mapSearchInput").value.trim(); if (query) updateMap(query); });
document.querySelectorAll(".filter-chip").forEach(button => button.addEventListener("click", () => { document.querySelectorAll(".filter-chip").forEach(item => item.classList.remove("active")); button.classList.add("active"); updateMap(button.dataset.mapFilter); }));
document.getElementById("placeList").addEventListener("click", event => { const button = event.target.closest("[data-add-place]"); if (button) addPlaceToTrip(button.dataset.addPlace, button.dataset.placeCategory, button.dataset.placeCost); });
document.getElementById("locateMeButton").addEventListener("click", () => {
  if (!navigator.geolocation) return toast("Location is unavailable in this browser");
  navigator.geolocation.getCurrentPosition(position => updateMap(`${position.coords.latitude.toFixed(5)},${position.coords.longitude.toFixed(5)}`), () => toast("Location permission was not granted"), { enableHighAccuracy: true, timeout: 10000 });
});

document.getElementById("itineraryContent").addEventListener("click", event => {
  const dayButton = event.target.closest("[data-scroll-day]");
  if (dayButton) document.getElementById(`tripDay${dayButton.dataset.scrollDay}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const action = event.target.closest("[data-trip-action]");
  if (!action) return;
  const row = action.closest("[data-item-id]");
  const found = findTripItem(row.dataset.itemId);
  if (!found) return;
  if (action.dataset.tripAction === "toggle") found.item.done = !found.item.done;
  if (action.dataset.tripAction === "up" && found.index > 0) [found.day.items[found.index - 1], found.day.items[found.index]] = [found.day.items[found.index], found.day.items[found.index - 1]];
  if (action.dataset.tripAction === "map") { state.mapQuery = `${found.item.name} in ${state.trip.destination}`; showView("exploreView"); return; }
  scheduleSave();
  renderItinerary();
});

document.getElementById("clearTripButton").addEventListener("click", () => { state.trip = null; scheduleSave(); renderAll(); toast("Trip cleared"); });

document.querySelectorAll(".ai-choice").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".ai-choice").forEach(item => item.classList.remove("selected"));
  button.classList.add("selected");
  document.getElementById("aiPreference").value = button.dataset.value;
}));

document.getElementById("profileForm").addEventListener("submit", event => {
  event.preventDefault();
  state.profile = {
    ...state.profile,
    name: document.getElementById("profileName").value.trim(),
    language: document.getElementById("profileLanguage").value.trim() || "English",
    interests: document.getElementById("profileInterests").value.trim() || "history, architecture, local culture",
    travelStyles: [...document.querySelectorAll(".travelStyle:checked")].map(input => input.value),
    budget: Number(document.getElementById("profileBudget").value || 1500),
    pace: document.getElementById("profilePace").value,
    diet: document.getElementById("profileDiet").value.trim(),
    walking: Number(document.getElementById("profileWalking").value || 20),
    aiPreference: document.getElementById("aiPreference").value || "Suggestions only"
  };
  scheduleSave();
  hydrateProfileForm();
  renderRecommendations();
  toast("Profile saved");
  showView("homeView");
});
document.getElementById("syncButton").addEventListener("click", () => syncToCloud({ silent: false }));

document.getElementById("authButton").addEventListener("click", async () => {
  if (!state.cloudConfigured) return toast("Firebase configuration is needed before cloud sign-in");
  try { if (state.user) await signOutUser(); else await signInGoogle(); }
  catch (error) { console.error(error); toast(error.message || "Cloud sign-in could not be completed"); }
});

document.getElementById("experiencePhotos").addEventListener("change", event => {
  const files = [...event.target.files].slice(0, 3);
  document.getElementById("photoStatus").textContent = files.length ? `${files.length} photo${files.length === 1 ? "" : "s"} ready to upload.` : "Up to 3 photos. AI can help describe the experience when cloud mode is connected.";
});

document.getElementById("experienceForm").addEventListener("submit", async event => {
  event.preventDefault();
  const submit = event.submitter;
  submit.disabled = true;
  const files = [...document.getElementById("experiencePhotos").files].slice(0, 3);
  try {
    let photoURLs = [];
    let photoAnalysis = null;
    if (files.length && state.user && state.cloudConfigured) {
      document.getElementById("photoStatus").textContent = "Uploading and analyzing photos…";
      photoURLs = await uploadExperiencePhotos(state.user.uid, files);
      if (photoURLs[0]) photoAnalysis = await requestPhotoAnalysis(photoURLs[0]);
    }
    state.experiences.push({
      id: crypto.randomUUID(),
      place: document.getElementById("experiencePlace").value.trim(),
      rating: Number(document.getElementById("experienceRating").value),
      text: document.getElementById("experienceText").value.trim(),
      audience: document.getElementById("experienceAudience").value,
      anonymous: document.getElementById("experienceAnonymous").checked,
      photoURLs,
      photoAnalysis,
      createdAt: new Date().toISOString()
    });
    scheduleSave();
    event.target.reset();
    document.getElementById("experienceAnonymous").checked = true;
    document.getElementById("photoStatus").textContent = "Up to 3 photos. AI can help describe the experience when cloud mode is connected.";
    renderCommunity();
    toast(files.length && !state.user ? "Experience saved; connect cloud to upload photos" : "Experience saved");
    showView("homeView");
  } catch (error) { console.error(error); toast(error.message || "The experience could not be saved"); }
  finally { submit.disabled = false; }
});

function setSafety(html) { document.getElementById("safetyOutput").innerHTML = html; }
document.getElementById("shareLocationButton").addEventListener("click", () => {
  if (!navigator.geolocation) return setSafety("<strong>Location unavailable.</strong> This browser does not support geolocation.");
  setSafety("<strong>Requesting location permission…</strong>");
  navigator.geolocation.getCurrentPosition(position => {
    const coordinates = `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`;
    setSafety(`<strong>Location found.</strong><br>${coordinates}<br><button id="openCurrentMap" class="text-button">Open this area on the map</button>`);
    document.getElementById("openCurrentMap").addEventListener("click", () => { state.mapQuery = coordinates; showView("exploreView"); });
  }, () => setSafety("<strong>Location permission was not granted.</strong> You can enable it in your browser settings."));
});
document.getElementById("lostButton").addEventListener("click", () => setSafety("<strong>If you are lost:</strong><br>Stay in a well-lit public place. Identify a nearby landmark. Ask staff at a hotel, station, or official venue for help. Use the location tool above to open your current area on the map."));
document.getElementById("unsafeButton").addEventListener("click", () => setSafety("<strong>Immediate safety guidance:</strong><br>Move toward a staffed public place. Contact local emergency services if there is immediate danger. Tell a trusted contact where you are. This app is not an emergency-response service."));
document.getElementById("checkInButton").addEventListener("click", () => setSafety(`<strong>Checked in safely.</strong><br>${new Date().toLocaleString("en-US")}`));

let deferredInstallPrompt = null;
const installButton = document.getElementById("installButton");
const connectionBanner = document.getElementById("connectionBanner");
function updateConnectionState() { connectionBanner.hidden = navigator.onLine; }
window.addEventListener("online", updateConnectionState);
window.addEventListener("offline", updateConnectionState);
window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); deferredInstallPrompt = event; installButton.hidden = false; });
installButton.addEventListener("click", async () => { if (!deferredInstallPrompt) return toast("Use your browser menu to add this app to your home screen"); deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; installButton.hidden = true; });
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(error => console.warn("Service worker unavailable", error)));

async function initializeApp() {
  hydrateProfileForm();
  renderAll();
  updateConnectionState();
  try {
    const cloud = await initializeCloud();
    state.cloudConfigured = cloud.configured;
    if (cloud.configured) observeAuth(handleAuthenticatedUser);
    else handleAuthenticatedUser(null);
  } catch (error) {
    console.error(error);
    setCloudBanner("Cloud setup could not start · Local travel mode remains available.", "error");
  }
}

initializeApp();
