export let firebaseConfig = null;
export const functionsRegion = "us-central1";

export const googleMapsConfig = {
  apiKey: "AIzaSyCrqdV4-YrqtO8Y1J52mkZ1pfsq5ODkj2I",
  mapId: "72e2059c67585b4b93186bf7"
};

export async function loadFirebaseConfig() {
  try {
    const response = await fetch("/__/firebase/init.json", {
      cache: "no-store"
    });

    if (!response.ok) {
      console.error("Firebase config request failed:", response.status);
      return null;
    }

    const config = await response.json();

    if (!config?.apiKey || !config?.projectId || !config?.appId) {
      console.error("Firebase configuration is incomplete:", config);
      return null;
    }

    firebaseConfig = config;
    return config;
  } catch (error) {
    console.error("Could not load Firebase configuration:", error);
    return null;
  }
}
