"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
import { useAuth } from "@/lib/AuthContext";
import { Suspense } from "react";

function SuccessContent() {
  const { refreshSubscription, subscription } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Poll subscription status every 2s until it becomes active (max 30s)
    let attempts = 0;
    const maxAttempts = 15;

    const poll = async () => {
      attempts++;
      await refreshSubscription();
    };

    // Start polling immediately
    poll();
    pollRef.current = setInterval(() => {
      if (attempts >= maxAttempts) {
        if (pollRef.current) clearInterval(pollRef.current);
        setStatus("ready");
        return;
      }
      poll();
    }, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refreshSubscription]);

  // Redirect to dashboard once subscription is active
  useEffect(() => {
    if (subscription?.has_access) {
      if (pollRef.current) clearInterval(pollRef.current);
      setStatus("ready");
      const timer = setTimeout(() => {
        router.replace("/dashboard");
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [subscription, router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#050a14" }}>
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 w-20 h-20 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <h1 className="text-3xl font-extrabold text-white mb-3">Plata a fost procesată!</h1>
        <p className="text-slate-400 text-lg mb-8">
          {subscription?.has_access
            ? "Abonamentul tău este activ! Redirecționare către dashboard..."
            : "Se activează abonamentul... Vei fi redirecționat automat."}
        </p>
        {!subscription?.has_access && status === "loading" && (
          <div className="mb-6 flex justify-center">
            <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        )}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 text-white font-semibold transition hover:shadow-[0_8px_24px_rgba(59,130,246,0.3)]"
        >
          Mergi la Dashboard
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </Link>
        {sessionId && (
          <p className="mt-6 text-xs text-slate-600">Session: {sessionId}</p>
        )}
        {/* Google Ads conversion tracking */}
        <Script id="gtag-conversion" strategy="afterInteractive">
          {`
            if (typeof gtag === 'function') {
              gtag('event', 'conversion', {
                'send_to': 'AW-18092407509/lw_WCIus6JwcENX1kLND',
                'value': 1.0,
                'currency': 'RON',
                'transaction_id': '${sessionId || ""}'
              });
            }
          `}
        </Script>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#050a14" }}>
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}
