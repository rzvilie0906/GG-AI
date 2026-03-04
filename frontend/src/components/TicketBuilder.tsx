"use client";

import { useState, useEffect } from "react";
import { TicketPick } from "@/lib/types";
import { ShoppingBag, Shield, Clock } from "./Icons";

function RiskCountdown({ resetAt }: { resetAt: string }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    function update() {
      const diff = new Date(resetAt).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft("00:00:00"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [resetAt]);

  return (
    <span className="font-mono text-sm font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
      {timeLeft}
    </span>
  );
}

interface TicketBuilderProps {
  ticket: TicketPick[];
  onRemovePick: (index: number) => void;
  onVerify?: () => void;
  isVerifying: boolean;
  disabled?: boolean;
  riskQuotaResetAt?: string | null;
  riskQuotaMessage?: string | null;
}

export default function TicketBuilder({ ticket, onRemovePick, onVerify, isVerifying, disabled, riskQuotaResetAt, riskQuotaMessage }: TicketBuilderProps) {
  return (
    <div className="card p-3.5 border-primary/10">
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2 text-sm font-bold text-text-main">
          <ShoppingBag className="text-primary" size={15} />
          Biletul Meu
        </div>
        <span className="badge bg-primary-soft text-primary text-[10px]">
          {ticket.length} meciuri
        </span>
      </div>

      {/* Ticket List */}
      <div className="max-h-[140px] overflow-y-auto mb-3 flex flex-col gap-1.5 custom-scroll">
        {ticket.length === 0 ? (
          <div className="text-center text-text-muted text-xs py-4 px-3 bg-[rgba(255,255,255,0.02)] rounded-lg border border-dashed border-[rgba(255,255,255,0.06)]">
            Biletul este gol. Adaugă meciuri din analiză.
          </div>
        ) : (
          ticket.map((item, idx) => (
            <div
              key={idx}
              className="bg-surface-elevated/50 px-3 py-2 rounded-lg flex justify-between items-center group transition-all hover:bg-surface-elevated"
            >
              <div className="min-w-0 flex-1 mr-2">
                <div className="font-semibold text-white text-xs leading-snug truncate">{item.match}</div>
                <div className="text-primary text-[11px] font-mono mt-0.5">{item.pick}</div>
              </div>
              <button
                onClick={() => onRemovePick(idx)}
                className="bg-transparent border-none text-danger/50 cursor-pointer text-sm px-1 py-0.5 hover:text-danger transition-colors flex-shrink-0"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      {/* Risk Quota Lock */}
      {riskQuotaResetAt && (
        <div className="mb-3 p-3 rounded-xl border border-primary/20 bg-primary/5 text-center">
          <div className="flex items-center justify-center gap-2 mb-1.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="text-xs font-bold text-text-main">Limită atinsă</span>
          </div>
          <div className="text-[11px] text-text-muted leading-relaxed mb-2">
            {riskQuotaMessage || "Ai atins limita zilnică de analize de risc."}
          </div>
          <div className="inline-flex items-center gap-2 bg-surface-elevated/60 border border-[rgba(255,255,255,0.08)] px-3 py-1.5 rounded-lg">
            <Clock className="text-primary opacity-80" size={12} />
            <div className="flex flex-col items-start">
              <span className="text-[9px] uppercase tracking-widest text-text-muted font-semibold">Se resetează în</span>
              <RiskCountdown resetAt={riskQuotaResetAt} />
            </div>
          </div>
        </div>
      )}

      {/* Verify Button */}
      <button
        onClick={onVerify}
        disabled={ticket.length < 2 || isVerifying || disabled || !onVerify || !!riskQuotaResetAt}
        className="btn btn-primary w-full text-sm"
      >
        <Shield size={14} />
        {disabled ? "🔒 Disponibil pe Pro/Elite" : riskQuotaResetAt ? "🔒 Limită atinsă" : isVerifying ? "Se procesează..." : "Scanează Riscul (AI)"}
      </button>
    </div>
  );
}
