"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface ProfileData {
  uid: string;
  email: string;
  full_name: string | null;
  date_of_birth: string | null;
  provider: string | null;
}

export default function AccountPage() {
  const { user, loading, subscription, subLoading, signOut, getIdToken, refreshSubscription, resetPassword } = useAuth();
  const router = useRouter();
  const [cancelLoading, setCancelLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"info" | "success" | "error">("info");
  const [profile, setProfile] = useState<ProfileData | null>(null);

  // Fetch profile data from backend
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch(`${API_BASE}/api/auth/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setProfile(data);
        }
      } catch (e) {
        console.error("Failed to fetch profile:", e);
      }
    })();
  }, [user, getIdToken]);

  if (loading || subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-deep)" }}>
        <div className="animate-spin h-10 w-10 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    router.replace("/auth/signin");
    return null;
  }

  function showMessage(text: string, type: "info" | "success" | "error" = "info") {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(""), 6000);
  }

  async function handlePasswordReset() {
    if (!user?.email) return;
    setResetLoading(true);
    try {
      await resetPassword(user.email);
      showMessage("Un email de resetare a parolei a fost trimis la " + user.email + ".", "success");
    } catch {
      showMessage("Eroare la trimiterea email-ului de resetare.", "error");
    } finally {
      setResetLoading(false);
    }
  }

  async function handleCancel() {
    if (!confirm("Sigur dorești să anulezi abonamentul?\n\nNu se oferă rambursări. Vei păstra accesul până la sfârșitul perioadei curente de facturare.")) return;
    setCancelLoading(true);
    setMessage("");
    try {
      const token = await getIdToken();
      const res = await fetch(`${API_BASE}/api/billing/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        showMessage("Abonamentul a fost anulat. Vei păstra accesul până la sfârșitul perioadei de facturare.", "success");
        await refreshSubscription();
      } else {
        const data = await res.json().catch(() => ({}));
        showMessage(data.detail || "Eroare la anularea abonamentului.", "error");
      }
    } catch {
      showMessage("Eroare de conexiune.", "error");
    } finally {
      setCancelLoading(false);
    }
  }

  async function handlePortal() {
    setPortalLoading(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`${API_BASE}/api/billing/portal`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url) window.location.href = data.url;
      }
    } catch {
      showMessage("Eroare la deschiderea portalului Stripe.", "error");
    } finally {
      setPortalLoading(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    router.push("/auth/signin");
  }

  const planLabels: Record<string, string> = {
    weekly: "Săptămânal (€14.99/săpt.)",
    pro: "Pro (€39.99/lună)",
    elite: "Elite (€99.99/lună)",
  };

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : user.email?.charAt(0).toUpperCase() || "?";

  const isEmailProvider = user.providerData?.[0]?.providerId !== "google.com";

  const msgColors = {
    info: "bg-blue-500/10 border-blue-500/20 text-blue-400",
    success: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    error: "bg-red-500/10 border-red-500/20 text-red-400",
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-deep)", color: "#e2e8f0" }}>
      {/* Top nav */}
      <div className="border-b border-white/[0.06] bg-[#0d1117]/80 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 text-white no-underline hover:opacity-80 transition">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-violet flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <span className="text-lg font-extrabold">GG-<span className="text-primary">AI</span></span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-text-secondary hover:text-white transition no-underline">
              ← Dashboard
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Header with avatar */}
        <div className="flex items-center gap-5 mb-10">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-violet flex items-center justify-center text-xl font-bold text-white shadow-lg">
            {initials}
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-white">Contul meu</h1>
            <p className="text-text-secondary text-sm mt-0.5">{user.email}</p>
          </div>
        </div>

        {/* Notification */}
        {message && (
          <div className={`mb-6 p-4 rounded-xl border text-sm ${msgColors[messageType]}`}>
            {message}
          </div>
        )}

        {/* Profile Section */}
        <div className="card p-6 mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted mb-5 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            Profil
          </h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-text-secondary text-sm">Nume complet</span>
              <span className="text-white font-medium">{profile?.full_name || "—"}</span>
            </div>
            <div className="h-px bg-white/[0.06]" />
            <div className="flex justify-between items-center">
              <span className="text-text-secondary text-sm">Email</span>
              <span className="text-white font-medium">{user.email}</span>
            </div>
            <div className="h-px bg-white/[0.06]" />
            <div className="flex justify-between items-center">
              <span className="text-text-secondary text-sm">Data nașterii</span>
              <span className="text-white font-medium">
                {profile?.date_of_birth
                  ? new Date(profile.date_of_birth).toLocaleDateString("ro-RO", { year: "numeric", month: "long", day: "numeric" })
                  : "—"}
              </span>
            </div>
            <div className="h-px bg-white/[0.06]" />
            <div className="flex justify-between items-center">
              <span className="text-text-secondary text-sm">Autentificare</span>
              <span className="text-white font-medium capitalize">
                {user.providerData?.[0]?.providerId === "google.com" ? "Google" : "Email & Parolă"}
              </span>
            </div>
            <div className="h-px bg-white/[0.06]" />
            <div className="flex justify-between items-center">
              <span className="text-text-secondary text-sm">Email verificat</span>
              <span className={user.emailVerified ? "text-success font-medium" : "text-warning font-medium"}>
                {user.emailVerified ? "Da ✓" : "Nu ✗"}
              </span>
            </div>
          </div>
        </div>

        {/* Password Section (only for email provider) */}
        {isEmailProvider && (
          <div className="card p-6 mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted mb-5 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Securitate
            </h2>
            <p className="text-text-secondary text-sm mb-4">
              Vei primi un email cu un link pentru a-ți schimba parola.
            </p>
            <button
              onClick={handlePasswordReset}
              disabled={resetLoading}
              className="px-5 py-2.5 rounded-xl border border-white/10 text-sm font-medium text-white hover:bg-white/5 transition disabled:opacity-50 flex items-center gap-2"
            >
              {resetLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Se trimite...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  Schimbă parola prin email
                </>
              )}
            </button>
          </div>
        )}

        {/* Subscription Section */}
        <div className="card p-6 mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted mb-5 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            Abonament
          </h2>
          {subscription?.status === "active" ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-text-secondary text-sm">Plan activ</span>
                <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-bold">
                  {planLabels[subscription.plan || ""] || subscription.plan}
                </span>
              </div>
              <div className="h-px bg-white/[0.06]" />
              <div className="flex justify-between items-center">
                <span className="text-text-secondary text-sm">Status</span>
                <span className="inline-flex items-center gap-1.5 text-success font-medium text-sm">
                  <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  Activ
                </span>
              </div>
              {subscription.current_period_end && (
                <>
                  <div className="h-px bg-white/[0.06]" />
                  <div className="flex justify-between items-center">
                    <span className="text-text-secondary text-sm">Următoarea facturare</span>
                    <span className="text-white text-sm">{new Date(subscription.current_period_end).toLocaleDateString("ro-RO", { year: "numeric", month: "long", day: "numeric" })}</span>
                  </div>
                </>
              )}
              <div className="h-px bg-white/[0.06]" />
              <p className="text-xs text-text-muted">
                Nu se oferă rambursări la anularea abonamentului. Accesul rămâne activ până la sfârșitul perioadei de facturare curente.
              </p>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={handlePortal}
                  disabled={portalLoading}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-medium text-white hover:bg-white/5 transition disabled:opacity-50"
                >
                  {portalLoading ? "Se deschide..." : "Gestionează în Stripe"}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={cancelLoading}
                  className="flex-1 py-2.5 rounded-xl border border-danger/20 text-sm font-medium text-danger hover:bg-danger/10 transition disabled:opacity-50"
                >
                  {cancelLoading ? "Se anulează..." : "Anulează abonamentul"}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </div>
              <p className="text-text-secondary mb-4">Nu ai un abonament activ.</p>
              <Link
                href="/pricing"
                className="inline-flex px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary to-violet text-white font-semibold text-sm hover:shadow-glow transition no-underline"
              >
                Alege un plan →
              </Link>
            </div>
          )}
        </div>

        {/* Upgrade Plan (if active but not elite) */}
        {subscription?.status === "active" && subscription.plan !== "elite" && (
          <div className="card p-6 mb-6 border-primary/20">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold mb-1">Upgrade plan</h3>
                <p className="text-text-secondary text-sm">
                  Obține mai multe analize și funcții avansate cu un plan superior.
                </p>
              </div>
              <Link
                href="/pricing"
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-violet text-white font-semibold text-sm hover:shadow-glow transition no-underline whitespace-nowrap"
              >
                Vezi planurile →
              </Link>
            </div>
          </div>
        )}

        {/* Sign Out */}
        <div className="card p-6">
          <button
            onClick={handleSignOut}
            className="w-full py-3 rounded-xl border border-white/10 text-sm font-medium text-text-secondary hover:text-white hover:bg-white/5 transition flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Deconectare
          </button>
        </div>
      </div>
    </div>
  );
}
