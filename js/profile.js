import { state, defaultProfile, saveLocalState } from "./state.js?v=31";
import { normalizeInterests, toast, setCloudBanner, trackAppError } from "./ui.js?v=31";
import { scheduleSave, syncToCloud } from "./persistence.js?v=31";
import { loadCloudState, savePublicTravelerProfile, signInGoogle, signOutUser, trackAppEvent } from "../firebase-client.js?v=31";

export function createProfile({ showView, renderAll, renderCommunity, renderRecommendations, hydrateCommunityActions }) {
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
    document.getElementById("cloudConnectButton").hidden = !state.cloudConfigured || Boolean(state.user);
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

  async function changeCloudAccount({ allowSignOut = true } = {}) {
    if (!state.cloudConfigured) return toast("Firebase configuration is needed before cloud sign-in");
    try {
      if (state.user && allowSignOut) { await signOutUser(); trackAppEvent("sign_out", { method: "google" }); }
      else { await signInGoogle(); trackAppEvent("sign_in", { method: "google" }); }
    }
    catch (error) { console.error(error); trackAppError("authentication", error); toast(error.message || "Cloud sign-in could not be completed"); }
  }

  document.getElementById("authButton").addEventListener("click", () => changeCloudAccount());
  document.getElementById("cloudConnectButton").addEventListener("click", () => changeCloudAccount({ allowSignOut: false }));

  return { hydrateProfileForm, handleAuthenticatedUser };
}
