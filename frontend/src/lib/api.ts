import { Fixture, League, AnalysisResult, DailyTicketData, RiskAnalysis, TicketPick } from "./types";
import { getFirestoreDb } from "./firebase";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

// ── Firebase Auth Token ──────────────────────────────────────
// Set by AuthContext when user logs in; used by all authenticated API calls.
let _firebaseTokenGetter: (() => Promise<string | null>) | null = null;

export function setFirebaseTokenGetter(getter: () => Promise<string | null>) {
  _firebaseTokenGetter = getter;
}

// ── Legacy HMAC Auth (fallback) ──────────────────────────────
let _cachedToken: string | null = null;
let _tokenExpiry = 0;

function _appSecret(): string {
  const _p = [42,80,111,111,108,109,97,115,116,101,114,49,49,50,51,52,53,45,114,97,122,118,97,110,98,111,115,115,117,49,50,51,52,45,108,111,108,105,115,109,121,108,105,102,101,45,48,55,53,52,54,55,56,57,56,51,45,48,55,53,54,54,54,51,55,52,57,45,65,73,108,105,101,95,80,65,82,73,85,82,73];
  return _p.map(c => String.fromCharCode(c)).join('');
}

async function _getToken(): Promise<string | null> {
  if (_cachedToken && Date.now() / 1000 < _tokenExpiry - 60) {
    return _cachedToken;
  }
  try {
    const r = await fetch(`${API_BASE}/auth/token`, {
      headers: { "X-App-Secret": _appSecret() },
    });
    if (!r.ok) throw new Error("Token request failed");
    const data = await r.json();
    _cachedToken = data.token;
    _tokenExpiry = Date.now() / 1000 + (data.expires_in || 3600);
    return _cachedToken;
  } catch (e) {
    console.error("Auth error:", e);
    return null;
  }
}

async function fetchAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);

  // Prefer Firebase token if available
  if (_firebaseTokenGetter) {
    const fbToken = await _firebaseTokenGetter();
    if (fbToken) {
      headers.set("Authorization", `Bearer ${fbToken}`);
      return fetch(url, { ...options, headers });
    }
  }

  // Fallback to legacy HMAC token
  const token = await _getToken();
  if (token) headers.set("X-API-Key", token);
  return fetch(url, { ...options, headers });
}

// ── API Functions ─────────────────────────────────────────────

export async function checkApiHealth(): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}/health`, { cache: "no-store" });
    return r.ok;
  } catch {
    return false;
  }
}

export async function loadSports(): Promise<string[]> {
  try {
    const r = await fetch(`${API_BASE}/sports`, { cache: "no-store" });
    if (!r.ok) return [];
    const data = await r.json();
    return data.sports || [];
  } catch {
    return [];
  }
}

export async function loadDefaultDate(): Promise<string> {
  try {
    const r = await fetch(`${API_BASE}/dates`, { cache: "no-store" });
    if (!r.ok) return new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Bucharest" })).toISOString().slice(0, 10);
    const data = await r.json();
    return data.default;
  } catch {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Bucharest" })).toISOString().slice(0, 10);
  }
}

export async function loadLeagues(sport: string, date: string): Promise<League[]> {
  try {
    const r = await fetch(
      `${API_BASE}/leagues?sport=${encodeURIComponent(sport)}&date=${encodeURIComponent(date)}`,
      { cache: "no-store" }
    );
    if (!r.ok) return [];
    const data = await r.json();
    return data.leagues || [];
  } catch {
    return [];
  }
}

export async function loadFixtures(
  sport: string,
  date: string,
  tab: string,
  leagueKey?: string
): Promise<Fixture[]> {
  try {
    let url = `${API_BASE}/fixtures?sport=${encodeURIComponent(sport)}&date=${encodeURIComponent(date)}&tab=${encodeURIComponent(tab)}&limit=350`;
    if (leagueKey) url += `&league_key=${encodeURIComponent(leagueKey)}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return [];
    const data = await r.json();
    return data.fixtures || [];
  } catch {
    return [];
  }
}

// ── Frontend analysis cache (avoids re-fetching already loaded analyses) ──
const _analysisCache = new Map<string, AnalysisResult>();

export async function analyzeMatch(
  sport: string,
  leagueName: string,
  homeTeam: string,
  awayTeam: string,
  matchDate: string,
  matchKey: string,
  provider?: string,
  status?: string,
  startTimeUtc?: string
): Promise<AnalysisResult> {
  // Check frontend in-memory cache first (instant, no network)
  const cacheKey = `${sport}_${homeTeam}_${awayTeam}_${matchDate}`.replace(/ /g, "_").toLowerCase();
  const cached = _analysisCache.get(cacheKey);
  if (cached) return cached;

  // Try lightweight cache-only endpoint first (no auth, no AI, no quota)
  try {
    const cacheUrl = `${API_BASE}/analyze-cached?sport=${encodeURIComponent(sport)}&home_team=${encodeURIComponent(homeTeam)}&away_team=${encodeURIComponent(awayTeam)}&match_date=${encodeURIComponent(matchDate)}`;
    const cr = await fetch(cacheUrl, { cache: "no-store" });
    if (cr.ok) {
      const cData = await cr.json();
      if (cData.cached && cData.analysis) {
        _analysisCache.set(cacheKey, cData.analysis);
        return cData.analysis;
      }
    }
  } catch { /* fall through to full analyze */ }

  // Full analyze with auth + quota tracking (cached or AI-generated)
  const payload = {
    sport,
    league: leagueName,
    home_team: homeTeam,
    away_team: awayTeam,
    match_date: matchDate,
    extra_context: JSON.stringify({
      match_key: matchKey,
      provider,
      status,
      start_time_utc: startTimeUtc,
    }),
  };

  const r = await fetchAuth(`${API_BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    if (r.status === 429) {
      const errData = await r.json().catch(() => ({}));
      let parsed: any = {};
      try {
        parsed = typeof errData.detail === "string" ? JSON.parse(errData.detail) : errData.detail || {};
      } catch { parsed = { message: errData.detail }; }
      const err: any = new Error(parsed.message || "Ai atins limita zilnică. Revino mai târziu.");
      err.resetAt = parsed.reset_at || null;
      err.quotaLimit = parsed.limit || null;
      err.isQuotaError = true;
      throw err;
    }
    if (r.status === 422) {
      const errData = await r.json().catch(() => ({}));
      let parsed: any = {};
      try {
        parsed = typeof errData.detail === "string" ? JSON.parse(errData.detail) : errData.detail || {};
      } catch { parsed = { message: errData.detail }; }
      if (parsed.code === "ANALYSIS_NOT_AVAILABLE") {
        const err: any = new Error(parsed.message || "Analiza nu este disponibilă pentru acest meci.");
        err.isNotAvailable = true;
        err.eta = parsed.eta || null;
        err.availableAt = parsed.available_at || null;
        throw err;
      }
    }
    const errText = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${errText}`);
  }

  const data = await r.json();
  const analysis = data.analysis || {};
  _analysisCache.set(cacheKey, analysis);
  return analysis;
}

export async function loadDailyTicket(type: string = "mixed"): Promise<DailyTicketData> {
  const r = await fetchAuth(`${API_BASE}/daily-ticket?type=${type}`);
  if (!r.ok) throw new Error("Failed to load daily ticket");
  return await r.json();
}

export async function analyzeTicket(picks: TicketPick[]): Promise<RiskAnalysis> {
  const r = await fetchAuth(`${API_BASE}/analyze-ticket`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ picks }),
  });

  if (!r.ok) {
    if (r.status === 429) {
      const errData = await r.json().catch(() => ({}));
      let parsed: any = {};
      try {
        parsed = typeof errData.detail === "string" ? JSON.parse(errData.detail) : errData.detail || {};
      } catch { parsed = { message: errData.detail }; }
      const err: any = new Error(parsed.message || "Ai atins limita zilnică de analize de risc. Revino mai târziu.");
      err.resetAt = parsed.reset_at || null;
      err.quotaLimit = parsed.limit || null;
      err.isQuotaError = true;
      throw err;
    }
    throw new Error("Server Error");
  }

  const data = await r.json();
  return data.risk_analysis;
}

// ── Firestore Direct Access ─────────────────────────────────────
// Read daily tickets and sync status directly from Firestore,
// bypassing the FastAPI backend for reliability.

/** Compute today's ticket date string (dd.MM.yyyy) using the 9:00 RO window. */
function _todayTicketDate(): string {
  const now = new Date();
  const nowRO = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Bucharest" }));
  // Ticket window: 10:00 today → 10:00 tomorrow (generator runs at 10:00 RO)
  // Before 10:00 RO → yesterday's ticket
  if (nowRO.getHours() < 10) {
    const yesterday = new Date(nowRO);
    yesterday.setDate(yesterday.getDate() - 1);
    return `${String(yesterday.getDate()).padStart(2, "0")}.${String(yesterday.getMonth() + 1).padStart(2, "0")}.${yesterday.getFullYear()}`;
  }
  return `${String(nowRO.getDate()).padStart(2, "0")}.${String(nowRO.getMonth() + 1).padStart(2, "0")}.${nowRO.getFullYear()}`;
}

/** Load a daily ticket directly from Firestore (no backend needed). */
export async function loadDailyTicketFromFirestore(type: string): Promise<DailyTicketData | null> {
  try {
    const db = await getFirestoreDb();
    const { doc, getDoc } = await import("firebase/firestore");
    const snap = await getDoc(doc(db, "daily_tickets", type));
    if (!snap.exists()) return null;
    const data = snap.data() as DailyTicketData;
    const expectedDate = _todayTicketDate();
    // Only return if ticket date matches today's window
    if (data.date !== expectedDate) return null;
    return data;
  } catch (e) {
    console.warn("[Firestore] Daily ticket load failed:", e);
    return null;
  }
}

/** Check if today's odds sync has completed (sync runs at ~09:00 RO). */
export async function checkFirestoreSyncStatus(): Promise<{
  synced: boolean;
  timestamp: string | null;
  oddsCount: number;
}> {
  try {
    const db = await getFirestoreDb();
    const { doc, getDoc } = await import("firebase/firestore");
    const snap = await getDoc(doc(db, "sync_meta", "last_sync"));
    if (!snap.exists()) return { synced: false, timestamp: null, oddsCount: 0 };

    const meta = snap.data();
    const timestamp: string | null = meta.timestamp || null;
    const oddsCount: number = meta.odds_count || 0;

    if (!timestamp) return { synced: false, timestamp: null, oddsCount: 0 };

    // Determine the start of today's sync window (09:00 RO)
    const now = new Date();
    const nowRO = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Bucharest" }));
    const windowStart = new Date(nowRO);
    if (nowRO.getHours() < 9) {
      // Before 09:00 RO → yesterday's window
      windowStart.setDate(windowStart.getDate() - 1);
    }
    windowStart.setHours(9, 0, 0, 0);

    // Convert windowStart (RO wall-clock) back to a comparable UTC time
    const roOffsetMs = nowRO.getTime() - now.getTime();
    const cutoffUTC = new Date(windowStart.getTime() - roOffsetMs);

    const syncTime = new Date(timestamp);
    return {
      synced: syncTime >= cutoffUTC && oddsCount > 0,
      timestamp,
      oddsCount,
    };
  } catch (e) {
    console.warn("[Firestore] Sync status check failed:", e);
    return { synced: false, timestamp: null, oddsCount: 0 };
  }
}
