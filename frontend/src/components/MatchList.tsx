"use client";

import { useRef } from "react";
import { Fixture } from "@/lib/types";
import { fmtTime } from "@/lib/utils";

interface MatchListProps {
  fixtures: Fixture[];
  selectedMatchId: string | null;
  onSelectMatch: (fixture: Fixture) => void;
}

function getDisplayStatus(fixture: Fixture): { label: string; type: "live" | "finished" | "upcoming" } {
  const statusNorm = fixture.status_norm || "upcoming";
  const matchTime = new Date(fixture.start_time_utc).getTime();
  const now = Date.now();
  const hoursPassed = (now - matchTime) / (1000 * 60 * 60);

  if (statusNorm === "finished") return { label: "FIN", type: "finished" };
  if (statusNorm === "live") return { label: "LIVE", type: "live" };
  if (statusNorm === "upcoming") {
    if (hoursPassed > 3.5) return { label: "FIN", type: "finished" };
    if (hoursPassed > 0 && hoursPassed <= 3.5) return { label: "LIVE", type: "live" };
    return { label: fmtTime(fixture.start_time_utc), type: "upcoming" };
  }
  return { label: fixture.status || "—", type: "upcoming" };
}

export default function MatchList({ fixtures, selectedMatchId, onSelectMatch }: MatchListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  if (!fixtures.length) {
    return (
      <div className="p-8 text-center text-text-muted text-xs">
        Nu există meciuri disponibile.
      </div>
    );
  }

  const scrollUp = () => {
    listRef.current?.scrollBy({ top: -300, behavior: "smooth" });
  };
  const scrollDown = () => {
    listRef.current?.scrollBy({ top: 300, behavior: "smooth" });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      {/* Scroll up button */}
      <button
        onClick={scrollUp}
        className="sticky top-0 z-10 w-full py-1 bg-[#0d1117]/90 backdrop-blur-sm border-b border-white/[0.06] text-text-muted hover:text-primary transition flex items-center justify-center gap-1"
        aria-label="Scroll sus"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="18 15 12 9 6 15" />
        </svg>
        <span className="text-[10px] font-medium uppercase tracking-wider">Sus</span>
      </button>

      <div
        ref={listRef}
        className="overflow-y-auto flex-1 min-h-0 custom-scroll p-2 flex flex-col gap-1"
        style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}
      >
      {fixtures.map((m) => {
        const display = getDisplayStatus(m);
        const isSelected = selectedMatchId === m.id;

        return (
          <div
            key={m.id}
            onClick={() => onSelectMatch(m)}
            className={`px-3 py-2.5 rounded-lg cursor-pointer flex justify-between items-center transition-all duration-200 group ${
              isSelected
                ? "bg-primary/10 ring-1 ring-primary/30"
                : "hover:bg-[rgba(255,255,255,0.03)]"
            }`}
          >
            <div className="min-w-0 flex-1 mr-3">
              <div className={`font-semibold text-[13px] leading-snug truncate ${isSelected ? "text-white" : "text-text-main group-hover:text-white"} transition-colors`}>
                {m.home_team} <span className="text-text-muted font-normal mx-0.5">v</span> {m.away_team}
              </div>
              <div className="text-[11px] text-text-muted mt-0.5 truncate">{m.league_name}</div>
            </div>

            <div className="flex-shrink-0">
              {display.type === "live" ? (
                <span className="badge bg-live/15 text-live text-[10px]">
                  <span className="live-dot mr-1" />
                  LIVE
                </span>
              ) : display.type === "finished" ? (
                <span className="badge bg-[rgba(255,255,255,0.04)] text-text-muted text-[10px]">
                  FIN
                </span>
              ) : (
                <span className="badge bg-[rgba(255,255,255,0.04)] text-text-secondary text-[10px] font-mono">
                  {display.label}
                </span>
              )}
            </div>
          </div>
        );
      })}
      </div>

      {/* Scroll down button */}
      <button
        onClick={scrollDown}
        className="sticky bottom-0 z-10 w-full py-1 bg-[#0d1117]/90 backdrop-blur-sm border-t border-white/[0.06] text-text-muted hover:text-primary transition flex items-center justify-center gap-1"
        aria-label="Scroll jos"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <span className="text-[10px] font-medium uppercase tracking-wider">Jos</span>
      </button>
    </div>
  );
}
