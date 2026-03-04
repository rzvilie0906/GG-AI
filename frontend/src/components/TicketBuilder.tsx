"use client";

import { TicketPick } from "@/lib/types";
import { ShoppingBag, Shield } from "./Icons";

interface TicketBuilderProps {
  ticket: TicketPick[];
  onRemovePick: (index: number) => void;
  onVerify?: () => void;
  isVerifying: boolean;
  disabled?: boolean;
}

export default function TicketBuilder({ ticket, onRemovePick, onVerify, isVerifying, disabled }: TicketBuilderProps) {
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

      {/* Verify Button */}
      <button
        onClick={onVerify}
        disabled={ticket.length < 2 || isVerifying || disabled || !onVerify}
        className="btn btn-primary w-full text-sm"
      >
        <Shield size={14} />
        {disabled ? "🔒 Disponibil pe Pro/Elite" : isVerifying ? "Se procesează..." : "Scanează Riscul (AI)"}
      </button>
    </div>
  );
}
