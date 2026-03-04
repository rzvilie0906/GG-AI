"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from "react";
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  sendEmailVerification,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { setFirebaseTokenGetter } from "@/lib/api";

// ── Types ───────────────────────────────────────────────────────

export type Plan = "weekly" | "pro" | "elite" | null;
export type SubStatus = "active" | "canceled" | "past_due" | "incomplete" | "inactive";

export interface DailyUsage {
  analyses: number;
  risk_analyses: number;
}

export interface SubscriptionInfo {
  plan: Plan;
  status: SubStatus;
  current_period_end: string | null;
  tier_limits?: {
    max_analyses_per_day: number | null;   // null = unlimited
    max_risk_analyses_per_day: number | null;
    has_risk_analyzer: boolean;
  };
  daily_usage?: DailyUsage;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  subscription: SubscriptionInfo | null;
  subLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName?: string, dateOfBirth?: string) => Promise<void>;
  signInWithGoogle: () => Promise<{ needsProfile: boolean }>;
  signOut: () => Promise<void>;
  resendVerification: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshSubscription: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// ── Mock mode for testing ──────────────────────────────────────

const MOCK_AUTH = process.env.NEXT_PUBLIC_MOCK_AUTH === "true";

const MOCK_USER = {
  uid: "mock-user-001",
  email: "test@gg-ai.pro",
  emailVerified: true,
  displayName: "Test User",
  getIdToken: async () => "mock-firebase-token",
} as unknown as User;

const MOCK_SUBSCRIPTION: SubscriptionInfo = {
  plan: "elite",
  status: "active",
  current_period_end: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
  tier_limits: {
    max_analyses_per_day: null,
    max_risk_analyses_per_day: null,
    has_risk_analyzer: true,
  },
  daily_usage: { analyses: 0, risk_analyses: 0 },
};

// ── Provider ───────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(MOCK_AUTH ? MOCK_USER : null);
  const [loading, setLoading] = useState(!MOCK_AUTH);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(
    MOCK_AUTH ? MOCK_SUBSCRIPTION : null
  );
  const [subLoading, setSubLoading] = useState(false);

  // Get Firebase ID token
  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (MOCK_AUTH) return "mock-firebase-token";
    if (!user) return null;
    try {
      return await user.getIdToken();
    } catch {
      return null;
    }
  }, [user]);

  // Fetch subscription status from backend
  const refreshSubscription = useCallback(async () => {
    if (MOCK_AUTH) return;
    if (!user) {
      setSubscription(null);
      return;
    }
    setSubLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${API_BASE}/api/billing/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSubscription(data);
      } else {
        setSubscription({
          plan: null,
          status: "inactive",
          current_period_end: null,
        });
      }
    } catch {
      setSubscription({
        plan: null,
        status: "inactive",
        current_period_end: null,
      });
    } finally {
      setSubLoading(false);
    }
  }, [user]);

  // Listen for auth state changes
  useEffect(() => {
    if (MOCK_AUTH) {
      setLoading(false);
      // Set mock token getter for API calls
      setFirebaseTokenGetter(async () => "mock-firebase-token");
      return;
    }
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      // Update API token getter
      if (firebaseUser) {
        setFirebaseTokenGetter(async () => {
          try { return await firebaseUser.getIdToken(); } catch { return null; }
        });
      } else {
        setFirebaseTokenGetter(async () => null);
      }
    });
    return unsub;
  }, []);

  // Fetch subscription when user changes
  useEffect(() => {
    if (user && !MOCK_AUTH) {
      refreshSubscription();
    }
  }, [user, refreshSubscription]);

  // ── Auth methods ──────────────────────────────────────

  const signIn = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    if (!cred.user.emailVerified) {
      await firebaseSignOut(auth);
      throw new Error("EMAIL_NOT_VERIFIED");
    }
  };

  const signUp = async (email: string, password: string, fullName?: string, dateOfBirth?: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(cred.user);
    // Register user in backend
    try {
      const token = await cred.user.getIdToken();
      await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          uid: cred.user.uid,
          email: cred.user.email,
          provider: "email",
          full_name: fullName || null,
          date_of_birth: dateOfBirth || null,
        }),
      });
    } catch (e) {
      console.error("Failed to register user in backend:", e);
    }
    // Sign out until email is verified
    await firebaseSignOut(auth);
  };

  const signInWithGoogle = async (): Promise<{ needsProfile: boolean }> => {
    const cred = await signInWithPopup(auth, googleProvider);
    // Register/update user in backend
    let needsProfile = false;
    try {
      const token = await cred.user.getIdToken();
      await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          uid: cred.user.uid,
          email: cred.user.email,
          provider: "google",
        }),
      });
      // Check if profile is complete (has full_name and date_of_birth)
      const profileRes = await fetch(`${API_BASE}/api/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        if (!profile.full_name || !profile.date_of_birth) {
          needsProfile = true;
        }
      }
    } catch (e) {
      console.error("Failed to register user in backend:", e);
    }
    return { needsProfile };
  };

  const signOutFn = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setSubscription(null);
  };

  const resendVerification = async () => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
    }
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        subscription,
        subLoading,
        signIn,
        signUp,
        signInWithGoogle,
        signOut: signOutFn,
        resendVerification,
        resetPassword,
        refreshSubscription,
        getIdToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
