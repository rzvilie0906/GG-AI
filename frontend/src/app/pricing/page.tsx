"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { Suspense } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const PRICE_WEEKLY = process.env.NEXT_PUBLIC_STRIPE_PRICE_WEEKLY || "";
const PRICE_PRO_MONTHLY = process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY || "";
const PRICE_PRO_YEARLY = process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY || "";
const PRICE_ELITE_MONTHLY = process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_MONTHLY || "";
const PRICE_ELITE_YEARLY = process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_YEARLY || "";

interface Plan {
  id: string;
  name: string;
  price: string;
  period: string;
  priceId: string;
  features: string[];
  highlight?: boolean;
  accent?: boolean;
  ribbon?: string;
}

function PricingContent() {
  const { user, loading, subscription, getIdToken, refreshSubscription } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoCheckout = searchParams.get("priceId");
  const isUpgradeMode = searchParams.get("upgrade") === "true";

  const [proAnnual, setProAnnual] = useState(false);
  const [eliteAnnual, setEliteAnnual] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const currentPlan = subscription?.plan || null;

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/signin?redirect=/pricing");
    }
  }, [user, loading, router]);

  // If user already has active subscription and NOT in upgrade mode, redirect to dashboard
  useEffect(() => {
    if (!loading && subscription?.status === "active" && !isUpgradeMode) {
      router.replace("/dashboard");
    }
  }, [subscription, loading, router, isUpgradeMode]);

  // Auto-trigger checkout if priceId is in URL (coming from landing page CTA)
  useEffect(() => {
    if (autoCheckout && user && !loading) {
      handleCheckout(autoCheckout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCheckout, user, loading]);

  async function handleCheckout(priceId: string) {
    setError("");
    setCheckoutLoading(priceId);

    try {
      const token = await getIdToken();
      if (!token) throw new Error("Nu esti autentificat.");

      const res = await fetch(`${API_BASE}/api/billing/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ price_id: priceId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Eroare la crearea sesiunii de checkout.");
      }

      const data = await res.json();
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Eroare necunoscuta.");
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function handleUpgrade(priceId: string) {
    setError("");
    setSuccessMsg("");
    setCheckoutLoading(priceId);

    try {
      const token = await getIdToken();
      if (!token) throw new Error("Nu esti autentificat.");

      const res = await fetch(`${API_BASE}/api/billing/upgrade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ price_id: priceId }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Eroare la schimbarea planului.");
      }

      setSuccessMsg(data.message || "Planul a fost schimbat cu succes.");
      // For upgrades, the plan change takes effect after payment via webhook
      // Refresh after a short delay to give webhook time to process
      if (data.effective === "after_payment") {
        setTimeout(() => refreshSubscription(), 3000);
      } else {
        await refreshSubscription();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Eroare necunoscuta.");
    } finally {
      setCheckoutLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#050a14" }}>
        <div className="animate-spin h-10 w-10 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  const plans: Plan[] = [
    {
      id: "weekly",
      name: "Săptămânal",
      price: "€14.99",
      period: "/săptămână",
      priceId: PRICE_WEEKLY,
      features: [
        "4 bilete zilnice",
        "Max 7 analize meciuri / zi",
        "Pariu Principal + Secundar",
        "Interval de cote ajustat",
        "Calendar meciuri +7 zile",
      ],
    },
    {
      id: "pro",
      name: "Pro",
      price: proAnnual ? "€399.99" : "€39.99",
      period: proAnnual ? "/an" : "/lună",
      priceId: proAnnual ? PRICE_PRO_YEARLY : PRICE_PRO_MONTHLY,
      highlight: true,
      ribbon: "FAVORITUL PUBLICULUI",
      features: [
        "Tot ce include Săptămânal",
        "Analize meciuri nelimitate",
        "Analizor Risc Bilet (max 7/zi)",
        "Scoring premium & explicații detaliate",
        "Anulezi oricând",
      ],
    },
    {
      id: "elite",
      name: "Elite",
      price: eliteAnnual ? "€999.99" : "€99.99",
      period: eliteAnnual ? "/an" : "/lună",
      priceId: eliteAnnual ? PRICE_ELITE_YEARLY : PRICE_ELITE_MONTHLY,
      accent: true,
      ribbon: "CEL MAI BUN",
      features: [
        "Tot ce include Pro",
        "Analizor Risc Bilet nelimitat",
        "Prioritate maximă la procesare",
        "Urmărire avansată a cotelor",
        "Suport prioritar 24/7",
      ],
    },
  ];

  return (
    <div className="min-h-screen" style={{ background: "#050a14", color: "#e2e8f0", fontFamily: "'Inter', sans-serif" }}>
      {/* Topbar */}
      <div className="border-b border-white/[0.06] bg-[#0a1628]/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-white no-underline">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <span className="text-lg font-extrabold">GG-<span className="text-blue-500">AI</span></span>
          </Link>
          <Link href={isUpgradeMode ? "/dashboard" : "/"} className="text-sm text-slate-400 hover:text-white transition">
            {isUpgradeMode ? "← Dashboard" : "← Inapoi"}
          </Link>
        </div>
      </div>

      {/* Header */}
      <div className="text-center pt-16 pb-8 px-6">
        <h1 className="text-4xl font-extrabold mb-3">
          {isUpgradeMode ? "Schimba planul" : "Alege planul tau"}
        </h1>
        <p className="text-slate-400 text-lg max-w-xl mx-auto">
          {isUpgradeMode
            ? "Alege un plan nou. Upgrade-urile se activeaza imediat, iar downgrade-urile la sfarsitul perioadei curente."
            : "Toate planurile includ bilete zilnice AI. Anulezi oricand fara penalitati."
          }
        </p>
      </div>

      {error && (
        <div className="max-w-xl mx-auto px-6 mb-6">
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {error}
          </div>
        </div>
      )}

      {successMsg && (
        <div className="max-w-xl mx-auto px-6 mb-6">
          <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm text-center">
            {successMsg}
            <button
              onClick={() => router.push("/dashboard")}
              className="block mx-auto mt-3 px-6 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition"
            >
              Inapoi la Dashboard
            </button>
          </div>
        </div>
      )}

      {/* Plans grid */}
      <div className="max-w-5xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-2xl border overflow-hidden relative transition-all hover:-translate-y-1 ${
                plan.highlight
                  ? "border-blue-500/30 shadow-[0_0_40px_rgba(59,130,246,0.1)]"
                  : plan.accent
                  ? "border-cyan-500/30 shadow-[0_0_40px_rgba(0,209,255,0.1)]"
                  : "border-white/[0.06]"
              }`}
              style={{ background: "#0a1628" }}
            >
              {plan.ribbon && (
                <div
                  className={`text-center py-2 text-[11px] font-extrabold tracking-widest text-white ${
                    plan.accent
                      ? "bg-gradient-to-r from-cyan-500 to-sky-500"
                      : "bg-gradient-to-r from-blue-500 to-violet-500"
                  }`}
                >
                  {plan.ribbon}
                </div>
              )}
              <div className="p-8">
                <h3 className="text-xl font-extrabold mb-1">{plan.name}</h3>

                {/* Toggle for Pro/Elite */}
                {plan.id === "pro" && (
                  <div className="flex gap-1 p-1 rounded-lg bg-white/[0.04] mt-4 mb-3">
                    <button
                      className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold transition ${!proAnnual ? "bg-blue-500 text-white" : "text-slate-500"}`}
                      onClick={() => setProAnnual(false)}
                    >Lunar</button>
                    <button
                      className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold transition ${proAnnual ? "bg-blue-500 text-white" : "text-slate-500"}`}
                      onClick={() => setProAnnual(true)}
                    >Anual</button>
                  </div>
                )}
                {plan.id === "elite" && (
                  <div className="flex gap-1 p-1 rounded-lg bg-white/[0.04] mt-4 mb-3">
                    <button
                      className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold transition ${!eliteAnnual ? "bg-cyan-500 text-white" : "text-slate-500"}`}
                      onClick={() => setEliteAnnual(false)}
                    >Lunar</button>
                    <button
                      className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold transition ${eliteAnnual ? "bg-cyan-500 text-white" : "text-slate-500"}`}
                      onClick={() => setEliteAnnual(true)}
                    >Anual</button>
                  </div>
                )}

                <div className="mt-4 mb-2">
                  <span className="text-4xl font-black tracking-tight">{plan.price}</span>
                  <span className="text-sm text-slate-500 ml-1">{plan.period}</span>
                </div>

                {plan.id === "pro" && proAnnual && (
                  <div className="mb-4 inline-block px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold animate-[fadeIn_0.3s_ease-out]">
                    🎉 Economisești 80€ — doar 33.33€/lună!
                  </div>
                )}
                {plan.id === "elite" && eliteAnnual && (
                  <div className="mb-4 inline-block px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold animate-[fadeIn_0.3s_ease-out]">
                    🎉 Economisești 200€ — doar 83.33€/lună!
                  </div>
                )}

                {isUpgradeMode && currentPlan === plan.id ? (
                  <div className="w-full py-3 rounded-xl font-semibold text-sm text-center border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                    Planul tau actual
                  </div>
                ) : (
                  <button
                    onClick={() => isUpgradeMode ? handleUpgrade(plan.priceId) : handleCheckout(plan.priceId)}
                    disabled={!!checkoutLoading || !!successMsg}
                    className={`w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 ${
                      plan.accent
                        ? "bg-gradient-to-r from-cyan-500 to-sky-500 text-white hover:shadow-[0_8px_24px_rgba(0,209,255,0.3)]"
                        : plan.highlight
                        ? "bg-gradient-to-r from-blue-500 to-violet-500 text-white hover:shadow-[0_8px_24px_rgba(59,130,246,0.3)]"
                        : "border border-white/10 bg-white/5 text-white hover:bg-white/10"
                    }`}
                  >
                    {checkoutLoading === plan.priceId ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Se proceseaza...
                      </span>
                    ) : isUpgradeMode ? (
                      `Schimba la ${plan.name}`
                    ) : (
                      `Activeaza ${plan.name}`
                    )}
                  </button>
                )}

                <div className="h-px bg-white/[0.06] my-6" />

                <ul className="space-y-3">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-slate-400">
                      <svg className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#050a14" }}>
        <div className="animate-spin h-10 w-10 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    }>
      <PricingContent />
    </Suspense>
  );
}
