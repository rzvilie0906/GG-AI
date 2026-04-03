"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const CONSENT_KEY = "cookie_consent";

export type CookieConsent = "all" | "essential" | null;

/** Read cookie consent from localStorage */
export function getCookieConsent(): CookieConsent {
  if (typeof window === "undefined") return null;
  const val = localStorage.getItem(CONSENT_KEY);
  if (val === "all" || val === "essential") return val;
  return null;
}

/** Check if user accepted all cookies (including remember-me / persistent) */
export function hasFullCookieConsent(): boolean {
  return getCookieConsent() === "all";
}

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show banner only if user hasn't made a choice yet
    if (!getCookieConsent()) {
      setVisible(true);
    }
  }, []);

  const accept = (level: "all" | "essential") => {
    localStorage.setItem(CONSENT_KEY, level);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-[9999] p-4 md:p-6 animate-slide-up">
      <div
        className="max-w-2xl mx-auto rounded-2xl border border-white/10 p-5 md:p-6 shadow-2xl"
        style={{ background: "var(--bg-card)", backdropFilter: "blur(20px)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
            <path d="M8.5 8.5v.01" />
            <path d="M16 15.5v.01" />
            <path d="M12 12v.01" />
            <path d="M11 17v.01" />
            <path d="M7 14v.01" />
          </svg>
          <h3 className="text-white font-semibold text-base">Cookies &amp; Confidențialitate</h3>
        </div>

        {/* Description */}
        <p className="text-text-secondary text-sm leading-relaxed mb-4">
          Folosim <strong className="text-white">cookie-uri esențiale</strong> pentru funcționarea platformei 
          (autentificare, securitate) și <strong className="text-white">cookie-uri de persistență</strong> pentru 
          opțiunea &quot;Ține-mă minte&quot;. Nu folosim cookie-uri de tracking sau publicitate.{" "}
          <Link href="/confidentialitate" className="text-primary hover:text-primary-hover underline">
            Politica de confidențialitate
          </Link>
        </p>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => accept("all")}
            className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
            style={{ background: "var(--gradient-brand)" }}
          >
            Acceptă toate cookie-urile
          </button>
          <button
            onClick={() => accept("essential")}
            className="flex-1 px-5 py-2.5 rounded-xl text-sm font-medium text-text-secondary border border-white/10 hover:bg-white/5 transition-all"
          >
            Doar esențiale
          </button>
        </div>

        <p className="text-text-muted text-xs mt-3">
          Cookie-urile esențiale sunt necesare pentru autentificare și nu pot fi dezactivate. 
          Poți schimba preferințele oricând din pagina <Link href="/account" className="text-primary hover:underline">Cont</Link>.
        </p>
      </div>
    </div>
  );
}
