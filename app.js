import { initializeCloud, observeAuth, trackAppEvent } from "./firebase-client.js?v=48";
import { state, returningVisitor } from "./js/state.js?v=48";
import { setCloudBanner, trackAppError } from "./js/ui.js?v=48";
import { renderHome, renderRecommendations, initializeHome } from "./js/home.js?v=48";
import { createFeaturedPlace } from "./js/featured-place.js?v=48";
import { createPlanner } from "./js/planner.js?v=48";
import { createHotels } from "./js/hotels.js?v=48";
import { createItinerary } from "./js/itinerary.js?v=48";
import { createCommunity } from "./js/community.js?v=48";
import { createExplore } from "./js/explore.js?v=48";
import { createProfile } from "./js/profile.js?v=48";
import { initializeSafety } from "./js/safety.js?v=48";
import { initializePWA } from "./js/pwa.js?v=48";
import { createOnboarding } from "./js/onboarding.js?v=48";
import { createToday } from "./js/today.js?v=48";
import { createSmartAdd } from "./js/smart-add.js?v=48";
import { createTripAdjustments } from "./js/trip-adjustments.js?v=48";

const appRoot = document.querySelector("html");
const isAndroidStandalone = /Android/i.test(navigator.userAgent || "") && window.matchMedia("(display-mode: standalone)").matches;
if (isAndroidStandalone) appRoot?.classList.add("android-standalone");

// Each feature owns its handlers. Only navigation and page refresh cross features.
const planner = createPlanner({ renderAll });
const hotels = createHotels({ showView, renderAll, bindViewLinks });
const tripAdjustments = createTripAdjustments({ showView, renderAll });
const today = createToday({ showView, openTripAdjustment: tripAdjustments.open });
const itinerary = createItinerary({ showView, renderAll, bindViewLinks, replanCommunityPicks: () => community.replanCommunityPicks(), updateTripHotelDates: hotels.updateTripHotelDates, renderToday: today.renderToday });
const community = createCommunity({ showView, renderAll, renderItinerary: () => itinerary.renderItinerary() });
const smartAdd = createSmartAdd({ showView, renderAll });
const explore = createExplore({ renderCommunityMapPicks: community.renderCommunityMapPicks, openSmartAddDialog: smartAdd.openSmartAddDialog });
const profile = createProfile({ showView, renderAll, renderCommunity: community.renderCommunity, renderRecommendations, hydrateCommunityActions: community.hydrateCommunityActions });
const onboarding = createOnboarding();
const featuredPlace = createFeaturedPlace();

initializeHome({ showView });
featuredPlace.initialize();
initializeSafety({ showView });
initializePWA();

const views = [...document.querySelectorAll(".view")];
const navItems = [...document.querySelectorAll(".nav-item")];
const scrollSurface = document.querySelector(".app-scroll");

function showView(viewId) {
  state.currentView = viewId;
  trackAppEvent("view_opened", { view_name: viewId.replace("View", "") });
  views.forEach(view => view.classList.toggle("active", view.id === viewId));
  navItems.forEach(item => {
    const active = item.dataset.viewLink === viewId;
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  if (typeof scrollSurface?.scrollTo === "function") scrollSurface.scrollTo({ top: 0, behavior: "smooth" });
  else window.scrollTo({ top: 0, behavior: "smooth" });
  if (viewId === "plannerView") planner.initializeChat();
  if (viewId === "itineraryView") itinerary.renderItinerary();
  if (viewId === "collectionsView") community.renderCollections();
  if (viewId === "hotelsView") hotels.renderHotels();
  if (viewId === "exploreView") explore.renderMap();
  if (viewId === "homeView") today.renderToday();
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
  void featuredPlace.render();
  renderRecommendations();
  today.renderToday();
  community.renderCommunity();
  itinerary.renderItinerary();
  community.renderCollections();
  hotels.renderHotels();
}

bindViewLinks();
document.getElementById("startPlanningButton").addEventListener("click", () => showView("plannerView"));
document.getElementById("profileButton").addEventListener("click", () => showView("profileView"));
document.getElementById("shareExperienceButton").addEventListener("click", () => showView("communityView"));

async function initializeApp() {
  profile.hydrateProfileForm();
  renderAll();
  try {
    setCloudBanner("Checking for your saved cloud account…");
    const cloud = await initializeCloud();
    state.cloudConfigured = cloud.configured;
    trackAppEvent("app_open", { returning: returningVisitor, display_mode: window.matchMedia("(display-mode: standalone)").matches ? "standalone" : "browser", online: navigator.onLine });
    if (cloud.configured) {
      observeAuth(profile.handleAuthenticatedUser);
      await community.refreshCommunityFeed({ reset: true });
    }
    else profile.handleAuthenticatedUser(null);
  } catch (error) {
    console.error(error);
    trackAppError("app_startup", error);
    setCloudBanner("Cloud setup could not start · Local travel mode remains available.", "error");
  }
  onboarding.showOnboardingIfNeeded();
}

initializeApp();
