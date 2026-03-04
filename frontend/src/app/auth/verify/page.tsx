"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const priceId = searchParams.get("priceId");
  const [resent, setResent] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--bg-deep)" }}>
      <div className="mesh-bg" />
      <div className="noise-overlay" />

      <div className="relative z-10 w-full max-w-md">
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

        <div className="card p-8 text-center">
          {/* Mail icon */}
          <div className="mx-auto mb-6 w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">Verifică-ți emailul</h1>
          <p className="text-text-secondary mb-6">
            Am trimis un link de verificare la{" "}
            <span className="text-white font-medium">{email}</span>.
            <br />
            Verifică și folder-ul spam.
          </p>

          <div className="space-y-4">
            <Link
              href={`/auth/signin${priceId ? `?priceId=${priceId}` : ""}`}
              className="btn btn-primary w-full py-3 text-base font-semibold inline-flex items-center justify-center"
            >
              Am verificat — Autentifică-mă
            </Link>

            <button
              onClick={() => setResent(true)}
              disabled={resent}
              className="btn btn-ghost w-full py-3 text-sm disabled:opacity-50"
            >
              {resent ? "Email retrimis ✓" : "Retrimite emailul de verificare"}
            </button>
          </div>

          <p className="mt-6 text-xs text-text-muted">
            Link-ul de verificare expiră în 24 de ore. Dacă nu primești emailul în 5 minute, verifică folder-ul spam sau încearcă din nou.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-deep)" }}>
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
