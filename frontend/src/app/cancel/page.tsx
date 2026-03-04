"use client";

import Link from "next/link";

export default function CancelPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#050a14" }}>
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 w-20 h-20 rounded-2xl bg-amber-500/10 flex items-center justify-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <h1 className="text-3xl font-extrabold text-white mb-3">Checkout anulat</h1>
        <p className="text-slate-400 text-lg mb-8">
          Nu ai fost taxat. Poți reveni oricând pentru a alege un plan.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 text-white font-semibold transition hover:shadow-[0_8px_24px_rgba(59,130,246,0.3)]"
          >
            Vezi Planurile
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-8 py-3 rounded-xl border border-white/10 text-slate-400 hover:text-white transition"
          >
            Pagina principală
          </Link>
        </div>
      </div>
    </div>
  );
}
