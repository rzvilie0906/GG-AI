"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import Link from "next/link";
import { Suspense } from "react";
import { GoogleReCaptchaProvider, useGoogleReCaptcha } from "react-google-recaptcha-v3";

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "";

function SignUpForm() {
  const { signUp, signInWithGoogle } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const priceId = searchParams.get("priceId");
  const { executeRecaptcha } = useGoogleReCaptcha();

  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const parseDob = (dob: string): Date | null => {
    const parts = dob.split("/");
    if (parts.length !== 3) return null;
    const [dd, mm, yyyy] = parts;
    if (!dd || !mm || !yyyy || yyyy.length !== 4) return null;
    const d = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
    if (isNaN(d.getTime())) return null;
    return d;
  };

  const calculateAge = (dob: string): number => {
    const birth = parseDob(dob);
    if (!birth) return -1;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const dobToIso = (dob: string): string => {
    const parts = dob.split("/");
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!fullName.trim()) {
      setError("Numele complet este obligatoriu.");
      return;
    }
    if (!dateOfBirth || !parseDob(dateOfBirth)) {
      setError("Data nașterii este obligatorie (format: ZZ/LL/AAAA).");
      return;
    }
    if (calculateAge(dateOfBirth) < 18) {
      setError("Trebuie să ai cel puțin 18 ani pentru a te înregistra.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Parolele nu se potrivesc.");
      return;
    }
    if (password.length < 6) {
      setError("Parola trebuie să aibă cel puțin 6 caractere.");
      return;
    }
    if (!acceptedTerms) {
      setError("Trebuie să accepți termenii și condițiile și politica de confidențialitate.");
      return;
    }
    if (!executeRecaptcha) {
      setError("Verificarea CAPTCHA nu este disponibilă. Reîncarcă pagina.");
      return;
    }

    setLoading(true);
    try {
      const captchaToken = await executeRecaptcha("signup");
      if (!captchaToken) {
        setError("Verificarea CAPTCHA a eșuat. Încearcă din nou.");
        setLoading(false);
        return;
      }
      await signUp(email, password, fullName.trim(), dobToIso(dateOfBirth));
      // Redirect to verification page
      router.push(`/auth/verify?email=${encodeURIComponent(email)}${priceId ? `&priceId=${priceId}` : ""}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("auth/email-already-in-use")) {
        setError("Un cont cu acest email există deja. Încearcă să te autentifici.");
      } else if (msg.includes("auth/weak-password")) {
        setError("Parola este prea slabă. Folosește cel puțin 6 caractere.");
      } else if (msg.includes("auth/invalid-email")) {
        setError("Adresa de email nu este validă.");
      } else if (msg.includes("18")) {
        setError("Trebuie să ai cel puțin 18 ani pentru a te înregistra.");
      } else {
        setError("Eroare la crearea contului. Încearcă din nou.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setError("");

    if (!acceptedTerms) {
      setError("Trebuie să accepți termenii și condițiile și politica de confidențialitate.");
      return;
    }

    setLoading(true);
    try {
      // Open Google popup FIRST (must be direct user gesture for mobile)
      const result = await signInWithGoogle();
      // Run reCAPTCHA after (non-blocking)
      if (executeRecaptcha) {
        await executeRecaptcha("google_signup").catch(() => {});
      }
      if (result.needsProfile) {
        const params = new URLSearchParams();
        params.set("redirect", priceId ? `/pricing?priceId=${priceId}` : "/dashboard");
        if (priceId) params.set("priceId", priceId);
        router.push(`/auth/complete-profile?${params.toString()}`);
      } else if (priceId) {
        router.push(`/pricing?priceId=${priceId}`);
      } else {
        router.push("/dashboard");
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
          <h1 className="text-2xl font-bold text-white mb-2">Creează cont</h1>
          <p className="text-text-secondary mb-6">Înregistrează-te pentru a începe să folosești GG-AI.</p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
              {error}
            </div>
          )}

          {/* Google button */}
          <button
            onClick={handleGoogleSignUp}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white font-medium transition-all disabled:opacity-50 mb-6"
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continuă cu Google
          </button>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-text-muted text-sm">sau cu email</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Email form */}
          <form onSubmit={handleEmailSignUp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Nume complet</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="input-field w-full"
                placeholder="Ion Popescu"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Data nașterii (ZZ/LL/AAAA)</label>
              <input
                type="text"
                value={dateOfBirth}
                onChange={(e) => {
                  let v = e.target.value.replace(/[^0-9]/g, "");
                  if (v.length > 8) v = v.slice(0, 8);
                  if (v.length >= 5) v = v.slice(0, 2) + "/" + v.slice(2, 4) + "/" + v.slice(4);
                  else if (v.length >= 3) v = v.slice(0, 2) + "/" + v.slice(2);
                  setDateOfBirth(v);
                }}
                required
                maxLength={10}
                className="input-field w-full"
                placeholder="31/12/2000"
              />
            </div>
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
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Parolă</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="input-field w-full"
                placeholder="Minim 6 caractere"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Confirmă parola</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="input-field w-full"
                placeholder="Repetă parola"
              />
            </div>

            {/* Terms and conditions checkbox */}
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="acceptTerms"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-white/20 bg-white/5 text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer accent-[var(--primary)]"
              />
              <label htmlFor="acceptTerms" className="text-sm text-text-secondary leading-relaxed cursor-pointer">
                Înscriindu-vă, acceptați{" "}
                <Link href="/termeni" target="_blank" className="text-primary hover:text-primary-hover font-medium underline">
                  termenii și condițiile
                </Link>{" "}
                și{" "}
                <Link href="/confidentialitate" target="_blank" className="text-primary hover:text-primary-hover font-medium underline">
                  politica de confidențialitate
                </Link>.
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
                  Se creează contul...
                </span>
              ) : (
                "Creează cont"
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-text-secondary">
            Ai deja cont?{" "}
            <Link
              href={`/auth/signin${priceId ? `?priceId=${priceId}` : ""}`}
              className="text-primary hover:text-primary-hover font-medium"
            >
              Autentifică-te
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-deep)" }}>
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    }>
      <GoogleReCaptchaProvider reCaptchaKey={RECAPTCHA_SITE_KEY}>
        <SignUpForm />
      </GoogleReCaptchaProvider>
    </Suspense>
  );
}
