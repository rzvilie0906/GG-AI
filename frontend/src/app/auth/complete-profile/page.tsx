"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import Link from "next/link";
import { Suspense } from "react";
import { GoogleReCaptchaProvider, useGoogleReCaptcha } from "react-google-recaptcha-v3";

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

function CompleteProfileForm() {
  const { user, loading, getIdToken } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/dashboard";
  const priceId = searchParams.get("priceId");

  const { executeRecaptcha } = useGoogleReCaptcha();
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill name from Google displayName if available
  useEffect(() => {
    if (user?.displayName && !fullName) {
      setFullName(user.displayName);
    }
  }, [user, fullName]);

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/signin");
    }
  }, [user, loading, router]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!fullName.trim()) {
      setError("Numele complet este obligatoriu.");
      return;
    }
    if (!dateOfBirth || !parseDob(dateOfBirth)) {
      setError("Data nasterii este obligatorie (format: ZZ/LL/AAAA).");
      return;
    }
    if (calculateAge(dateOfBirth) < 18) {
      setError("Trebuie sa ai cel putin 18 ani pentru a te inregistra.");
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

    setSubmitting(true);
    try {
      const captchaToken = await executeRecaptcha("complete_profile");
      if (!captchaToken) {
        setError("Verificarea CAPTCHA a eșuat. Încearcă din nou.");
        setSubmitting(false);
        return;
      }
    } catch {
      setError("Verificarea CAPTCHA a eșuat.");
      setSubmitting(false);
      return;
    }
    try {
      const token = await getIdToken();
      if (!token || !user) throw new Error("Nu esti autentificat.");

      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          uid: user.uid,
          email: user.email,
          provider: "google",
          full_name: fullName.trim(),
          date_of_birth: dobToIso(dateOfBirth),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Eroare la salvarea profilului.");
      }

      // Redirect to original destination
      if (priceId) {
        router.push(`/pricing?priceId=${priceId}`);
      } else {
        router.push(redirect);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("18")) {
        setError("Trebuie sa ai cel putin 18 ani pentru a te inregistra.");
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-deep)" }}>
        <div className="animate-spin h-10 w-10 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--bg-deep)" }}>
      <div className="mesh-bg" />
      <div className="noise-overlay" />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <img src="/logo.png" alt="GG-AI" className="h-11 w-auto object-contain rounded-xl" />
          </Link>
        </div>

        {/* Card */}
        <div className="card p-8">
          <h1 className="text-2xl font-bold text-white mb-2">Completeaza profilul</h1>
          <p className="text-text-secondary mb-6">
            Mai avem nevoie de cateva informatii pentru a-ti activa contul.
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
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
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Data nasterii (ZZ/LL/AAAA)</label>
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
              <p className="text-xs text-text-muted mt-1">Trebuie sa ai cel putin 18 ani.</p>
            </div>

            {/* Terms and conditions checkbox */}
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="acceptTermsProfile"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-white/20 bg-white/5 text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer accent-[var(--primary)]"
              />
              <label htmlFor="acceptTermsProfile" className="text-sm text-text-secondary leading-relaxed cursor-pointer">
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
              disabled={submitting}
              className="btn btn-primary w-full py-3 text-base font-semibold disabled:opacity-50"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Se salveaza...
                </span>
              ) : (
                "Salveaza si continua"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function CompleteProfilePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-deep)" }}>
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    }>
      <GoogleReCaptchaProvider reCaptchaKey={RECAPTCHA_SITE_KEY}>
        <CompleteProfileForm />
      </GoogleReCaptchaProvider>
    </Suspense>
  );
}
