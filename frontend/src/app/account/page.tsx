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
  const [resetLoading, setResetLoading] = useState(false);
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"info" | "success" | "error">("info");
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDob, setEditDob] = useState("");
  const [saving, setSaving] = useState(false);

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

  function isoToDdMmYyyy(iso: string): string {
    const parts = iso.split("-");
    if (parts.length !== 3) return iso;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  function ddMmYyyyToIso(dob: string): string {
    const parts = dob.split("/");
    if (parts.length !== 3) return dob;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  function startEditing() {
    setEditName(profile?.full_name || "");
    setEditDob(profile?.date_of_birth ? isoToDdMmYyyy(profile.date_of_birth) : "");
    setEditing(true);
  }

  async function handleSaveProfile() {
    if (!editName.trim()) {
      showMessage("Numele complet este obligatoriu.", "error");
      return;
    }
    const dobParts = editDob.split("/");
    if (dobParts.length !== 3 || dobParts[2]?.length !== 4) {
      showMessage("Data nașterii trebuie să fie în formatul ZZ/LL/AAAA.", "error");
      return;
    }
    const isoDate = ddMmYyyyToIso(editDob);
    const birth = new Date(isoDate);
    if (isNaN(birth.getTime())) {
      showMessage("Data nașterii nu este validă.", "error");
      return;
    }
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    if (age < 18) {
      showMessage("Trebuie să ai cel puțin 18 ani.", "error");
      return;
    }

    setSaving(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`${API_BASE}/api/auth/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          full_name: editName.trim(),
          date_of_birth: isoDate,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Eroare la salvarea profilului.");
      }
      setProfile((prev) => prev ? { ...prev, full_name: editName.trim(), date_of_birth: isoDate } : prev);
      setEditing(false);
      showMessage("Profilul a fost actualizat cu succes.", "success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showMessage(msg, "error");
    } finally {
      setSaving(false);
    }
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
    setCancelLoading(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`${API_BASE}/api/billing/portal`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url) window.location.href = data.url;
      } else {
        showMessage("Eroare la deschiderea portalului Stripe.", "error");
      }
    } catch {
      showMessage("Eroare la deschiderea portalului Stripe.", "error");
    } finally {
      setCancelLoading(false);
    }
  }

  async function handleSignOut() {
    window.location.href = "/";
    await signOut();
  }

  async function handleRevokeAllSessions() {
    setRevokeLoading(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`${API_BASE}/api/auth/revoke-all-sessions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        showMessage(`${data.revoked_sessions} sesiune(i) revocată(e). Vei fi deconectat de pe toate dispozitivele.`, "success");
        // Deconectează și sesiunea curentă după un scurt delay
        setTimeout(async () => {
          window.location.href = "/auth/signin";
          await signOut();
        }, 2000);
      } else {
        showMessage("Eroare la revocarea sesiunilor.", "error");
      }
    } catch {
      showMessage("Eroare la revocarea sesiunilor.", "error");
    } finally {
      setRevokeLoading(false);
    }
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
            <img src="/logo.png" alt="GG-AI" className="h-9 w-auto object-contain rounded-lg" />
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
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Profil
            </h2>
            {!editing && (
              <button
                onClick={startEditing}
                className="text-sm text-primary hover:text-primary-hover font-medium transition flex items-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Editează
              </button>
            )}
          </div>

          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">Nume complet</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="input-field w-full"
                  placeholder="Ion Popescu"
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">Data nașterii (ZZ/LL/AAAA)</label>
                <input
                  type="text"
                  value={editDob}
                  onChange={(e) => {
                    let v = e.target.value.replace(/[^0-9]/g, "");
                    if (v.length > 8) v = v.slice(0, 8);
                    if (v.length >= 5) v = v.slice(0, 2) + "/" + v.slice(2, 4) + "/" + v.slice(4);
                    else if (v.length >= 3) v = v.slice(0, 2) + "/" + v.slice(2);
                    setEditDob(v);
                  }}
                  maxLength={10}
                  className="input-field w-full"
                  placeholder="31/12/2000"
                />
              </div>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-violet text-white font-semibold text-sm hover:shadow-glow transition disabled:opacity-50 flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Se salvează...
                    </>
                  ) : (
                    "Salvează"
                  )}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl border border-white/10 text-sm font-medium text-text-secondary hover:text-white hover:bg-white/5 transition disabled:opacity-50"
                >
                  Anulează
                </button>
              </div>
            </div>
          ) : (
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
          )}
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

        {/* Sesiuni Active — Revocare */}
        <div className="card p-6 mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted mb-5 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Sesiuni active
          </h2>
          <p className="text-text-secondary text-sm mb-4">
            Dacă suspectezi acces neautorizat, revocă toate sesiunile.
            Vei fi deconectat de pe toate dispozitivele.
          </p>
          <button
            onClick={handleRevokeAllSessions}
            disabled={revokeLoading}
            className="px-5 py-2.5 rounded-xl border border-danger/20 text-sm font-medium text-danger hover:bg-danger/10 transition disabled:opacity-50 flex items-center gap-2"
          >
            {revokeLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Se revocă...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                Deconectează de pe toate dispozitivele
              </>
            )}
          </button>
        </div>

        {/* Subscription Section */}
        <div className="card p-6 mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted mb-5 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            Abonament
          </h2>
          {subscription?.has_access ? (
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
                {subscription.cancel_at_period_end ? (
                  <span className="inline-flex items-center gap-1.5 text-warning font-medium text-sm">
                    <span className="w-2 h-2 rounded-full bg-warning" />
                    Se anulează
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-success font-medium text-sm">
                    <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                    Activ
                  </span>
                )}
              </div>
              {subscription.current_period_end && (
                <>
                  <div className="h-px bg-white/[0.06]" />
                  <div className="flex justify-between items-center">
                    <span className="text-text-secondary text-sm">
                      {subscription.cancel_at_period_end ? "Acces activ până la" : "Următoarea facturare"}
                    </span>
                    <span className="text-white text-sm">{new Date(subscription.current_period_end).toLocaleDateString("ro-RO", { year: "numeric", month: "long", day: "numeric" })}</span>
                  </div>
                </>
              )}
              <div className="h-px bg-white/[0.06]" />
              <p className="text-xs text-text-muted">
                Nu se oferă rambursări la anularea abonamentului. Accesul rămâne activ până la sfârșitul perioadei de facturare curente.
              </p>
              {subscription.cancel_at_period_end ? (
                <div className="bg-warning/10 p-3 rounded-xl">
                  <p className="text-warning text-sm font-medium">
                    Abonamentul tău va expira la {new Date(subscription.current_period_end!).toLocaleDateString("ro-RO", { year: "numeric", month: "long", day: "numeric" })}. Până atunci, ai acces complet la toate funcțiile planului tău.
                  </p>
                </div>
              ) : (
                <div className="flex gap-3 mt-2">
                  <button
                    onClick={handleCancel}
                    disabled={cancelLoading}
                    className="flex-1 py-2.5 rounded-xl border border-danger/20 text-sm font-medium text-danger hover:bg-danger/10 transition disabled:opacity-50"
                  >
                    {cancelLoading ? "Se deschide..." : "Anulează abonamentul"}
                  </button>
                </div>
              )}
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
        {subscription?.has_access && subscription.plan !== "elite" && !subscription.cancel_at_period_end && (
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
