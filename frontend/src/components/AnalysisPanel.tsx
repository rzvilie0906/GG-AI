"use client";

import { useState, useEffect } from "react";
import { Fixture, AnalysisResult, MainBet, SecondaryBet, OddsEntry, RiskAnalysis } from "@/lib/types";
import { fmtTime } from "@/lib/utils";
import { Flag, Clock, Box3D, XCircle, Target, Layers, TrendingUp } from "./Icons";

interface AnalysisPanelProps {
  selectedMatch: Fixture | null;
  analysis: AnalysisResult | null;
  isLoading: boolean;
  error: string | null;
  riskAnalysis: RiskAnalysis | null;
  isRiskMode: boolean;
  pickInput: string;
  setPickInput: (v: string) => void;
  onAddPick: () => void;
  addedFeedback: boolean;
  quotaResetAt?: string | null;
  analysisQuotaLocked?: boolean;
  analysisResetAt?: string | null;
  analysisQuotaMessage?: string | null;
  analysisNotAvailable?: {
    message: string;
    eta: string;
    availableAt: string;
  } | null;
}

// ── Countdown Timer ──

function CountdownTimer({ resetAt }: { resetAt: string }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    function update() {
      const now = Date.now();
      const target = new Date(resetAt).getTime();
      const diff = target - now;
      if (diff <= 0) {
        setTimeLeft("00:00:00");
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(
        `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
      );
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [resetAt]);

  return (
    <span className="font-mono text-lg font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
      {timeLeft}
    </span>
  );
}

function statusLabel(norm: string): string {
  if (norm === "live") return "LIVE";
  if (norm === "finished") return "FINALIZAT";
  return "PROGRAMAT";
}

function statusBadgeClass(norm: string): string {
  if (norm === "live") return "bg-live/15 text-live";
  if (norm === "finished") return "bg-[rgba(255,255,255,0.05)] text-text-muted";
  return "bg-primary/15 text-primary";
}

// ── Render Helpers ──

function MainBetSection({ bet }: { bet?: MainBet }) {
  if (!bet) return <div className="text-xs text-text-muted py-4 text-center">Date indisponibile.</div>;

  const probStr = typeof bet.model_probability === "number" ? `${bet.model_probability}%` : bet.model_probability;
  const fairStr = typeof bet.fair_odds === "number" ? bet.fair_odds.toFixed(2) : bet.fair_odds;

  return (
    <>
      <div className="bg-gradient-to-r from-primary/8 to-violet/5 border border-primary/15 rounded-xl p-4 mt-3">
        <span className="text-[10px] uppercase tracking-widest text-primary mb-1.5 block font-semibold">
          {bet.market}
        </span>
        <div className="flex justify-between items-center">
          <span className="text-base font-bold text-text-main">{bet.pick}</span>
          <span className="text-xl font-mono text-success font-bold">{fairStr}</span>
        </div>
        <div className="mt-2.5 flex gap-3 text-[11px] text-text-muted font-mono">
          <span>Probabilitate: <span className="text-text-secondary">{probStr}</span></span>
          <span>Cotă corectă: <span className="text-text-secondary">{fairStr}</span></span>
        </div>
      </div>
      {bet.reasoning_bullets?.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-[13px] text-text-secondary">
          {bet.reasoning_bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="w-1 h-1 rounded-full bg-primary mt-2 flex-shrink-0" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function SecondaryBetsSection({ bets }: { bets: SecondaryBet[] }) {
  if (!bets.length) return <div className="text-xs text-text-muted py-4 text-center">Niciun pariu secundar.</div>;

  return (
    <div className="flex flex-col gap-2">
      {bets.map((b, i) => {
        const probStr = typeof b.model_probability === "number" ? `${b.model_probability}%` : b.model_probability;
        const fairStr = typeof b.fair_odds === "number" ? b.fair_odds.toFixed(2) : b.fair_odds;
        return (
          <div key={i} className="bg-surface-elevated/40 p-3 rounded-lg border border-[rgba(255,255,255,0.04)] transition-all hover:border-[rgba(255,255,255,0.08)]">
            <div className="flex justify-between items-center mb-1">
              <span className="font-semibold text-[13px] text-text-main">{b.market}: {b.pick}</span>
              <span className="badge bg-[rgba(255,255,255,0.04)] text-text-secondary text-[10px] font-mono">{fairStr}</span>
            </div>
            <div className="text-[11px] text-text-muted font-mono">Prob: {probStr}</div>
            {b.reasoning_bullets?.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-text-secondary">
                {b.reasoning_bullets.map((x, j) => (
                  <li key={j} className="flex items-start gap-1.5">
                    <span className="w-0.5 h-0.5 rounded-full bg-text-muted mt-1.5 flex-shrink-0" />
                    {x}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function OddsSection({ odds, isLoading }: { odds: OddsEntry[]; isLoading?: boolean }) {
  if (isLoading) return <div className="text-xs text-text-muted py-4 text-center">Se calculează cotele...</div>;
  if (!odds.length) return <div className="text-xs text-text-muted py-4 text-center">Cotele nu sunt disponibile momentan pentru acest meci.</div>;

  return (
    <div className="flex flex-col gap-2">
      {odds.map((o, i) => {
        const quotes = (o.bookmaker_quotes || []).map((q) => `${q.bookmaker}: ${q.odds}`).join(" · ");
        const range = o.odds_range ? `${o.odds_range.min} – ${o.odds_range.max}` : "N/A";
        return (
          <div key={i} className="bg-surface-elevated/40 p-3 rounded-lg border border-[rgba(255,255,255,0.04)] transition-all hover:border-[rgba(255,255,255,0.08)]">
            <div className="font-semibold text-[13px] text-text-main mb-1">{o.market} — {o.pick}</div>
            <div className="text-[11px] text-text-muted font-mono">Interval: {range}</div>
            {quotes && <div className="text-[11px] text-text-secondary font-mono mt-1">{quotes}</div>}
          </div>
        );
      })}
    </div>
  );
}

function RiskAnalysisView({ data }: { data: RiskAnalysis }) {
  return (
    <div className="animate-fade-in">
      {/* Confidence Score */}
      <div className="bg-surface-elevated/40 p-5 rounded-xl mb-4 border border-[rgba(255,255,255,0.06)]">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-text-main text-sm font-bold">Concluzie Generală</h4>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Încredere AI</span>
            <span className="text-lg font-black bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              {String(data.confidence_score)}/10
            </span>
          </div>
        </div>
        <div className="text-text-secondary leading-relaxed text-[13px]">{data.general_verdict}</div>
      </div>

      {data.weak_links && data.weak_links.length > 0 ? (
        <>
          <h4 className="text-danger text-sm font-bold mb-3 flex items-center gap-2">
            <span className="w-5 h-5 rounded-md bg-danger/15 flex items-center justify-center text-[10px]">⚠</span>
            Verigi Slabe
          </h4>
          <div className="flex flex-col gap-2">
            {data.weak_links.map((w, i) => (
              <div key={i} className="bg-danger/5 border border-danger/10 px-4 py-3 rounded-lg flex flex-col gap-1">
                <strong className="text-text-main text-xs">{w.match}</strong>
                <span className="text-text-secondary text-xs">{w.reason}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="bg-success/8 border border-success/15 p-4 rounded-xl text-success font-semibold text-sm flex items-center gap-2">
          <span className="w-5 h-5 rounded-md bg-success/15 flex items-center justify-center text-[10px]">✓</span>
          Bilet solid, nicio capcană detectată.
        </div>
      )}
    </div>
  );
}

export default function AnalysisPanel({
  selectedMatch,
  analysis,
  isLoading,
  error,
  riskAnalysis,
  isRiskMode,
  pickInput,
  setPickInput,
  onAddPick,
  addedFeedback,
  quotaResetAt,
  analysisQuotaLocked,
  analysisResetAt,
  analysisQuotaMessage,
  analysisNotAvailable,
}: AnalysisPanelProps) {
  // ── Not available state: future match, analysis not yet synced ──
  if (analysisNotAvailable && selectedMatch && !isRiskMode) {
    return (
      <div className="card p-5 animate-fade-in">
        <div className="flex flex-col items-center justify-center py-16 gap-5">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Clock className="text-primary" size={32} />
          </div>
          <div className="text-center max-w-md">
            <div className="font-bold text-lg text-text-main mb-1">
              {selectedMatch.home_team} vs {selectedMatch.away_team}
            </div>
            <div className="text-text-muted text-sm mb-5 leading-relaxed">
              {analysisNotAvailable.message}
            </div>
            <div className="text-text-secondary text-xs mb-4 leading-relaxed">
              Analizele sunt generate zilnic pe baza datelor actualizate — cote, statistici și formă recentă. Pentru predicții cât mai precise, analiza devine disponibilă doar în ziua meciului.
            </div>
            {analysisNotAvailable.availableAt && (
              <div className="inline-flex items-center gap-3 bg-surface-elevated/60 border border-[rgba(255,255,255,0.08)] px-6 py-4 rounded-xl">
                <Clock className="text-primary opacity-80" size={18} />
                <div className="flex flex-col items-start">
                  <span className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">Disponibilă în aproximativ</span>
                  <CountdownTimer resetAt={analysisNotAvailable.availableAt} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Locked state: quota exceeded, show full-panel lock ──
  if (analysisQuotaLocked && !isRiskMode) {
    return (
      <div className="card p-5 animate-fade-in">
        <div className="flex flex-col items-center justify-center py-16 gap-5">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div className="text-center max-w-md">
            <div className="font-bold text-lg text-text-main mb-2">
              Limită analize zilnice atinsă
            </div>
            <div className="text-text-muted text-sm mb-5 leading-relaxed">
              {analysisQuotaMessage || "Ai epuizat analizele disponibile pentru astăzi. Limita se va reseta automat."}
            </div>
            {analysisResetAt && (
              <div className="inline-flex items-center gap-3 bg-surface-elevated/60 border border-[rgba(255,255,255,0.08)] px-6 py-4 rounded-xl">
                <Clock className="text-primary opacity-80" size={18} />
                <div className="flex flex-col items-start">
                  <span className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">Se resetează în</span>
                  <CountdownTimer resetAt={analysisResetAt} />
                </div>
              </div>
            )}
          </div>
          <div className="mt-2">
            <a href="/pricing" className="btn bg-primary/10 text-primary hover:bg-primary/20 text-sm px-5 py-2 rounded-lg border border-primary/20 transition-all">
              Upgrade pentru analize nelimitate
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (!selectedMatch && !isRiskMode) {
    return (
      <div className="card p-16 text-center border-dashed">
        <div className="mb-4 text-text-muted flex justify-center">
          <Box3D />
        </div>
        <div className="text-lg font-bold mb-2 text-text-main">Sistem Pregătit</div>
        <div className="text-text-muted text-sm max-w-sm mx-auto leading-relaxed">
          Selectează un meci din lista din stânga pentru a genera analiza probabilistică AI.
        </div>
      </div>
    );
  }

  const match = selectedMatch;
  const statusNorm = match?.status_norm || "upcoming";

  return (
    <div className="animate-fade-in">
      {/* Result Header */}
      <div className="card p-5 bg-gradient-to-br from-primary/8 via-surface-card to-surface-card mb-4">
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <div className="text-xl font-extrabold mb-2 tracking-tight text-text-main">
              {isRiskMode
                ? "Verdict Bilet Personal"
                : match
                  ? `${match.home_team} vs ${match.away_team}`
                  : "—"}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-text-muted inline-flex items-center gap-1.5">
                <Flag className="text-text-muted opacity-60" size={12} />
                {isRiskMode ? "Risk Manager AI" : match?.league_name || "—"}
              </span>
              <span className="text-xs text-text-muted font-mono inline-flex items-center gap-1.5">
                <Clock className="text-text-muted opacity-60" size={12} />
                {isRiskMode ? new Date().toLocaleTimeString() : match ? fmtTime(match.start_time_utc) : "—"}
              </span>
              <span className={`badge text-[10px] ${
                isRiskMode ? "bg-success/15 text-success" : statusBadgeClass(statusNorm)
              }`}>
                {isRiskMode ? "ANALIZĂ RISC" : statusLabel(statusNorm)}
              </span>
            </div>
          </div>

          {/* Add to ticket */}
          {!isRiskMode && match && (
            <div className="flex gap-2 items-center bg-[#07090f] p-2 rounded-lg border border-[rgba(255,255,255,0.06)]">
              <input
                type="text"
                value={pickInput}
                onChange={(e) => setPickInput(e.target.value)}
                className="input-field !w-[130px] !py-1.5 !px-2.5 !text-xs"
                placeholder="Ex: 1, Peste 2.5..."
              />
              <button
                onClick={onAddPick}
                className={`btn text-xs px-3 py-1.5 ${
                  addedFeedback
                    ? "bg-success text-white"
                    : "bg-primary text-white hover:bg-primary-hover"
                }`}
              >
                {addedFeedback ? "✔ Adăugat" : "+ Adaugă"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Analysis Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Section 1: Contextual Analysis */}
        <div className="card p-5 lg:col-span-2">
          <div className="section-header">
            <span className="section-number">01</span>
            {isRiskMode ? "Evaluare Risc Bilet" : "Analiză Contextuală"}
          </div>

          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-10 h-10 border-[2.5px] border-primary/15 border-t-primary rounded-full animate-spin" />
              <div className="font-semibold text-sm text-text-main">
                {isRiskMode ? "Calculez riscurile biletului..." : "Analiză AI în desfășurare..."}
              </div>
              <div className="text-xs text-text-muted">
                {isRiskMode ? "Analizăm meciurile cu datele premium" : "Se colectează date premium, cote și statistici"}
              </div>
            </div>
          )}

          {error && !isLoading && quotaResetAt && (
            <div className="flex flex-col items-center justify-center py-10 gap-4 animate-fade-in">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <div className="text-center max-w-md">
                <div className="font-bold text-base text-text-main mb-1.5">
                  {isRiskMode ? "Limită analize de risc atinsă" : "Limită analize zilnice atinsă"}
                </div>
                <div className="text-text-muted text-xs mb-4 leading-relaxed">
                  {error}
                </div>
                <div className="inline-flex items-center gap-3 bg-surface-elevated/60 border border-[rgba(255,255,255,0.08)] px-5 py-3 rounded-xl">
                  <Clock className="text-primary opacity-80" size={16} />
                  <div className="flex flex-col items-start">
                    <span className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">Se resetează în</span>
                    <CountdownTimer resetAt={quotaResetAt} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && !isLoading && !quotaResetAt && (
            <div className="flex items-center gap-3 p-4 bg-danger/5 border border-danger/10 rounded-xl">
              <XCircle className="text-danger flex-shrink-0" />
              <div>
                <div className="font-bold text-sm text-text-main mb-0.5">Eroare la analiză</div>
                <div className="text-text-muted text-xs">{error}</div>
              </div>
            </div>
          )}

          {!isLoading && !error && isRiskMode && riskAnalysis && (
            <RiskAnalysisView data={riskAnalysis} />
          )}

          {!isLoading && !error && !isRiskMode && analysis && (
            <div className="text-[13px] leading-relaxed text-text-secondary whitespace-pre-wrap animate-fade-in">
              {analysis.section1_analysis || "Nu există analiză text."}
            </div>
          )}
        </div>

        {/* Section 2: Main Bet */}
        {!isRiskMode && !quotaResetAt && (
          <div className="card p-5">
            <div className="section-header">
              <Target className="text-primary" size={14} />
              Predicție Principală
            </div>
            {isLoading ? (
              <div className="skeleton-box h-24 rounded-xl" />
            ) : (
              <MainBetSection bet={analysis?.section2_bets?.main_bet} />
            )}
          </div>
        )}

        {/* Section 3: Secondary Bets */}
        {!isRiskMode && !quotaResetAt && (
          <div className="card p-5">
            <div className="section-header">
              <Layers className="text-primary" size={14} />
              Oportunități Secundare
            </div>
            {isLoading ? (
              <div className="flex flex-col gap-2">
                <div className="skeleton-box h-16 rounded-xl" />
                <div className="skeleton-box h-16 rounded-xl" />
              </div>
            ) : (
              <SecondaryBetsSection bets={analysis?.section2_bets?.secondary_bets || []} />
            )}
          </div>
        )}

        {/* Section 4: Odds */}
        {!isRiskMode && !quotaResetAt && (
          <div className="card p-5 lg:col-span-2">
            <div className="section-header">
              <TrendingUp className="text-primary" size={14} />
              Analiză Piață & Cote
            </div>
            {isLoading ? (
              <div className="flex flex-col gap-2">
                <div className="skeleton-box h-14 rounded-xl" />
                <div className="skeleton-box h-14 rounded-xl" />
              </div>
            ) : (
              <OddsSection odds={analysis?.section3_odds || []} isLoading={isLoading} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
