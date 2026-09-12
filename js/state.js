import { readJSON } from "./ui.js?v=32";

const STORAGE_KEY = "aitd_v3_state";
export const returningVisitor = Boolean(localStorage.getItem(STORAGE_KEY));
export const defaultProfile = {
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
export const state = {
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
  onboardingStep: 0,
  hotelFilter: "best",
  selectedOvernightLocation: "",
  hotelLocationsResolving: false,
  hotelLocationsAttempted: false,
  hotelStay: { checkIn: "", checkOut: "", adults: 2, children: 0, rooms: 1, currency: "USD", ...(saved.hotelStay || {}) },
  hotelPlacesLoadingKey: "",
  hotelCurrencyLoading: ""
};

export function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ profile: state.profile, trip: state.trip, experiences: state.experiences, collections: state.collections, mapQuery: state.mapQuery, hotelStay: state.hotelStay }));
}
