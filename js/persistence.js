import { state, saveLocalState } from "./state.js?v=30";
import { saveCloudState } from "../firebase-client.js?v=30";
import { setCloudBanner, toast } from "./ui.js?v=30";

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

export function scheduleSave() {
  saveLocalState();
  clearTimeout(state.syncTimer);
  state.syncTimer = setTimeout(() => syncToCloud({ silent: true }), 700);
}

export async function syncToCloud({ silent = false } = {}) {
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
