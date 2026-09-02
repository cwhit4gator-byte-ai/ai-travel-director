import { loadFirebaseConfig, functionsRegion } from "./firebase-config.js";

let services = null;
let initializationPromise = null;

export async function initializeCloud() {
  if (services) return { configured: true, auth: services.auth };
  if (initializationPromise) return initializationPromise;

  initializationPromise = initializeServices();
  return initializationPromise;
}

async function initializeServices() {
  const firebaseConfig = await loadFirebaseConfig();
  const configured = Boolean(firebaseConfig?.apiKey && firebaseConfig?.projectId && firebaseConfig?.appId);
  if (!configured) return { configured: false };

  const [appModule, authModule, firestoreModule, functionsModule, storageModule] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js"),
    import("https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js"),
    import("https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js")
  ]);

  const app = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(firebaseConfig);
  services = {
    auth: authModule.getAuth(app),
    db: firestoreModule.getFirestore(app),
    functions: functionsModule.getFunctions(app, functionsRegion),
    storage: storageModule.getStorage(app),
    GoogleAuthProvider: authModule.GoogleAuthProvider,
    signInWithPopup: authModule.signInWithPopup,
    signOut: authModule.signOut,
    onAuthStateChanged: authModule.onAuthStateChanged,
    doc: firestoreModule.doc,
    getDoc: firestoreModule.getDoc,
    setDoc: firestoreModule.setDoc,
    serverTimestamp: firestoreModule.serverTimestamp,
    httpsCallable: functionsModule.httpsCallable,
    ref: storageModule.ref,
    uploadBytes: storageModule.uploadBytes,
    getDownloadURL: storageModule.getDownloadURL
  };

  return { configured: true, auth: services.auth };
}

export function observeAuth(callback) {
  return services ? services.onAuthStateChanged(services.auth, callback) : () => {};
}

export async function signInGoogle() {
  if (!services) throw new Error("Firebase is not configured.");
  const provider = new services.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return services.signInWithPopup(services.auth, provider);
}

export async function signOutUser() {
  if (services) await services.signOut(services.auth);
}

export async function loadCloudState(uid) {
  if (!services) return null;
  const snapshot = await services.getDoc(services.doc(services.db, "users", uid));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function saveCloudState(uid, payload) {
  if (!services) return;
  await services.setDoc(services.doc(services.db, "users", uid), { ...payload, updatedAt: services.serverTimestamp() }, { merge: true });
}

export async function requestAITrip(payload) {
  if (!services) throw new Error("Cloud AI is not configured.");
  const result = await services.httpsCallable(services.functions, "planTrip")(payload);
  return result.data;
}

export async function uploadExperiencePhotos(uid, files) {
  if (!services) throw new Error("Cloud photo storage is not configured.");
  return Promise.all(files.slice(0, 3).map(async (file, index) => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `users/${uid}/experiences/${Date.now()}-${index}-${safeName}`;
    const reference = services.ref(services.storage, path);
    await services.uploadBytes(reference, file, { contentType: file.type || "image/jpeg" });
    return services.getDownloadURL(reference);
  }));
}

export async function requestPhotoAnalysis(photoURL) {
  if (!services) throw new Error("Cloud photo analysis is not configured.");
  const result = await services.httpsCallable(services.functions, "analyzeExperiencePhoto")({ photoURL });
  return result.data;
}
