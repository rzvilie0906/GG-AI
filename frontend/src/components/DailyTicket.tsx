"use client";

import { useState, useEffect } from "react";
import { loadDailyTicket as fetchDailyTicket } from "@/lib/api";
import { DailyTicketData } from "@/lib/types";
import { Star, Zap } from "./Icons";

const ticketTypes = [
  { key: "mixed", label: "Mixt" },
  { key: "football", label: "Fotbal" },
  { key: "basketball", label: "Baschet" },
  { key: "hockey", label: "Hochei" },
];

export default function DailyTicket() {
  const [activeType, setActiveType] = useState("mixed");
  const [data, setData] = useState<DailyTicketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    loadTicket(activeType);
  }, [activeType]);

  async function loadTicket(type: string) {
    setLoading(true);
    setError(false);
    try {
      const result = await fetchDailyTicket(type);
      setData(result);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-[rgba(255,255,255,0.06)] bg-gradient-to-r from-primary/5 to-transparent">
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-primary to-violet flex items-center justify-center">
          <Star className="text-white" size={12} />
        </div>
        <span className="text-sm font-bold text-text-main tracking-tight">Recomandare AI Azi</span>
      </div>

      <div className="p-4">
        {/* Type Tabs */}
        <div className="flex gap-1.5 mb-4">
          {ticketTypes.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveType(t.key)}
              className={`px-3 py-1.5 rounded-md font-semibold cursor-pointer transition-all text-xs font-ui border ${
                activeType === t.key
                  ? "bg-primary/15 text-primary border-primary/25"
                  : "bg-transparent text-text-muted border-transparent hover:text-text-secondary hover:bg-[rgba(255,255,255,0.03)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center py-8 gap-3">
            <div className="w-8 h-8 border-[2.5px] border-primary/20 border-t-primary rounded-full animate-spin" />
            <div className="font-medium text-sm text-text-secondary">Se generează biletul zilei...</div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="text-center text-text-muted text-xs py-5 font-mono">
            Nu s-a putut încărca biletul.
          </div>
        )}

        {/* Data */}
        {!loading && !error && data && (
          <>
            {data.ticket.length === 0 ? (
              <div className="text-center text-text-muted text-xs py-5">
                {data.message
                  ? <span>{data.message}</span>
                  : <span>Nu există bilet generat pentru azi. Revino după ora 10:00 pentru a vedea biletul zilei!</span>
                }
              </div>
            ) : (
              <>
                {/* Date badge */}
                <div className="flex items-center justify-center mb-4">
                  <span className="badge bg-primary-soft text-primary text-[11px]">
                    {data.date || new Date().toLocaleDateString("ro-RO")}
                  </span>
                </div>

                {/* Picks */}
                <div className="flex flex-col gap-2">
                  {data.ticket.map((pick, idx) => (
                    <div
                      key={idx}
                      className="bg-surface-elevated/40 rounded-lg p-3 border border-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.08)] transition-all"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-[13px] text-text-main leading-snug">{pick.match}</div>
                          <div className="text-[11px] text-text-muted mt-0.5">{pick.league}</div>
                        </div>
                        <span className="badge bg-primary-soft text-primary text-xs font-mono font-bold flex-shrink-0">
                          {pick.odds}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-text-secondary">
                        {pick.market}: <span className="font-semibold text-text-main">{pick.pick}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Total Odds */}
                <div className="mt-4 p-3.5 rounded-lg bg-gradient-to-r from-primary to-violet text-center">
                  <div className="text-[10px] font-bold text-white/70 uppercase tracking-widest mb-0.5">Cotă Finală</div>
                  <div className="text-2xl font-black text-white flex items-center justify-center gap-1.5">
                    <Zap className="text-white/80" size={18} />
                    {String(data.total_odds || "N/A")}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
