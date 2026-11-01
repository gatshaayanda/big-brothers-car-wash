import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

const firebaseConfig = {
  // Public Firebase web config is injected by the deployment environment.
  // Build/CI must also be able to prerender client routes when those env vars are absent.
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "build-placeholder",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "build-placeholder.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "build-placeholder",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "build-placeholder.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "build-placeholder",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "build-placeholder",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Production must supply real web config. Empty Vercel variables are treated as missing too;
// build fallbacks keep prerender safe while hasFirebaseWebConfig prevents auth actions.
export const hasFirebaseWebConfig = Boolean(
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
  process.env.NEXT_PUBLIC_FIREBASE_APP_ID &&
  process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
);

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const storage = getStorage(app);
export { app };
