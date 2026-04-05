"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import StarBackground from "@/components/StarBackground";
import Topbar from "@/components/Topbar";
import DayChips from "@/components/DayChips";
import Tabs from "@/components/Tabs";
import MatchList from "@/components/MatchList";
import TicketBuilder from "@/components/TicketBuilder";
import DailyTicket from "@/components/DailyTicket";
import AnalysisPanel from "@/components/AnalysisPanel";
import { SearchIcon, Calendar, Grid } from "@/components/Icons";
import {
  checkApiHealth,
  loadSports as fetchSports,
  loadDefaultDate as fetchDefaultDate,
  loadLeagues as fetchLeagues,
  loadFixtures as fetchFixtures,
  analyzeMatch as apiAnalyzeMatch,
  analyzeTicket as apiAnalyzeTicket,
} from "@/lib/api";
import { labelSport, nowStr, buildMatchKey } from "@/lib/utils";
import { Fixture, League, TicketPick, AnalysisResult, RiskAnalysis } from "@/lib/types";
import { useAuth } from "@/lib/AuthContext";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export default function Dashboard() {
  const { user, loading, subscription, subLoading, signOut, getIdToken, refreshSubscription } = useAuth();
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);

  // ── Route protection ──
  useEffect(() => {
    if (loading || subLoading) return;
    if (!user) {
      router.replace("/auth/signin?redirect=/dashboard");
      return;
    }
    if (!user.emailVerified) {
      router.replace("/auth/verify");
      return;
    }
    if (!subscription || !subscription.has_access) {
      router.replace("/pricing");
      return;
    }
  }, [user, loading, subscription, subLoading, router]);
  // ── State ──
  const [apiOnline, setApiOnline] = useState(false);
  const [lastRefresh, setLastRefresh] = useState("--:--");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [sports, setSports] = useState<string[]>([]);
  const [selectedSport, setSelectedSport] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const [allFixtures, setAllFixtures] = useState<Fixture[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<Fixture | null>(null);

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [quotaResetAt, setQuotaResetAt] = useState<string | null>(null);

  const [ticket, setTicket] = useState<TicketPick[]>([]);
  const [pickInput, setPickInput] = useState("");
  const [addedFeedback, setAddedFeedback] = useState(false);

  const [riskAnalysis, setRiskAnalysis] = useState<RiskAnalysis | null>(null);
  const [isRiskMode, setIsRiskMode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [riskQuotaResetAt, setRiskQuotaResetAt] = useState<string | null>(null);

  const [analysisNotAvailable, setAnalysisNotAvailable] = useState<{
    message: string;
    eta: string;
    availableAt: string;
  } | null>(null);

  const isAnalyzingRef = useRef(false);

  // Fetch user profile for display name
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        const res = await fetch(`${API_BASE}/api/auth/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setUserName(data.full_name || user.displayName || null);
        }
      } catch {}
    })();
  }, [user, getIdToken]);

  const handleSignOut = async () => {
    window.location.href = "/";
    await signOut();
  };

  const handleUpgradePlan = () => {
    router.push("/pricing?upgrade=true");
  };

  // ── Filtered fixtures ──

  function isInSelectedDay(fixture: Fixture, selectedIso: string) {
    // selectedIso is YYYY-MM-DD (Europe/Bucharest)
    // Compute the start and end of the selected day in Europe/Bucharest
    const [year, month, day] = selectedIso.split("-").map(Number);
    const tz = "Europe/Bucharest";
    // Start of day in Europe/Bucharest
    const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    // End of day in Europe/Bucharest
    const end = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
    // Convert start/end to timestamps in Europe/Bucharest
    const startRO = new Date(start.toLocaleString("en-US", { timeZone: tz }));
    const endRO = new Date(end.toLocaleString("en-US", { timeZone: tz }));
    // Convert fixture time to Europe/Bucharest
    const fixtureRO = new Date(new Date(fixture.start_time_utc).toLocaleString("en-US", { timeZone: tz }));
    return fixtureRO >= startRO && fixtureRO <= endRO;
  }

  const filteredFixtures = (searchQuery.trim()
    ? allFixtures.filter(
        (m) =>
          (m.home_team || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
          (m.away_team || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
          (m.league_name || "").toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allFixtures
  ).filter((m) => isInSelectedDay(m, selectedDate));

  // ── Refresh all data ──
  const refreshAll = useCallback(
    async (sport?: string, date?: string, league?: string, tab?: string) => {
      if (isAnalyzingRef.current) return;

      const ok = await checkApiHealth();
      setApiOnline(ok);
      if (!ok) return;

      setIsRefreshing(true);

      const s = sport ?? selectedSport;
      const d = date ?? selectedDate;
      const l = league ?? selectedLeague;
      const t = tab ?? activeTab;

      if (s && d) {
        const leaguesData = await fetchLeagues(s, d);
        setLeagues(leaguesData);

        const fixtures = await fetchFixtures(s, d, t, l || undefined);
        setAllFixtures(fixtures);
      }

      setLastRefresh(nowStr());
      setIsRefreshing(false);
    },
    [selectedSport, selectedDate, selectedLeague, activeTab]
  );

  // ── Init ──
  useEffect(() => {
    async function init() {
      const ok = await checkApiHealth();
      setApiOnline(ok);

      const defaultDate = await fetchDefaultDate();
      setSelectedDate(defaultDate);

      const sportsData = await fetchSports();
      setSports(sportsData);

      if (sportsData.length > 0) {
        const firstSport = sportsData[0];
        setSelectedSport(firstSport);

        const leaguesData = await fetchLeagues(firstSport, defaultDate);
        setLeagues(leaguesData);

        const fixtures = await fetchFixtures(firstSport, defaultDate, "all");
        setAllFixtures(fixtures);
        setLastRefresh(nowStr());
      }
    }
    init();
  }, []);

  // ── Auto-refresh every 60s ──
  useEffect(() => {
    const timer = setInterval(() => {
      if (!isAnalyzingRef.current) {
        refreshAll();
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [refreshAll]);

  // ── Handlers ──
  async function handleSportChange(sport: string) {
    setSelectedSport(sport);
    setSelectedLeague("");
    await refreshAll(sport, selectedDate, "", activeTab);
  }

  async function handleDateChange(date: string) {
    setSelectedDate(date);
    setSelectedLeague("");
    await refreshAll(selectedSport, date, "", activeTab);
  }

  async function handleLeagueChange(league: string) {
    setSelectedLeague(league);
    await refreshAll(selectedSport, selectedDate, league, activeTab);
  }

  async function handleTabChange(tab: string) {
    setActiveTab(tab);
    await refreshAll(selectedSport, selectedDate, selectedLeague, tab);
  }

  async function handleAnalyzeMatch(fixture: Fixture) {
    setSelectedMatchId(fixture.id);
    setSelectedMatch(fixture);
    setIsRiskMode(false);
    setRiskAnalysis(null);
    setAnalysis(null);
    setAnalysisError(null);
    setQuotaResetAt(null);
    setAnalysisNotAvailable(null);
    setPickInput("");

    // ── Check if analysis window is open (daily sync at 10:00 RO) ──
    // Matches from 10:00 RO today to 09:59 RO tomorrow are analyzable after today's 10:00 sync.
    const now = new Date();
    const nowRO = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Bucharest" }));
    const startTimeUtc = fixture.start_time_utc;

    if (startTimeUtc) {
      const kickoff = new Date(startTimeUtc);
      const kickoffRO = new Date(kickoff.toLocaleString("en-US", { timeZone: "Europe/Bucharest" }));
      // Matches 10:00-23:59 RO → same day's sync; 00:00-09:59 RO → previous day's sync
      const syncDate = new Date(kickoffRO);
      if (kickoffRO.getHours() < 10) {
        syncDate.setDate(syncDate.getDate() - 1);
      }
      // Build sync time: syncDate at 10:00 RO (approximate via offset)
      const roOffset = nowRO.getTime() - now.getTime() + now.getTimezoneOffset() * 60000;
      const syncLocal = new Date(syncDate.getFullYear(), syncDate.getMonth(), syncDate.getDate(), 10, 0, 0);
      const syncUTC = new Date(syncLocal.getTime() - roOffset);

      if (now < syncUTC) {
        const diffMs = syncUTC.getTime() - now.getTime();
        const hours = Math.floor(diffMs / 3600000);
        const mins = Math.floor((diffMs % 3600000) / 60000);
        const etaStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
        const dd = String(syncDate.getDate()).padStart(2, "0");
        const mm = String(syncDate.getMonth() + 1).padStart(2, "0");
        const yyyy = syncDate.getFullYear();
        setAnalysisNotAvailable({
          message: `Analiza va fi disponibilă pe ${dd}.${mm}.${yyyy} după sincronizarea zilnică (~10:00).`,
          eta: etaStr,
          availableAt: syncUTC.toISOString(),
        });
        return;
      }
    }

    const matchDate = selectedDate || (() => {
      return `${nowRO.getFullYear()}-${String(nowRO.getMonth() + 1).padStart(2, "0")}-${String(nowRO.getDate()).padStart(2, "0")}`;
    })();

    setAnalysisLoading(true);
    isAnalyzingRef.current = true;

    const matchKey = buildMatchKey(
      selectedSport,
      fixture.league_name || "Unknown",
      fixture.home_team || "",
      fixture.away_team || "",
      matchDate
    );

    try {
      const result = await apiAnalyzeMatch(
        selectedSport,
        fixture.league_name || "Unknown",
        fixture.home_team || "",
        fixture.away_team || "",
        matchDate,
        matchKey,
        fixture.provider,
        fixture.status,
        fixture.start_time_utc
      );
      setAnalysis(result);
      await refreshSubscription(true);
    } catch (e: any) {
      if (e.isNotAvailable) {
        setAnalysisNotAvailable({
          message: e.message,
          eta: e.eta || "curând",
          availableAt: e.availableAt || "",
        });
      } else if (e.isQuotaError && e.resetAt) {
        setQuotaResetAt(e.resetAt);
        setAnalysisError(e.message || "Verifică conexiunea la server.");
      } else {
        setAnalysisError(e.message || "Verifică conexiunea la server.");
      }
    } finally {
      setAnalysisLoading(false);
      isAnalyzingRef.current = false;
    }
  }

  function handleAddPick() {
    if (!pickInput.trim() || !selectedMatch) return;
    setTicket((prev) => [
      ...prev,
      {
        match: `${selectedMatch.home_team} vs ${selectedMatch.away_team}`,
        league: selectedMatch.league_name || "Unknown",
        pick: pickInput.trim(),
      },
    ]);
    setPickInput("");
    setAddedFeedback(true);
    setTimeout(() => setAddedFeedback(false), 1500);
  }

  function handleRemovePick(index: number) {
    setTicket((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleVerifyTicket() {
    if (ticket.length < 2) return;

    // Preemptive risk quota check
    const maxRisk = subscription?.tier_limits?.max_risk_analyses_per_day;
    const usedRisk = subscription?.daily_usage?.risk_analyses ?? 0;
    if (maxRisk !== null && maxRisk !== undefined && usedRisk >= maxRisk) {
      setIsRiskMode(true);
      setAnalysis(null);
      setRiskAnalysis(null);
      setRiskQuotaResetAt(subscription?.reset_at || null);
      setAnalysisError(`Ai atins limita zilnic\u0103 de ${maxRisk} analize de risc. Upgrade la Elite pentru analize nelimitate.`);
      return;
    }

    setIsVerifying(true);
    setIsRiskMode(true);
    setAnalysis(null);
    setAnalysisError(null);
    setRiskAnalysis(null);
    setRiskQuotaResetAt(null);
    setAnalysisLoading(true);
    isAnalyzingRef.current = true;

    try {
      const result = await apiAnalyzeTicket(ticket);
      setRiskAnalysis(result);
      await refreshSubscription(true);
    } catch (e: any) {
      if (e.isQuotaError && e.resetAt) {
        setRiskQuotaResetAt(e.resetAt);
        await refreshSubscription(true);
      }
      setAnalysisError(e.message || "Eroare evaluare risc.");
    } finally {
      setAnalysisLoading(false);
      setIsVerifying(false);
      isAnalyzingRef.current = false;
    }
  }

  // ── Show loading while checking auth ──
  if (loading || subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-deep)" }}>
        <div className="animate-spin h-10 w-10 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // ── Don't render if not authorized (redirect will happen via useEffect) ──
  if (!user || !subscription || !subscription.has_access) {
    return null;
  }

  // ── Tier-based feature flags ──
  const plan = subscription.plan;
  const hasRiskAnalyzer = plan === "pro" || plan === "elite";
  const unlimitedAnalyses = plan === "pro" || plan === "elite";
  const unlimitedRisk = plan === "elite";

  // ── Preemptive quota locks ──
  const maxAnalyses = subscription.tier_limits?.max_analyses_per_day;
  const usedAnalyses = subscription.daily_usage?.analyses ?? 0;
  const analysisQuotaExceeded = maxAnalyses !== null && maxAnalyses !== undefined && usedAnalyses >= maxAnalyses;

  const maxRisk = subscription.tier_limits?.max_risk_analyses_per_day;
  const usedRisk = subscription.daily_usage?.risk_analyses ?? 0;
  const riskQuotaExceeded = hasRiskAnalyzer && maxRisk !== null && maxRisk !== undefined && usedRisk >= maxRisk;

  return (
    <div className="h-screen overflow-hidden lg:overflow-hidden overflow-y-auto">
      <StarBackground />
      <Topbar
        apiOnline={apiOnline}
        lastRefresh={lastRefresh}
        isRefreshing={isRefreshing}
        onRefresh={() => refreshAll()}
        userEmail={user?.email}
        userName={userName}
        onSignOut={handleSignOut}
        onUpgradePlan={handleUpgradePlan}
      />

      {/* ═══ Horizontal Controls Bar ═══ */}
      <div className="border-b border-[rgba(255,255,255,0.06)] bg-[#0d1117]/50 backdrop-blur-sm">
        <div className="max-w-[1920px] mx-auto px-5 py-3 flex items-center gap-4 flex-wrap">
          {/* Sport selector (pill buttons) */}
          <div className="flex gap-1.5">
            {sports.map((s) => (
              <button
                key={s}
                onClick={() => handleSportChange(s)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-200 border font-ui ${
                  selectedSport === s
                    ? "bg-primary text-white border-primary shadow-[0_2px_10px_rgba(99,102,241,0.2)]"
                    : "bg-transparent text-text-secondary border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] hover:text-text-main"
                }`}
              >
                {labelSport(s)}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-[rgba(255,255,255,0.06)]" />

          {/* Day chips */}
          <DayChips selectedDate={selectedDate} onSelectDate={handleDateChange} />

          {/* Calendar toggle */}
          <button
            onClick={() => setShowCalendar(!showCalendar)}
            className={`btn-ghost !p-2 !rounded-lg ${showCalendar ? "!border-primary/30 !text-primary" : ""}`}
          >
            <Calendar size={14} />
          </button>

          {showCalendar && (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => { if (e.target.value) handleDateChange(e.target.value); }}
              className="input-field !w-auto !py-1.5 !text-xs"
            />
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Usage counters */}
          {subscription && subscription.daily_usage && (
            <div className="flex items-center gap-2">
              {subscription.tier_limits?.max_analyses_per_day !== null && (
                <span className="badge bg-[rgba(99,102,241,0.08)] text-primary text-[11px] font-mono border border-primary/15">
                  Analize: {subscription.daily_usage.analyses}/{subscription.tier_limits?.max_analyses_per_day ?? 0}
                </span>
              )}
              {subscription.tier_limits?.has_risk_analyzer && subscription.tier_limits?.max_risk_analyses_per_day !== null && (
                <span className="badge bg-[rgba(168,85,247,0.08)] text-violet text-[11px] font-mono border border-violet/15">
                  Scanări: {subscription.daily_usage.risk_analyses}/{subscription.tier_limits?.max_risk_analyses_per_day ?? 0}
                </span>
              )}
            </div>
          )}

          {/* Matches count */}
          <span className="badge bg-primary-soft text-primary text-[11px] font-mono">
            {filteredFixtures.length} meciuri
          </span>
        </div>
      </div>

      {/* ═══ Main 3-Column Layout ═══ */}
      <main className="grid grid-cols-1 lg:grid-cols-[320px_1fr_340px] gap-0 lg:h-[calc(100vh-56px-52px)] max-w-[1920px] mx-auto">

        {/* ── LEFT: Match Explorer ── */}
        <aside className="flex flex-col h-[calc(100vh-56px-52px)] lg:h-full min-h-0 overflow-hidden border-r border-[rgba(255,255,255,0.06)] bg-surface/30">
          {/* Controls inside sidebar */}
          <div className="p-3 flex flex-col gap-2.5 border-b border-[rgba(255,255,255,0.06)]">
            {/* Tabs */}
            <Tabs activeTab={activeTab} onTabChange={handleTabChange} />

            {/* League + Search row */}
            <div className="grid grid-cols-2 gap-2">
              <select
                value={selectedLeague}
                onChange={(e) => handleLeagueChange(e.target.value)}
                className="input-field !py-1.5 !text-xs"
              >
                <option value="">Toate ligile</option>
                {leagues.map((l, idx) => (
                  <option key={`${l.league_key}-${idx}`} value={l.league_key}>
                    {l.league_name} ({l.count})
                  </option>
                ))}
              </select>

              <div className="relative">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" size={13} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input-field !pl-8 !py-1.5 !text-xs"
                  placeholder="Caută..."
                />
              </div>
            </div>
          </div>

          {/* Match list header */}
          <div className="px-4 py-2.5 flex items-center gap-2 border-b border-[rgba(255,255,255,0.04)]">
            <Grid className="text-primary" size={13} />
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Meciuri</span>
          </div>

          {/* Match list */}
          <MatchList
            fixtures={filteredFixtures}
            selectedMatchId={selectedMatchId}
            onSelectMatch={handleAnalyzeMatch}
          />
        </aside>

        {/* ── CENTER: Analysis ── */}
        <section className="overflow-y-auto h-full custom-scroll p-5">
          <AnalysisPanel
            selectedMatch={selectedMatch}
            analysis={analysis}
            isLoading={analysisLoading}
            error={analysisError}
            riskAnalysis={riskAnalysis}
            isRiskMode={isRiskMode}
            pickInput={pickInput}
            setPickInput={setPickInput}
            onAddPick={handleAddPick}
            addedFeedback={addedFeedback}
            quotaResetAt={isRiskMode ? riskQuotaResetAt : quotaResetAt}
            analysisQuotaLocked={analysisQuotaExceeded && !analysis}
            analysisResetAt={(analysisQuotaExceeded && !analysis) ? (subscription.reset_at || null) : null}
            analysisQuotaMessage={(analysisQuotaExceeded && !analysis) ? `Ai atins limita zilnică de ${maxAnalyses} analize. Upgrade la un plan superior pentru analize nelimitate.` : null}
            analysisNotAvailable={analysisNotAvailable}
          />
        </section>

        {/* ── RIGHT: Ticket & Daily ── */}
        <aside className="flex flex-col h-full border-l border-[rgba(255,255,255,0.06)] bg-surface/30 overflow-y-auto custom-scroll">
          <div className="p-4 flex flex-col gap-4">
            {/* Ticket Builder */}
            <TicketBuilder
              ticket={ticket}
              onRemovePick={handleRemovePick}
              onVerify={hasRiskAnalyzer ? handleVerifyTicket : undefined}
              isVerifying={isVerifying}
              disabled={!hasRiskAnalyzer}
              riskQuotaResetAt={(riskQuotaExceeded ? subscription.reset_at : riskQuotaResetAt) || null}
              riskQuotaMessage={(riskQuotaExceeded || riskQuotaResetAt) ? `Ai atins limita zilnică de ${maxRisk} analize de risc. Upgrade la Elite pentru analize nelimitate.` : null}
            />

            {!hasRiskAnalyzer && (
              <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-400 text-xs text-center">
                🔒 Analizorul de Risc este disponibil doar pe planurile Pro și Elite.
                <a href="/pricing" className="underline ml-1 text-amber-300 hover:text-white">Upgrade acum</a>
              </div>
            )}

            {/* Daily Ticket */}
            <DailyTicket />
          </div>
        </aside>
      </main>
    </div>
  );
}
