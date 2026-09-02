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
    collection: firestoreModule.collection,
    query: firestoreModule.query,
    where: firestoreModule.where,
    orderBy: firestoreModule.orderBy,
    limit: firestoreModule.limit,
    startAfter: firestoreModule.startAfter,
    getDocs: firestoreModule.getDocs,
    doc: firestoreModule.doc,
    getDoc: firestoreModule.getDoc,
    setDoc: firestoreModule.setDoc,
    deleteDoc: firestoreModule.deleteDoc,
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
    const path = `community/${uid}/experiences/${Date.now()}-${index}-${safeName}`;
    const reference = services.ref(services.storage, path);
    await services.uploadBytes(reference, file, { contentType: file.type || "image/jpeg" });
    return services.getDownloadURL(reference);
  }));
}

function communitySnapshotData(snapshot) {
  const data = snapshot.data();
  return {
    ...data,
    id: snapshot.id,
    isShared: true,
    createdAt: data.createdAt?.toDate?.().toISOString?.() || data.createdAt || new Date().toISOString()
  };
}

export async function loadCommunityFeed({ cursor = null, pageSize = 8 } = {}) {
  if (!services) return { items: [], cursor: null, hasMore: false };
  const constraints = [
    services.where("moderationStatus", "==", "published"),
    services.orderBy("createdAt", "desc"),
    services.limit(pageSize)
  ];
  if (cursor) constraints.splice(2, 0, services.startAfter(cursor));
  const snapshot = await services.getDocs(services.query(services.collection(services.db, "communityExperiences"), ...constraints));
  return {
    items: snapshot.docs.map(communitySnapshotData),
    cursor: snapshot.docs.at(-1) || cursor,
    hasMore: snapshot.size === pageSize
  };
}

export async function publishCommunityExperience(uid, experience) {
  if (!services || !uid) throw new Error("Sign in before sharing a community insight.");
  const id = String(experience.id || crypto.randomUUID());
  const payload = {
    ownerId: uid,
    authorName: experience.anonymous ? "Anonymous traveler" : String(experience.authorName || "Traveler").slice(0, 100),
    anonymous: Boolean(experience.anonymous),
    place: String(experience.place || "").trim().slice(0, 160),
    placeLower: String(experience.place || "").trim().toLocaleLowerCase().slice(0, 160),
    rating: Math.max(1, Math.min(Number(experience.rating) || 1, 5)),
    text: String(experience.text || "").trim().slice(0, 2000),
    audience: String(experience.audience || "Everyone").slice(0, 100),
    photoURLs: (Array.isArray(experience.photoURLs) ? experience.photoURLs : []).slice(0, 3),
    photoAnalysis: experience.photoAnalysis ? {
      description: String(experience.photoAnalysis.description || "").slice(0, 800),
      placeSuggestion: String(experience.photoAnalysis.placeSuggestion || "").slice(0, 160),
      experienceDraft: String(experience.photoAnalysis.experienceDraft || "").slice(0, 1200),
      tags: (Array.isArray(experience.photoAnalysis.tags) ? experience.photoAnalysis.tags : []).slice(0, 8).map(value => String(value).slice(0, 60))
    } : null,
    moderationStatus: "published",
    createdAt: services.serverTimestamp(),
    updatedAt: services.serverTimestamp()
  };
  await services.setDoc(services.doc(services.db, "communityExperiences", id), payload);
  return { ...payload, id, isShared: true, createdAt: new Date().toISOString() };
}

export async function loadCommunityActions(postIds, uid) {
  if (!services || !uid) return { helpfulIds: [], reportedIds: [] };
  const [helpful, reported] = await Promise.all([
    Promise.all(postIds.map(id => services.getDoc(services.doc(services.db, "communityExperiences", id, "helpful", uid)))),
    Promise.all(postIds.map(id => services.getDoc(services.doc(services.db, "communityExperiences", id, "reports", uid))))
  ]);
  return {
    helpfulIds: postIds.filter((id, index) => helpful[index].exists()),
    reportedIds: postIds.filter((id, index) => reported[index].exists())
  };
}

export async function setCommunityHelpful(postId, uid, helpful) {
  if (!services || !uid) throw new Error("Sign in to mark an insight helpful.");
  const reference = services.doc(services.db, "communityExperiences", postId, "helpful", uid);
  if (helpful) await services.setDoc(reference, { userId: uid, createdAt: services.serverTimestamp() });
  else await services.deleteDoc(reference);
}

export async function reportCommunityExperience(postId, uid, reason = "User reported") {
  if (!services || !uid) throw new Error("Sign in to report an insight.");
  await services.setDoc(services.doc(services.db, "communityExperiences", postId, "reports", uid), {
    userId: uid,
    reason: String(reason).slice(0, 200),
    createdAt: services.serverTimestamp()
  });
}

export async function requestPhotoAnalysis(photoURL) {
  if (!services) throw new Error("Cloud photo analysis is not configured.");
  const result = await services.httpsCallable(services.functions, "analyzeExperiencePhoto")({ photoURL });
  return result.data;
}
