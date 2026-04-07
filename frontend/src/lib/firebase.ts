// ── Firebase Client SDK Configuration ──────────────────────────
// Lazy-loaded to keep the Firebase Auth SDK (~100 KB) off the critical
// rendering path.  The page renders immediately; Firebase initialises
// asynchronously on first use.

import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "ggai.bet",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Get or initialise the Firebase app instance (shared by Auth + Firestore). */
async function _getApp() {
  const { initializeApp, getApps } = await import("firebase/app");
  return getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
}

let _initPromise: Promise<{ auth: Auth; googleProvider: any }> | null = null;

/** Lazily initialise the Firebase app + Auth.  Subsequent calls return the
 *  cached promise so the SDK is only downloaded once. */
export function getFirebaseAuth() {
  if (!_initPromise) {
    _initPromise = Promise.all([
      _getApp(),
      import("firebase/auth"),
    ]).then(([app, { getAuth, GoogleAuthProvider }]) => {
      return { auth: getAuth(app), googleProvider: new GoogleAuthProvider() };
    });
  }
  return _initPromise;
}

let _firestorePromise: Promise<Firestore> | null = null;

/** Lazily initialise Firestore.  Only downloads the SDK when first called. */
export function getFirestoreDb(): Promise<Firestore> {
  if (!_firestorePromise) {
    _firestorePromise = Promise.all([
      _getApp(),
      import("firebase/firestore"),
    ]).then(([app, { getFirestore }]) => {
      return getFirestore(app);
    });
  }
  return _firestorePromise;
}
