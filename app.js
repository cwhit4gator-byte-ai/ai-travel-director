import { initializeCloud, observeAuth, trackAppEvent } from "./firebase-client.js?v=27";
import { state, returningVisitor } from "./js/state.js?v=27";
import { setCloudBanner, trackAppError } from "./js/ui.js?v=27";
import { renderHome, renderRecommendations, initializeHome } from "./js/home.js?v=27";
import { createPlanner } from "./js/planner.js?v=27";
import { createHotels } from "./js/hotels.js?v=27";
import { createItinerary } from "./js/itinerary.js?v=27";
import { createCommunity } from "./js/community.js?v=27";
import { createExplore } from "./js/explore.js?v=27";
import { createProfile } from "./js/profile.js?v=27";
import { initializeSafety } from "./js/safety.js?v=27";
import { initializePWA } from "./js/pwa.js?v=27";
import { createOnboarding } from "./js/onboarding.js?v=27";

// Each feature owns its handlers. Only navigation and page refresh cross features.
const planner = createPlanner({ renderAll });
const hotels = createHotels({ showView, renderAll, bindViewLinks });
const itinerary = createItinerary({ showView, renderAll, bindViewLinks, replanCommunityPicks: () => community.replanCommunityPicks() });
const community = createCommunity({ showView, renderAll, renderItinerary: () => itinerary.renderItinerary() });
const explore = createExplore({ showView, renderHome, renderCommunityMapPicks: community.renderCommunityMapPicks });
const profile = createProfile({ showView, renderAll, renderCommunity: community.renderCommunity, renderRecommendations, hydrateCommunityActions: community.hydrateCommunityActions });
const onboarding = createOnboarding();

initializeHome();
initializeSafety({ showView });
initializePWA();

const views = [...document.querySelectorAll(".view")];
const navItems = [...document.querySelectorAll(".nav-item")];

function showView(viewId) {
  state.currentView = viewId;
  trackAppEvent("view_opened", { view_name: viewId.replace("View", "") });
  views.forEach(view => view.classList.toggle("active", view.id === viewId));
  navItems.forEach(item => item.classList.toggle("active", item.dataset.viewLink === viewId));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (viewId === "plannerView") planner.initializeChat();
  if (viewId === "itineraryView") itinerary.renderItinerary();
  if (viewId === "collectionsView") community.renderCollections();
  if (viewId === "hotelsView") hotels.renderHotels();
  if (viewId === "exploreView") explore.renderMap();
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
