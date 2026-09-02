// Firebase web configuration is intentionally kept separate from application logic.
// Replace the placeholder values with the Web App configuration for ai-travel-director.
// Never put OPENAI_API_KEY in this browser file; keep it in Firebase Functions secrets.
export const firebaseConfig = {
  apiKey: "REPLACE_WITH_FIREBASE_API_KEY",
  authDomain: "ai-travel-director.firebaseapp.com",
  projectId: "ai-travel-director",
  storageBucket: "ai-travel-director.firebasestorage.app",
  messagingSenderId: "REPLACE_WITH_MESSAGING_SENDER_ID",
  appId: "REPLACE_WITH_APP_ID"
};

export const functionsRegion = "us-central1";
