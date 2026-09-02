import {
  initializeCloud,
  observeAuth,
  signInGoogle,
  signOutUser,
  loadCloudState,
  saveCloudState,
  loadCommunityFeed,
  publishCommunityExperience,
  loadCommunityActions,
  setCommunityHelpful,
  reportCommunityExperience,
  savePublicTravelerProfile,
  loadPublicTravelerProfile,
  requestAITrip,
  uploadExperiencePhotos,
  requestPhotoAnalysis,
  trackAppEvent
} from "./firebase-client.js?v=10";
import { renderGoogleMap } from "./maps.js?v=10";

const STORAGE_KEY = "aitd_v3_state";
const ONBOARDING_KEY = "aitd_onboarding_v1";
const returningVisitor = Boolean(localStorage.getItem(STORAGE_KEY));
const defaultProfile = {
  name: "Chris",
  language: "English",
  interests: "history, architecture, local culture",
  travelStyles: ["Independent", "Public transit", "Budget aware"],
  budget: 1500,
  pace: "balanced",
  diet: "No alcohol",
  walking: 20,
  aiPreference: "Suggestions only",
  publicProfileVisible: true,
  publicHomeBase: "",
  publicTravelStyle: "",
  publicBio: ""
};

const defaultExperiences = [
  { id: crypto.randomUUID(), place: "Edinburgh Castle", rating: 5, text: "Go before 10 AM. The entrance area gets crowded, and the uphill approach can take longer than expected.", audience: "Travelers with mobility needs", anonymous: true },
  { id: crypto.randomUUID(), place: "Chicago Riverwalk", rating: 4, text: "Weekday mornings are quieter. Several cafés have easy seating and restroom access.", audience: "Everyone", anonymous: true }
];

const saved = readJSON(STORAGE_KEY, null) || {
  profile: readJSON("aitd_profile", {}),
  trip: readJSON("aitd_trip", null),
  experiences: readJSON("aitd_experiences", null),
  collections: []
};
const state = {
  profile: { ...defaultProfile, ...(saved.profile || {}) },
  trip: saved.trip || null,
  experiences: Array.isArray(saved.experiences) ? saved.experiences : defaultExperiences,
  communityPosts: [],
  communityLoaded: false,
  communityLoading: false,
  communityCursor: null,
  communityHasMore: false,
  communitySearch: "",
  communityAudience: "All travelers",
  helpfulIds: new Set(),
  reportedIds: new Set(),
  collections: Array.isArray(saved.collections) ? saved.collections : [],
  activeCollectionPostId: "",
  isReplanningCommunity: false,
  user: null,
  cloudConfigured: false,
  syncTimer: null,
  mapQuery: saved.mapQuery || "historic architecture",
  currentView: "homeView",
  onboardingStep: 0
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

function safeImageURL(value) {
  try {
    const url = new URL(String(value || ""), window.location.href);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ profile: state.profile, trip: state.trip, experiences: state.experiences, collections: state.collections, mapQuery: state.mapQuery }));
}

function cloudPayload() {
  return {
    name: state.user?.displayName || state.profile.name || "",
    email: state.user?.email || "",
    photoURL: state.user?.photoURL || "",
    profile: state.profile,
    trip: state.trip,
    experiences: state.experiences,
    collections: state.collections
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
  trackAppEvent("view_opened", { view_name: viewId.replace("View", "") });
  views.forEach(view => view.classList.toggle("active", view.id === viewId));
  navItems.forEach(item => item.classList.toggle("active", item.dataset.viewLink === viewId));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (viewId === "plannerView") initializeChat();
  if (viewId === "itineraryView") renderItinerary();
  if (viewId === "collectionsView") renderCollections();
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

function trackAppError(surface, error) {
  trackAppEvent("app_error", { source: surface, status: error?.name || "error", online: navigator.onLine });
}

function normalizeInterests(value) {
  return Array.isArray(value) ? value.join(", ") : String(value || "history, architecture, local culture");
}

function renderHome() {
  const title = document.getElementById("homeHeading");
  const summary = document.getElementById("tripSummary");
  const metric = document.getElementById("homeTripMetric");
  const collectionsMetric = document.getElementById("homeCollectionsMetric");
  const savedCount = state.collections.reduce((total, collection) => total + (collection.items || []).length, 0);
  if (collectionsMetric) collectionsMetric.textContent = savedCount ? `${savedCount} saved place${savedCount === 1 ? "" : "s"}` : "Nothing saved yet";
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

function communityItems() {
  return state.communityLoaded ? state.communityPosts : state.experiences.slice(-4).reverse();
}

function filteredCommunityItems() {
  const search = state.communitySearch.trim().toLocaleLowerCase();
  return communityItems().filter(item => {
    const matchesSearch = !search || `${item.place || ""} ${item.text || ""}`.toLocaleLowerCase().includes(search);
    const matchesAudience = state.communityAudience === "All travelers" || item.audience === state.communityAudience;
    return matchesSearch && matchesAudience;
  });
}

function renderCommunity() {
  const list = document.getElementById("communityList");
  const items = filteredCommunityItems();
  if (state.communityLoading && !communityItems().length) {
    list.innerHTML = `<div class="community-state"><span class="ai-pulse" aria-hidden="true">✦</span><strong>Loading traveler insights…</strong></div>`;
    return;
  }
  if (!items.length) {
    list.innerHTML = `<div class="community-state"><span class="metric-icon" aria-hidden="true">◇</span><strong>No matching insights yet</strong><p>Adjust the filters or share the first experience for this destination.</p></div>`;
  } else list.innerHTML = items.map(item => {
    const photos = (Array.isArray(item.photoURLs) ? item.photoURLs : []).map(safeImageURL).filter(Boolean);
    const description = String(item.photoAnalysis?.description || item.text || `${item.place || "Travel experience"} photo`);
    const helpful = state.helpfulIds.has(String(item.id));
    const reported = state.reportedIds.has(String(item.id));
    const savedInTrip = Boolean(state.trip?.itinerary?.some(day => (day.items || []).some(tripItem => String(tripItem.communityPostId || "") === String(item.id))));
    const savedInCollection = state.collections.some(collection => (collection.items || []).some(savedItem => String(savedItem.postId) === String(item.id)));
    const createdDate = item.createdAt ? new Date(item.createdAt) : null;
    const dateLabel = createdDate && !Number.isNaN(createdDate.valueOf()) ? createdDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Recent insight";
    const gallery = photos.length ? `
      <div class="community-photo-grid photo-count-${Math.min(photos.length, 3)}" aria-label="${photos.length} traveler photo${photos.length === 1 ? "" : "s"}">
        ${photos.map((photoURL, photoIndex) => `
          <button class="community-photo-button" type="button" data-experience-id="${escapeHTML(item.id)}" data-photo-index="${photoIndex}" aria-label="Open photo ${photoIndex + 1} of ${photos.length} from ${escapeHTML(item.place)}">
            <img src="${escapeHTML(photoURL)}" alt="${escapeHTML(description)}" loading="lazy" />
          </button>
        `).join("")}
      </div>
    ` : "";
    return `
      <article class="info-card community-card">
        ${gallery}
        <div class="community-card-copy">
          <h3>${escapeHTML(item.place)} · ${"★".repeat(Math.max(1, Number(item.rating) || 1))}</h3>
          <div class="community-byline">${!item.anonymous && item.ownerId ? `<button class="traveler-profile-link" type="button" data-traveler-profile="${escapeHTML(item.id)}">${escapeHTML(item.authorName || "Traveler")}</button>` : `<span>${escapeHTML(item.authorName || "Anonymous traveler")}</span>`}<span aria-hidden="true">·</span><time>${escapeHTML(dateLabel)}</time></div>
          <p>${escapeHTML(item.text)}</p>
          <div class="tag-row"><span class="tag">${escapeHTML(item.audience)}</span><span class="tag">Traveler-reported</span></div>
          <div class="community-actions">
            <button class="insight-action primary-insight-action${savedInTrip ? " selected" : ""}" type="button" data-community-save="${escapeHTML(item.id)}" ${savedInTrip ? "disabled" : ""}>${savedInTrip ? "✓ In your trip" : state.trip ? "＋ Add to trip" : "✦ Plan with this"}</button>
            <button class="insight-action${savedInCollection ? " selected" : ""}" type="button" data-save-collection="${escapeHTML(item.id)}">${savedInCollection ? "★ Saved" : "☆ Save"}</button>
            <button class="insight-action${helpful ? " selected" : ""} type="button" data-community-helpful="${escapeHTML(item.id)}" aria-pressed="${helpful}" ${item.isShared ? "" : "disabled"}>${helpful ? "✓ Helpful" : "♡ Helpful"}</button>
            <button class="insight-action" type="button" data-community-map="${escapeHTML(item.place)}">⌖ View on map</button>
            <button class="insight-action report" type="button" data-community-report="${escapeHTML(item.id)}" ${!item.isShared || reported ? "disabled" : ""}>${reported ? "Reported" : "Report"}</button>
          </div>
        </div>
      </article>
    `;
  }).join("");

  const loadMore = document.getElementById("communityLoadMore");
  loadMore.hidden = !state.communityLoaded || !state.communityHasMore || Boolean(state.communitySearch) || state.communityAudience !== "All travelers";
  loadMore.disabled = state.communityLoading;
  document.getElementById("communityResultSummary").textContent = state.communityLoaded
    ? `${items.length} shared insight${items.length === 1 ? "" : "s"}${state.communityHasMore ? " loaded" : ""}`
    : "Showing saved examples until the shared feed connects";
}

function collectionById(collectionId) {
  return state.collections.find(collection => String(collection.id) === String(collectionId));
}

function openCollectionDialog(experienceId = "") {
  state.activeCollectionPostId = String(experienceId || "");
  const experience = experienceId ? communityExperienceById(experienceId) : null;
  const dialog = document.getElementById("collectionDialog");
  document.getElementById("collectionDialogTitle").textContent = experience ? "Choose a collection" : "Create a collection";
  document.getElementById("collectionDialogPlace").textContent = experience ? experience.place : "Create a private list for places you want to remember.";
  const select = document.getElementById("collectionSelect");
  select.innerHTML = state.collections.length ? state.collections.map(collection => `<option value="${escapeHTML(collection.id)}">${escapeHTML(collection.name)} · ${(collection.items || []).length}</option>`).join("") : '<option value="">Saved places</option>';
  document.getElementById("existingCollectionLabel").hidden = !experience || !state.collections.length;
  document.getElementById("newCollectionName").value = "";
  if (!dialog.open) dialog.showModal();
}

function savedCommunitySnapshot(experience) {
  const photos = (Array.isArray(experience.photoURLs) ? experience.photoURLs : []).map(safeImageURL).filter(Boolean);
  return { postId: String(experience.id), place: String(experience.place || "Travel recommendation"), text: String(experience.text || ""), rating: Math.max(1, Number(experience.rating) || 1), audience: String(experience.audience || "Everyone"), authorName: String(experience.authorName || (experience.anonymous ? "Anonymous traveler" : "Traveler")), ownerId: experience.anonymous ? "" : String(experience.ownerId || ""), photoURL: photos[0] || experience.photoURL || "", savedAt: new Date().toISOString() };
}

function renderCollections() {
  const list = document.getElementById("collectionsList");
  if (!list) return;
  if (!state.collections.length) {
    list.innerHTML = '<div class="empty-state"><span class="empty-icon">☆</span><h2>No collections yet</h2><p>Save a Community insight or create a collection for a future trip.</p><button class="primary-button" type="button" data-create-collection>Create a collection</button></div>';
    return;
  }
  list.innerHTML = state.collections.map(collection => `
    <section class="collection-card">
      <div class="collection-heading"><div><p class="eyebrow">PRIVATE COLLECTION</p><h2>${escapeHTML(collection.name)}</h2></div><span>${(collection.items || []).length} place${(collection.items || []).length === 1 ? "" : "s"}</span></div>
      ${(collection.items || []).length ? `<div class="collection-items">${collection.items.map(item => `
        <article class="collection-item">
          ${safeImageURL(item.photoURL) ? `<img src="${escapeHTML(safeImageURL(item.photoURL))}" alt="" loading="lazy" />` : '<span class="collection-placeholder" aria-hidden="true">⌖</span>'}
          <div><strong>${escapeHTML(item.place)}</strong><small>${escapeHTML(item.authorName)} · ${"★".repeat(item.rating)}</small><p>${escapeHTML(item.text)}</p></div>
          <div class="collection-item-actions"><button class="mini-button" type="button" data-collection-trip="${escapeHTML(item.postId)}" data-collection-id="${escapeHTML(collection.id)}" title="Add to trip">＋</button><button class="mini-button" type="button" data-collection-map="${escapeHTML(item.place)}" title="View on map">⌖</button><button class="mini-button danger-text" type="button" data-collection-remove="${escapeHTML(item.postId)}" data-collection-id="${escapeHTML(collection.id)}" title="Remove from collection">×</button></div>
        </article>`).join("")}</div>` : '<p class="collection-empty">This collection is ready for your first saved place.</p>'}
    </section>
  `).join("");
}

async function openTravelerProfile(experienceId) {
  const experience = communityExperienceById(experienceId);
  if (!experience || experience.anonymous || !experience.ownerId) return;
  const dialog = document.getElementById("travelerProfileDialog");
  const content = document.getElementById("travelerProfileContent");
  content.innerHTML = '<div class="community-state"><span class="ai-pulse" aria-hidden="true">✦</span><strong>Loading traveler profile…</strong></div>';
  if (!dialog.open) dialog.showModal();
  let profile = null;
  try { profile = await loadPublicTravelerProfile(String(experience.ownerId)); } catch (error) { console.info("Public traveler profile is not available.", error); }
  const recentInsights = communityItems().filter(item => !item.anonymous && String(item.ownerId || "") === String(experience.ownerId)).slice(0, 4);
  const displayName = profile?.displayName || experience.authorName || "Traveler";
  const photoURL = safeImageURL(profile?.photoURL);
  const initials = displayName.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
  content.innerHTML = `
    <header class="traveler-profile-header">
      ${photoURL ? `<img src="${escapeHTML(photoURL)}" alt="" />` : `<span class="traveler-profile-avatar">${escapeHTML(initials || "T")}</span>`}
      <div><p class="eyebrow">TRAVELER PROFILE</p><h2 id="travelerProfileName">${escapeHTML(displayName)}</h2><p>${escapeHTML(profile?.travelStyle || "Community contributor")}</p></div>
    </header>
    ${profile ? `<div class="traveler-profile-details">${profile.homeBase ? `<span>⌖ ${escapeHTML(profile.homeBase)}</span>` : ""}${profile.interests ? `<span>✦ ${escapeHTML(profile.interests)}</span>` : ""}</div><p class="traveler-profile-bio">${escapeHTML(profile.bio || "This traveler has not added a public bio yet.")}</p>` : '<p class="profile-private-note">This traveler keeps their profile private. Their non-anonymous Community insights are still shown below.</p>'}
    <div class="profile-insights"><p class="eyebrow">RECENT INSIGHTS</p>${recentInsights.map(item => `<button type="button" data-profile-map="${escapeHTML(item.place)}"><strong>${escapeHTML(item.place)}</strong><span>${escapeHTML(item.text)}</span></button>`).join("") || "<p>No recent insights are loaded.</p>"}</div>
  `;
}

async function hydrateCommunityActions(items = state.communityPosts) {
  if (!state.user || !items.length) return;
  try {
    const actions = await loadCommunityActions(items.map(item => String(item.id)), state.user.uid);
    actions.helpfulIds.forEach(id => state.helpfulIds.add(String(id)));
    actions.reportedIds.forEach(id => state.reportedIds.add(String(id)));
    renderCommunity();
  } catch (error) {
    console.warn("Community reactions could not be loaded.", error);
  }
}

async function refreshCommunityFeed({ reset = false } = {}) {
  if (!state.cloudConfigured || state.communityLoading) return;
  state.communityLoading = true;
  if (reset) {
    state.communityCursor = null;
    state.communityHasMore = false;
  }
  renderCommunity();
  try {
    const page = await loadCommunityFeed({ cursor: reset ? null : state.communityCursor, pageSize: 8 });
    const known = new Map((reset ? [] : state.communityPosts).map(item => [String(item.id), item]));
    page.items.forEach(item => known.set(String(item.id), item));
    state.communityPosts = [...known.values()];
    state.communityCursor = page.cursor;
    state.communityHasMore = page.hasMore;
    state.communityLoaded = true;
    await hydrateCommunityActions(page.items);
  } catch (error) {
    console.warn("Shared community feed is not available yet.", error);
  } finally {
    state.communityLoading = false;
    renderCommunity();
    renderCommunityMapPicks(state.mapQuery);
  }
}

const communityPhotoDialog = document.getElementById("communityPhotoDialog");
let activeCommunityPhoto = { experienceId: "", index: 0 };

function openCommunityPhoto(experienceId, photoIndex) {
  const experience = communityItems().find(item => String(item.id) === String(experienceId));
  const photos = (Array.isArray(experience?.photoURLs) ? experience.photoURLs : []).map(safeImageURL).filter(Boolean);
  if (!experience || !photos.length) return;

  const index = Math.max(0, Math.min(Number(photoIndex) || 0, photos.length - 1));
  const description = String(experience.photoAnalysis?.description || experience.text || `${experience.place || "Travel experience"} photo`);
  activeCommunityPhoto = { experienceId: String(experience.id), index };

  const fullPhoto = document.getElementById("communityPhotoFull");
  fullPhoto.src = photos[index];
  fullPhoto.alt = description;
  document.getElementById("communityPhotoTitle").textContent = experience.place || "Traveler photo";
  document.getElementById("communityPhotoDescription").textContent = description;
  const travelerNote = document.getElementById("communityPhotoTravelerNote");
  travelerNote.textContent = description === experience.text ? "" : experience.text || "";
  travelerNote.hidden = !travelerNote.textContent;
  document.getElementById("communityPhotoTags").innerHTML = `<span class="tag">${escapeHTML(experience.audience || "Everyone")}</span><span class="tag">${"★".repeat(Math.max(1, Number(experience.rating) || 1))}</span>`;
  document.getElementById("communityPhotoPosition").textContent = photos.length > 1 ? `Photo ${index + 1} of ${photos.length}` : "Traveler-uploaded photo";
  document.getElementById("previousCommunityPhoto").hidden = photos.length < 2;
  document.getElementById("nextCommunityPhoto").hidden = photos.length < 2;

  if (!communityPhotoDialog.open) communityPhotoDialog.showModal();
}

function moveCommunityPhoto(direction) {
  const experience = communityItems().find(item => String(item.id) === activeCommunityPhoto.experienceId);
  const photoCount = (Array.isArray(experience?.photoURLs) ? experience.photoURLs : []).map(safeImageURL).filter(Boolean).length;
  if (!photoCount) return;
  openCommunityPhoto(activeCommunityPhoto.experienceId, (activeCommunityPhoto.index + direction + photoCount) % photoCount);
}

function communityExperienceById(experienceId) {
  return communityItems().find(item => String(item.id) === String(experienceId));
}

function addCommunityExperienceToTrip(experience) {
  if (!state.trip) {
    const prompt = `Plan a trip that includes ${experience.place}. A traveler shared this advice: ${experience.text || "Include this community recommendation."}`;
    document.getElementById("chatInput").value = prompt;
    showView("plannerView");
    document.getElementById("chatInput").focus();
    toast("Tell the AI your dates and budget to plan with this insight");
    return;
  }

  const existing = state.trip.itinerary?.some(day => (day.items || []).some(item => String(item.communityPostId || "") === String(experience.id)));
  if (existing) {
    toast("This community pick is already in your trip");
    return;
  }

  if (!Array.isArray(state.trip.itinerary) || !state.trip.itinerary.length) {
    state.trip.itinerary = [{ day: 1, title: "Community discoveries", items: [] }];
    state.trip.days = Math.max(1, Number(state.trip.days || 1));
  }

  const targetDay = state.trip.itinerary.reduce((best, day) => (day.items || []).length < (best.items || []).length ? day : best, state.trip.itinerary[0]);
  if (!Array.isArray(targetDay.items)) targetDay.items = [];
  targetDay.items.push({
    id: crypto.randomUUID(),
    time: "Flexible",
    name: String(experience.place || "Community recommendation"),
    note: String(experience.text || "Recommended by a traveler in the community."),
    category: "Community pick",
    cost: 0,
    done: false,
    communityPostId: String(experience.id),
    communityRating: Math.max(1, Number(experience.rating) || 1),
    communityAudience: String(experience.audience || "Everyone")
  });

  scheduleSave();
  renderCommunity();
  renderItinerary();
  showView("itineraryView");
  toast(`${experience.place} was added to Day ${targetDay.day}`);
}

function communityTripItems() {
  return (state.trip?.itinerary || []).flatMap(day => (day.items || []).filter(item => item.communityPostId));
}

async function replanCommunityPicks() {
  const picks = communityTripItems();
  if (!picks.length || state.isReplanningCommunity) return;
  if (!state.user || !state.cloudConfigured || !navigator.onLine) {
    toast("Connect your account and go online to fit picks with AI");
    if (!state.user) showView("profileView");
    return;
  }

  state.isReplanningCommunity = true;
  renderItinerary();
  try {
    const existingPlan = (state.trip.itinerary || []).map(day => ({
      day: day.day,
      title: day.title,
      items: (day.items || []).map(item => ({ time: item.time, name: item.name, note: item.note, cost: item.cost }))
    }));
    const request = `Revise my existing ${state.trip.days}-day itinerary for ${state.trip.destination}. Keep suitable existing activities, include every community pick, and place each on the most geographically and practically appropriate day and time. Keep the working budget at ${state.trip.budget}. Existing itinerary: ${JSON.stringify(existingPlan).slice(0, 950)}`;
    const communityInsights = picks.map(item => ({
      place: item.name,
      rating: item.communityRating,
      text: item.note,
      audience: item.communityAudience
    }));
    const result = await requestAITrip({ request, profile: state.profile, communityInsights });
    const originalRequest = state.trip.sourceRequest || request;
    state.trip = normalizeAITrip(result, originalRequest);
    scheduleSave();
    renderAll();
    showView("itineraryView");
    toast("AI fitted your community picks into the trip");
  } catch (error) {
    console.error(error);
    toast(error.message || "AI could not replan the trip");
  } finally {
    state.isReplanningCommunity = false;
    renderItinerary();
  }
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
    const result = await requestAITrip({ request: text, profile: state.profile, communityInsights: communityItems().slice(0, 8) });
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
    <article class="trip-summary-card"><p class="eyebrow light">${state.trip.generatedBy === "openai" ? "AI-GENERATED DRAFT" : "WORKING ITINERARY"}</p><h2>${escapeHTML(state.trip.destination)}</h2><p>${state.trip.days} days · Purchases and live availability are not verified.</p><div class="trip-stats"><div class="trip-stat"><small>ACTIVITIES</small><strong>${totals.items}</strong></div><div class="trip-stat"><small>EST. PLAN</small><strong>${totals.planned.toLocaleString("en-US")}</strong></div><div class="trip-stat"><small>BUDGET</small><strong>${budget.toLocaleString("en-US")}</strong></div></div><div class="budget-bar" aria-label="${budgetPercent}% of working budget represented by listed activity estimates"><span style="width:${budgetPercent}%"></span></div></article>
    ${communityTripItems().length ? `<aside class="community-replan-card"><div><span class="community-replan-icon" aria-hidden="true">✦</span><p><strong>${communityTripItems().length} community pick${communityTripItems().length === 1 ? "" : "s"} saved</strong><small>Let AI choose the best day and time while keeping your travel preferences.</small></p></div><button class="primary-button compact-button" type="button" data-replan-community ${state.isReplanningCommunity ? "disabled" : ""}>${state.isReplanningCommunity ? "Replanning…" : "Fit with AI"}</button></aside>` : ""}
    <div class="day-tabs">${state.trip.itinerary.map(day => `<button class="day-tab" data-scroll-day="${day.day}">Day ${day.day}</button>`).join("")}</div>
    ${state.trip.itinerary.map(day => `<section class="day-card" id="tripDay${day.day}"><p class="eyebrow">DAY ${day.day}</p><h3>${escapeHTML(day.title)}</h3>${(day.items || []).map((item, index) => `
      <article class="timeline-item ${item.done ? "done" : ""}" data-item-id="${item.id}"><div class="timeline-time">${escapeHTML(item.time)}</div><div class="timeline-main"><strong>${escapeHTML(item.name)}</strong>${item.communityPostId ? '<span class="community-source">Community pick</span>' : ""}<p>${escapeHTML(item.note || item.category || "Flexible plan item")}</p></div><div class="timeline-actions"><button class="mini-button" data-trip-action="toggle" title="Mark complete">✓</button><button class="mini-button" data-trip-action="map" title="Open on map">⌖</button>${index > 0 ? '<button class="mini-button" data-trip-action="up" title="Move earlier">↑</button>' : ""}</div></article>
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
    canvas.replaceChildren();
    fallback.hidden = false;
    fallback.src = `https://www.google.com/maps?q=${encodeURIComponent(fullQuery)}&output=embed`;
    document.getElementById("mapLabelText").textContent = `Showing map results for ${fullQuery}`;
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
  renderCommunityMapPicks(query);
}

function renderCommunityMapPicks(query) {
  const list = document.getElementById("communityMapList");
  if (!list) return;
  const queryText = String(query || "").toLocaleLowerCase();
  const items = communityItems()
    .map(item => ({ item, matches: `${item.place || ""} ${item.text || ""}`.toLocaleLowerCase().includes(queryText) }))
    .sort((a, b) => Number(b.matches) - Number(a.matches))
    .slice(0, 3)
    .map(entry => entry.item);
  if (!items.length) {
    list.innerHTML = `<div class="map-community-empty">Community locations will appear here as travelers publish insights.</div>`;
    return;
  }
  list.innerHTML = items.map(item => {
    const photo = (Array.isArray(item.photoURLs) ? item.photoURLs : []).map(safeImageURL).find(Boolean);
    return `<article class="place-card community-map-card">
      ${photo ? `<img src="${escapeHTML(photo)}" alt="" loading="lazy" />` : `<span class="place-pin">◇</span>`}
      <div><strong>${escapeHTML(item.place)}</strong><p>${"★".repeat(Math.max(1, Number(item.rating) || 1))} · ${escapeHTML(item.audience || "Everyone")}</p></div>
      <div class="place-actions"><button class="icon-action" type="button" data-map-community="${escapeHTML(item.place)}" title="Show on map">⌖</button></div>
    </article>`;
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
  const fields = { profileName: state.profile.name, profileLanguage: state.profile.language, profileInterests: normalizeInterests(state.profile.interests), profileBudget: state.profile.budget, profilePace: state.profile.pace, profileDiet: state.profile.diet, profileWalking: state.profile.walking, publicHomeBase: state.profile.publicHomeBase, publicTravelStyle: state.profile.publicTravelStyle, publicBio: state.profile.publicBio };
  Object.entries(fields).forEach(([id, value]) => { const element = document.getElementById(id); if (element) element.value = value ?? ""; });
  document.querySelectorAll(".travelStyle").forEach(input => { input.checked = (state.profile.travelStyles || []).includes(input.value); });
  document.getElementById("publicProfilePrivate").checked = !state.profile.publicProfileVisible;
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
  if (!user) {
    state.helpfulIds.clear();
    state.reportedIds.clear();
    renderCommunity();
  }
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
      if (Array.isArray(cloud.collections)) state.collections = cloud.collections;
      saveLocalState();
      hydrateProfileForm();
      renderAll();
    }
    await syncToCloud({ silent: true });
    await hydrateCommunityActions();
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
  renderCollections();
}

bindViewLinks();
document.getElementById("startPlanningButton").addEventListener("click", () => showView("plannerView"));
document.getElementById("profileButton").addEventListener("click", () => showView("profileView"));
document.getElementById("shareExperienceButton").addEventListener("click", () => showView("communityView"));
document.getElementById("refreshRecommendations").addEventListener("click", () => { renderRecommendations(); toast("Recommendations refreshed"); });
document.getElementById("communitySearch").addEventListener("input", event => { state.communitySearch = event.target.value; renderCommunity(); });
document.getElementById("communityAudienceFilter").addEventListener("change", event => { state.communityAudience = event.target.value; renderCommunity(); });
document.getElementById("communityLoadMore").addEventListener("click", () => refreshCommunityFeed({ reset: false }));

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

document.getElementById("mapSearchForm").addEventListener("submit", event => { event.preventDefault(); const query = document.getElementById("mapSearchInput").value.trim(); if (query) { trackAppEvent("map_search", { method: "typed" }); updateMap(query); } });
document.querySelectorAll(".filter-chip").forEach(button => button.addEventListener("click", () => { document.querySelectorAll(".filter-chip").forEach(item => item.classList.remove("active")); button.classList.add("active"); trackAppEvent("map_search", { method: "category" }); updateMap(button.dataset.mapFilter); }));
document.getElementById("placeList").addEventListener("click", event => { const button = event.target.closest("[data-add-place]"); if (button) addPlaceToTrip(button.dataset.addPlace, button.dataset.placeCategory, button.dataset.placeCost); });
document.getElementById("communityMapList").addEventListener("click", event => { const button = event.target.closest("[data-map-community]"); if (button) { state.mapQuery = button.dataset.mapCommunity; updateMap(state.mapQuery); } });
document.getElementById("locateMeButton").addEventListener("click", () => {
  trackAppEvent("location_permission_prompted", { source: "explore" });
  if (!navigator.geolocation) { trackAppEvent("location_permission_result", { source: "explore", result: "unsupported" }); return toast("Location is unavailable in this browser"); }
  navigator.geolocation.getCurrentPosition(position => { trackAppEvent("location_permission_result", { source: "explore", result: "granted" }); updateMap(`${position.coords.latitude.toFixed(5)},${position.coords.longitude.toFixed(5)}`); }, () => { trackAppEvent("location_permission_result", { source: "explore", result: "denied" }); toast("Location permission was not granted"); }, { enableHighAccuracy: true, timeout: 10000 });
});

document.getElementById("itineraryContent").addEventListener("click", event => {
  const replanButton = event.target.closest("[data-replan-community]");
  if (replanButton) {
    replanCommunityPicks();
    return;
  }
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

document.getElementById("profileForm").addEventListener("submit", async event => {
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
    aiPreference: document.getElementById("aiPreference").value || "Suggestions only",
    publicProfileVisible: !document.getElementById("publicProfilePrivate").checked,
    publicHomeBase: document.getElementById("publicHomeBase").value.trim(),
    publicTravelStyle: document.getElementById("publicTravelStyle").value.trim(),
    publicBio: document.getElementById("publicBio").value.trim()
  };
  scheduleSave();
  if (state.user && state.cloudConfigured) {
    try {
      await savePublicTravelerProfile(state.user.uid, { displayName: state.profile.name || state.user.displayName || "Traveler", photoURL: state.user.photoURL || "", bio: state.profile.publicBio, homeBase: state.profile.publicHomeBase, travelStyle: state.profile.publicTravelStyle, interests: normalizeInterests(state.profile.interests), visible: state.profile.publicProfileVisible });
    } catch (error) {
      console.error(error);
      toast("Your private profile saved, but the community profile could not update");
      return;
    }
  } else if (state.profile.publicProfileVisible) {
    toast("Connect your account to publish your traveler profile");
    hydrateProfileForm();
    return;
  }
  hydrateProfileForm();
  renderRecommendations();
  trackAppEvent("profile_saved", { status: state.profile.publicProfileVisible ? "public" : "private" });
  toast(state.profile.publicProfileVisible ? "Profile saved and community profile updated" : "Private profile saved");
  showView("homeView");
});
document.getElementById("syncButton").addEventListener("click", () => syncToCloud({ silent: false }));

document.getElementById("authButton").addEventListener("click", async () => {
  if (!state.cloudConfigured) return toast("Firebase configuration is needed before cloud sign-in");
  try {
    if (state.user) { await signOutUser(); trackAppEvent("sign_out", { method: "google" }); }
    else { await signInGoogle(); trackAppEvent("sign_in", { method: "google" }); }
  }
  catch (error) { console.error(error); trackAppError("authentication", error); toast(error.message || "Cloud sign-in could not be completed"); }
});

document.getElementById("experiencePhotos").addEventListener("change", event => {
  const files = [...event.target.files].slice(0, 3);
  document.getElementById("photoStatus").textContent = files.length ? `${files.length} photo${files.length === 1 ? "" : "s"} ready to upload.` : "Up to 3 photos. AI can help describe the experience when cloud mode is connected.";
});

document.getElementById("communityList").addEventListener("click", async event => {
  const button = event.target.closest(".community-photo-button");
  if (button) {
    openCommunityPhoto(button.dataset.experienceId, button.dataset.photoIndex);
    return;
  }
  const mapButton = event.target.closest("[data-community-map]");
  if (mapButton) {
    trackAppEvent("community_viewed_on_map", { source: "community" });
    state.mapQuery = mapButton.dataset.communityMap;
    showView("exploreView");
    return;
  }
  const saveButton = event.target.closest("[data-community-save]");
  if (saveButton) {
    const experience = communityExperienceById(saveButton.dataset.communitySave);
    if (experience) { trackAppEvent("community_added_to_trip", { source: "community" }); addCommunityExperienceToTrip(experience); }
    return;
  }
  const collectionButton = event.target.closest("[data-save-collection]");
  if (collectionButton) { trackAppEvent("community_saved", { source: "community" }); openCollectionDialog(collectionButton.dataset.saveCollection); return; }
  const profileButton = event.target.closest("[data-traveler-profile]");
  if (profileButton) { openTravelerProfile(profileButton.dataset.travelerProfile); return; }
  const helpfulButton = event.target.closest("[data-community-helpful]");
  const reportButton = event.target.closest("[data-community-report]");
  if (!helpfulButton && !reportButton) return;
  if (!state.user) {
    toast("Connect your account to interact with community posts");
    showView("profileView");
    return;
  }
  const actionButton = helpfulButton || reportButton;
  actionButton.disabled = true;
  try {
    if (helpfulButton) {
      const postId = String(helpfulButton.dataset.communityHelpful);
      const helpful = !state.helpfulIds.has(postId);
      await setCommunityHelpful(postId, state.user.uid, helpful);
      if (helpful) state.helpfulIds.add(postId); else state.helpfulIds.delete(postId);
      toast(helpful ? "Marked as helpful" : "Helpful reaction removed");
    } else {
      const postId = String(reportButton.dataset.communityReport);
      await reportCommunityExperience(postId, state.user.uid);
      state.reportedIds.add(postId);
      toast("Report received for moderation review");
    }
    renderCommunity();
  } catch (error) {
    console.error(error);
    toast(error.message || "Community action could not be saved");
    actionButton.disabled = false;
  }
});
const collectionDialog = document.getElementById("collectionDialog");
document.getElementById("newCollectionButton").addEventListener("click", () => openCollectionDialog());
document.getElementById("closeCollectionDialog").addEventListener("click", () => collectionDialog.close());
document.getElementById("collectionForm").addEventListener("submit", event => {
  event.preventDefault();
  const newName = document.getElementById("newCollectionName").value.trim();
  let collection = newName ? null : collectionById(document.getElementById("collectionSelect").value);
  if (!collection) { collection = { id: crypto.randomUUID(), name: newName || "Saved places", createdAt: new Date().toISOString(), items: [] }; state.collections.unshift(collection); }
  const experience = state.activeCollectionPostId ? communityExperienceById(state.activeCollectionPostId) : null;
  if (experience && !(collection.items || []).some(item => String(item.postId) === String(experience.id))) collection.items = [...(collection.items || []), savedCommunitySnapshot(experience)];
  scheduleSave(); renderAll(); collectionDialog.close(); toast(experience ? `Saved to ${collection.name}` : `${collection.name} created`);
});
document.getElementById("collectionsList").addEventListener("click", event => {
  if (event.target.closest("[data-create-collection]")) return openCollectionDialog();
  const mapButton = event.target.closest("[data-collection-map]");
  if (mapButton) { state.mapQuery = mapButton.dataset.collectionMap; showView("exploreView"); return; }
  const tripButton = event.target.closest("[data-collection-trip]");
  if (tripButton) {
    const collection = collectionById(tripButton.dataset.collectionId);
    const item = (collection?.items || []).find(savedItem => String(savedItem.postId) === String(tripButton.dataset.collectionTrip));
    if (item) addCommunityExperienceToTrip({ ...item, id: item.postId });
    return;
  }
  const removeButton = event.target.closest("[data-collection-remove]");
  if (removeButton) {
    const collection = collectionById(removeButton.dataset.collectionId);
    if (collection) collection.items = (collection.items || []).filter(item => String(item.postId) !== String(removeButton.dataset.collectionRemove));
    scheduleSave(); renderAll(); toast("Removed from collection");
  }
});
document.getElementById("closeTravelerProfile").addEventListener("click", () => document.getElementById("travelerProfileDialog").close());
document.getElementById("travelerProfileContent").addEventListener("click", event => {
  const button = event.target.closest("[data-profile-map]");
  if (button) { document.getElementById("travelerProfileDialog").close(); state.mapQuery = button.dataset.profileMap; showView("exploreView"); }
});

document.getElementById("closeCommunityPhoto").addEventListener("click", () => communityPhotoDialog.close());
document.getElementById("previousCommunityPhoto").addEventListener("click", () => moveCommunityPhoto(-1));
document.getElementById("nextCommunityPhoto").addEventListener("click", () => moveCommunityPhoto(1));
communityPhotoDialog.addEventListener("click", event => {
  if (event.target === communityPhotoDialog) communityPhotoDialog.close();
});

document.getElementById("experienceForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!state.user || !state.cloudConfigured) {
    toast("Connect your account before publishing a community insight");
    showView("profileView");
    return;
  }
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
    const experience = {
      id: crypto.randomUUID(),
      authorName: state.user.displayName || state.profile.name || "Traveler",
      place: document.getElementById("experiencePlace").value.trim(),
      rating: Number(document.getElementById("experienceRating").value),
      text: document.getElementById("experienceText").value.trim(),
      audience: document.getElementById("experienceAudience").value,
      anonymous: document.getElementById("experienceAnonymous").checked,
      photoURLs,
      photoAnalysis,
      createdAt: new Date().toISOString()
    };
    const sharedExperience = await publishCommunityExperience(state.user.uid, experience);
    state.communityPosts = [sharedExperience, ...state.communityPosts.filter(item => String(item.id) !== String(sharedExperience.id))];
    state.communityLoaded = true;
    event.target.reset();
    document.getElementById("experienceAnonymous").checked = true;
    document.getElementById("photoStatus").textContent = "Up to 3 photos. AI can help describe the experience when cloud mode is connected.";
    renderCommunity();
    renderCommunityMapPicks(state.mapQuery);
    toast("Community insight published");
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
window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); deferredInstallPrompt = event; installButton.hidden = false; trackAppEvent("pwa_install_prompt", { status: "available" }); });
installButton.addEventListener("click", async () => { if (!deferredInstallPrompt) return toast("Use your browser menu to add this app to your home screen"); deferredInstallPrompt.prompt(); const choice = await deferredInstallPrompt.userChoice; trackAppEvent("pwa_install_result", { result: choice.outcome }); deferredInstallPrompt = null; installButton.hidden = true; });
const APP_VERSION = "10";
async function registerServiceWorker() {
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    const reloadKey = `aitd_app_reloaded_${APP_VERSION}`;
    if (sessionStorage.getItem(reloadKey)) return;
    sessionStorage.setItem(reloadKey, "true");
    window.location.reload();
  });
  try {
    const registration = await navigator.serviceWorker.register(`./service-worker.js?v=${APP_VERSION}`, { updateViaCache: "none" });
    await registration.update();
  } catch (error) {
    console.warn("Service worker unavailable", error);
  }
}
if ("serviceWorker" in navigator) window.addEventListener("load", registerServiceWorker);


const onboardingDialog = document.getElementById("onboardingDialog");
const onboardingSteps = [...document.querySelectorAll("[data-onboarding-step]")];
const onboardingBack = document.getElementById("onboardingBack");
const onboardingNext = document.getElementById("onboardingNext");
const onboardingProgress = document.getElementById("onboardingProgress");

function renderOnboardingStep() {
  onboardingSteps.forEach((step, index) => { step.hidden = index !== state.onboardingStep; });
  onboardingBack.hidden = state.onboardingStep === 0;
  onboardingNext.textContent = state.onboardingStep === onboardingSteps.length - 1 ? "Start exploring" : "Next";
  onboardingProgress.textContent = `Step ${state.onboardingStep + 1} of ${onboardingSteps.length}`;
}

function finishOnboarding(result) {
  localStorage.setItem(ONBOARDING_KEY, result);
  trackAppEvent(result === "completed" ? "onboarding_completed" : "onboarding_skipped", { step: state.onboardingStep + 1 });
  onboardingDialog.close();
}

onboardingBack.addEventListener("click", () => { state.onboardingStep = Math.max(0, state.onboardingStep - 1); renderOnboardingStep(); });
onboardingNext.addEventListener("click", () => {
  if (state.onboardingStep < onboardingSteps.length - 1) { state.onboardingStep += 1; renderOnboardingStep(); return; }
  finishOnboarding("completed");
});
document.getElementById("onboardingSkip").addEventListener("click", () => finishOnboarding("skipped"));

async function initializeApp() {
  hydrateProfileForm();
  renderAll();
  updateConnectionState();
  try {
    const cloud = await initializeCloud();
    state.cloudConfigured = cloud.configured;
    trackAppEvent("app_open", { returning: returningVisitor, display_mode: window.matchMedia("(display-mode: standalone)").matches ? "standalone" : "browser", online: navigator.onLine });
    if (cloud.configured) {
      observeAuth(handleAuthenticatedUser);
      await refreshCommunityFeed({ reset: true });
    }
    else handleAuthenticatedUser(null);
  } catch (error) {
    console.error(error);
    trackAppError("app_startup", error);
    setCloudBanner("Cloud setup could not start · Local travel mode remains available.", "error");
  }
  if (!localStorage.getItem(ONBOARDING_KEY)) {
    state.onboardingStep = 0;
    renderOnboardingStep();
    onboardingDialog.showModal();
    trackAppEvent("onboarding_started", { step: 1 });
  }
}

initializeApp();
