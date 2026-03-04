"use client";

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
  if (!fixtures.length) {
    return (
      <div className="p-8 text-center text-text-muted text-xs">
        Nu există meciuri disponibile.
      </div>
    );
  }

  return (
    <div className="overflow-y-auto flex-1 custom-scroll p-2 flex flex-col gap-1">
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
  );
}
