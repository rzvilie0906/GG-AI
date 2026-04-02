"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { sendPasswordResetEmail, setPersistence, browserLocalPersistence, browserSessionPersistence } from "firebase/auth";
import { auth } from "@/lib/firebase";
import Link from "next/link";
import { Suspense } from "react";
import { GoogleReCaptchaProvider, useGoogleReCaptcha } from "react-google-recaptcha-v3";

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "";

function SignInForm() {
  const { signIn, signInWithGoogle } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/dashboard";
  const priceId = searchParams.get("priceId");
  const { executeRecaptcha } = useGoogleReCaptcha();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!executeRecaptcha) {
      setError("Verificarea CAPTCHA nu este disponibilă. Reîncarcă pagina.");
      return;
    }

    setLoading(true);
    try {
      const captchaToken = await executeRecaptcha("signin");
      if (!captchaToken) {
        setError("Verificarea CAPTCHA a eșuat. Încearcă din nou.");
        setLoading(false);
        return;
      }
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      await signIn(email, password);
      // Creează token de remember pe backend (prin proxy Next.js)
      try {
        const fbToken = await auth.currentUser?.getIdToken();
        if (fbToken) {
          await fetch("/api/auth/remember", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${fbToken}`,
            },
            body: JSON.stringify({ remember: rememberMe }),
          });
        }
      } catch (e) {
        console.error("Remember token error:", e);
      }
      // If there's a priceId, go to checkout flow
      if (priceId) {
        router.push(`/pricing?priceId=${priceId}`);
      } else {
        router.push(redirect);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "EMAIL_NOT_VERIFIED") {
        setError("Te rugăm să îți verifici emailul înainte de a te autentifica. Verifică inbox-ul și folder-ul spam.");
      } else if (msg.includes("auth/invalid-credential") || msg.includes("auth/wrong-password")) {
        setError("Email sau parolă incorectă.");
      } else if (msg.includes("auth/user-not-found")) {
        setError("Nu există un cont cu acest email.");
      } else if (msg.includes("auth/too-many-requests")) {
        setError("Prea multe încercări. Încearcă din nou mai târziu.");
      } else {
        setError("Eroare la autentificare. Încearcă din nou.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email) {
      setError("Introdu adresa de email.");
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("auth/user-not-found")) {
        setError("Nu există un cont cu acest email.");
      } else if (msg.includes("auth/too-many-requests")) {
        setError("Prea multe încercări. Încearcă din nou mai târziu.");
      } else if (msg.includes("auth/invalid-email")) {
        setError("Adresa de email nu este validă.");
      } else {
        setError("Eroare la trimiterea emailului. Încearcă din nou.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");

    if (!executeRecaptcha) {
      setError("Verificarea CAPTCHA nu este disponibilă. Reîncarcă pagina.");
      return;
    }

    setLoading(true);
    try {
      const captchaToken = await executeRecaptcha("google_signin");
      if (!captchaToken) {
        setError("Verificarea CAPTCHA a eșuat. Încearcă din nou.");
        setLoading(false);
        return;
      }
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      const result = await signInWithGoogle();
      // Creează token de remember pe backend (prin proxy Next.js)
      try {
        const fbToken = await auth.currentUser?.getIdToken();
        if (fbToken) {
          await fetch("/api/auth/remember", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${fbToken}`,
            },
            body: JSON.stringify({ remember: rememberMe }),
          });
        }
      } catch (e) {
        console.error("Remember token error:", e);
      }
      if (result.needsProfile) {
        const params = new URLSearchParams();
        params.set("redirect", priceId ? `/pricing?priceId=${priceId}` : redirect);
        if (priceId) params.set("priceId", priceId);
        router.push(`/auth/complete-profile?${params.toString()}`);
      } else if (priceId) {
        router.push(`/pricing?priceId=${priceId}`);
      } else {
        router.push(redirect);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: string })?.code;
      console.error("Google sign-in error:", code, msg);
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        setError("");
      } else if (code === "auth/unauthorized-domain") {
        setError("Domeniul nu este autorizat în Firebase. Contactează suportul.");
      } else {
        setError("Eroare la autentificarea cu Google.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--bg-deep)" }}>
      <div className="mesh-bg" />
      <div className="noise-overlay" />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-violet flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-white">
              GG-<span className="text-primary">AI</span>
            </span>
          </Link>
        </div>

        {/* Card */}
        <div className="card p-8">
          {resetMode ? (
            // ── Password Reset Mode ──
            <>
              <h1 className="text-2xl font-bold text-white mb-2">Resetare parolă</h1>
              <p className="text-text-secondary mb-6">Introdu emailul și îți vom trimite un link de resetare.</p>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
                  {error}
                </div>
              )}

              {resetSent ? (
                <div className="mb-4 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                  <p className="font-medium mb-1">Email trimis cu succes!</p>
                  <p>Verifică inbox-ul (și folder-ul spam) pentru linkul de resetare a parolei.</p>
                </div>
              ) : (
                <form onSubmit={handlePasswordReset} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="input-field w-full"
                      placeholder="email@exemplu.com"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn btn-primary w-full py-3 text-base font-semibold disabled:opacity-50"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Se trimite...
                      </span>
                    ) : (
                      "Trimite link de resetare"
                    )}
                  </button>
                </form>
              )}

              <p className="mt-6 text-center text-sm text-text-secondary">
                <button
                  onClick={() => { setResetMode(false); setResetSent(false); setError(""); }}
                  className="text-primary hover:text-primary-hover font-medium"
                >
                  Înapoi la autentificare
                </button>
              </p>
            </>
          ) : (
            // ── Sign In Mode ──
            <>
          <h1 className="text-2xl font-bold text-white mb-2">Bine ai revenit</h1>
          <p className="text-text-secondary mb-6">Autentifică-te pentru a accesa platforma.</p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
              {error}
            </div>
          )}

          {/* Google button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white font-medium transition-all disabled:opacity-50 mb-6"
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continuă cu Google
          </button>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-text-muted text-sm">sau cu email</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Email form */}
          <form onSubmit={handleEmailSignIn} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input-field w-full"
                placeholder="email@exemplu.com"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-text-secondary">Parolă</label>
                <button
                  type="button"
                  onClick={() => { setResetMode(true); setError(""); }}
                  className="text-xs text-primary hover:text-primary-hover font-medium"
                >
                  Ai uitat parola?
                </button>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="input-field w-full"
                placeholder="••••••••"
              />
            </div>

            {/* Remember me checkbox */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-white/5 text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer accent-[var(--primary)]"
              />
              <label htmlFor="rememberMe" className="text-sm text-text-secondary cursor-pointer select-none">
                Rămâi autentificat
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full py-3 text-base font-semibold disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Se autentifică...
                </span>
              ) : (
                "Autentificare"
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-text-secondary">
            Nu ai cont?{" "}
            <Link
              href={`/auth/signup${priceId ? `?priceId=${priceId}` : ""}`}
              className="text-primary hover:text-primary-hover font-medium"
            >
              Creează cont
            </Link>
          </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-deep)" }}>
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    }>
      <GoogleReCaptchaProvider reCaptchaKey={RECAPTCHA_SITE_KEY}>
        <SignInForm />
      </GoogleReCaptchaProvider>
    </Suspense>
  );
}
