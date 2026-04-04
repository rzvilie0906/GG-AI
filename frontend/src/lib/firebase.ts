// ── Firebase Client SDK Configuration ──────────────────────────
// Lazy-loaded to keep the Firebase Auth SDK (~100 KB) off the critical
// rendering path.  The page renders immediately; Firebase initialises
// asynchronously on first use.

import type { Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "ggai.bet",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let _initPromise: Promise<{ auth: Auth; googleProvider: any }> | null = null;

/** Lazily initialise the Firebase app + Auth.  Subsequent calls return the
 *  cached promise so the SDK is only downloaded once. */
export function getFirebaseAuth() {
  if (!_initPromise) {
    _initPromise = Promise.all([
      import("firebase/app"),
      import("firebase/auth"),
    ]).then(([{ initializeApp, getApps }, { getAuth, GoogleAuthProvider }]) => {
      const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
      return { auth: getAuth(app), googleProvider: new GoogleAuthProvider() };
    });
  }
  return _initPromise;
}
