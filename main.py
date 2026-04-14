import io
import os
import json
import sqlite3
import subprocess
import sys
import requests
import urllib.parse
import asyncio
import logging
import hashlib
import hmac
import time as _time
import unicodedata
from datetime import date, datetime, timedelta, timezone
from typing import Optional, Literal, Any, Dict, List

def strip_accents(s: str) -> str:
    """Remove diacritics/accents from a string for matching (Atlético → Atletico)."""
    if not s:
        return s
    return ''.join(
        c for c in unicodedata.normalize('NFD', s)
        if unicodedata.category(c) != 'Mn'
    )

from fastapi import FastAPI, Header, HTTPException, Query, Request, logger
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List
from dotenv import load_dotenv, find_dotenv

# Load .env BEFORE importing auth_billing so Stripe/Firebase env vars are available
_ = load_dotenv(find_dotenv())

from openai import OpenAI
from prompts import generate_system_prompt
from prediction_utils import extract_canonical_prediction, check_contradiction, validate_ticket_coherence
from auth_billing import (
    billing_router, init_users_db, verify_firebase_token,
    get_user_subscription, check_analysis_quota, check_risk_quota,
    _increment_usage, _increment_unique_analysis, _already_viewed_today,
    _get_user, TIER_LIMITS,
)

OPENAI_KEY = os.environ.get("OPENAI_API_KEY")
if not OPENAI_KEY:
    print("⚠️ ATENȚIE: OPENAI_API_KEY nu este setat!")

client = OpenAI(api_key=OPENAI_KEY)

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

APP_API_KEY = os.environ.get("APP_API_KEY", "")
MODEL = os.environ.get("MODEL", "gpt-4o") 
RISK_MODEL = os.environ.get("RISK_MODEL", "gpt-4o-mini")
TEMPERATURE = float(os.environ.get("TEMPERATURE", "0"))
MAX_TOKENS = int(os.environ.get("MAX_TOKENS", "1200"))

ALLOWED_ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173",
).split(",")

app = FastAPI(title="GG-AI Sports API", version="2.0.0")

ticket_lock = asyncio.Lock()

# ── SEIF (Safe): Per-match locks to prevent duplicate AI generations ──
# When multiple users request the same uncached match simultaneously,
# only the first triggers AI; others wait for the result.
_seif_locks: Dict[str, asyncio.Lock] = {}
_seif_locks_guard = asyncio.Lock()

async def _get_seif_lock(seif_key: str) -> asyncio.Lock:
    """Get or create an asyncio.Lock for a specific match key."""
    async with _seif_locks_guard:
        if seif_key not in _seif_locks:
            _seif_locks[seif_key] = asyncio.Lock()
        return _seif_locks[seif_key]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Include billing/auth router ──────────────────────────────
app.include_router(billing_router)

Sport = Literal["football", "tennis", "basketball", "hockey", "baseball"]
SPORTS_LIST = ["football", "tennis", "basketball", "hockey", "baseball"]

# ── Rate Limiter pentru Analizor Risc Bilet ───────────────────
# Max 50 cereri pe zi per IP (protecție anti-spam)
_RISK_RATE_LIMIT = 50
_risk_counter: Dict[str, Dict] = {}  # { ip: { "date": "2026-03-02", "count": 0 } }

def _check_risk_rate_limit(client_ip: str) -> None:
    """Verifică dacă IP-ul a depășit limita zilnică de analize de risc."""
    today = date.today().isoformat()
    entry = _risk_counter.get(client_ip)
    if not entry or entry["date"] != today:
        _risk_counter[client_ip] = {"date": today, "count": 1}
        return
    if entry["count"] >= _RISK_RATE_LIMIT:
        raise HTTPException(
            status_code=429, 
            detail=f"Ai atins limita zilnică de {_RISK_RATE_LIMIT} analize de risc. Funcția va fi disponibilă din nou mâine. Utilizare excesivă este considerată spam."
        )
    entry["count"] += 1

# Mapare sport intern → prefix sport_key din The Odds API
SPORT_TO_ODDS_PREFIX = {
    "football": "soccer",
    "basketball": "basketball",
    "hockey": "icehockey",
    "baseball": "baseball",
    "tennis": "tennis"
}

def _trim_odds_json(odds_str: str, max_bookmakers: int = 3) -> str:
    """Compress odds JSON to reduce token count: keep top N bookmakers, flatten structure."""
    if not odds_str or odds_str.startswith("COTE_LIPSĂ"):
        return odds_str
    try:
        bookmakers = json.loads(odds_str) if isinstance(odds_str, str) else odds_str
        if not isinstance(bookmakers, list) or not bookmakers:
            return odds_str
        trimmed = []
        for bookie in bookmakers[:max_bookmakers]:
            b = {"title": bookie.get("title", ""), "markets": []}
            for mkt in bookie.get("markets", []):
                m = {"key": mkt.get("key", ""), "outcomes": []}
                for o in mkt.get("outcomes", []):
                    entry = {"name": o.get("name", ""), "price": o.get("price")}
                    if o.get("point") is not None:
                        entry["point"] = o["point"]
                    m["outcomes"].append(entry)
                b["markets"].append(m)
            trimmed.append(b)
        return json.dumps(trimmed, ensure_ascii=False)
    except Exception:
        return odds_str

# ── Market label mappings for section3_odds display ──
_MARKET_LABELS = {
    "h2h": "1X2 (Solist)",
    "totals": "Total Goluri",
    "spreads": "Handicap",
    "btts": "Ambele Marchează (GG/NGG)",
    "double_chance": "Șansă Dublă",
}

def _build_real_odds_section(odds_str: str) -> list:
    """Build section3_odds entirely from real bookmaker data — no AI involvement."""
    if not odds_str or odds_str.startswith("COTE_LIPSĂ"):
        return []
    try:
        bookmakers = json.loads(odds_str) if isinstance(odds_str, str) else odds_str
        if not isinstance(bookmakers, list) or not bookmakers:
            return []

        # Collect all outcomes per (market_key, pick_label)
        # Structure: { (market_key, pick_label): [ {bookmaker, odds} ] }
        picks_data: dict[tuple, list] = {}
        for bookie in bookmakers:
            bookie_name = bookie.get("title", bookie.get("key", "Unknown"))
            for mkt in bookie.get("markets", []):
                mkt_key = mkt.get("key", "")
                for outcome in mkt.get("outcomes", []):
                    name = outcome.get("name", "")
                    price = outcome.get("price")
                    point = outcome.get("point")
                    if not name or not isinstance(price, (int, float)) or price <= 0:
                        continue
                    pick_label = f"{name} {point}" if point is not None else name
                    key = (mkt_key, pick_label)
                    if key not in picks_data:
                        picks_data[key] = []
                    picks_data[key].append({"bookmaker": bookie_name, "odds": round(price, 2)})

        # Build section3_odds entries grouped by market, sorted by market importance
        market_order = ["h2h", "double_chance", "totals", "spreads", "btts"]
        section = []
        seen_markets = set()

        for mkt_key in market_order:
            for (mk, pick_label), quotes in picks_data.items():
                if mk != mkt_key:
                    continue
                seen_markets.add(mk)
                odds_values = [q["odds"] for q in quotes]
                section.append({
                    "market": _MARKET_LABELS.get(mk, mk),
                    "pick": pick_label,
                    "bookmaker_quotes": [{"bookmaker": q["bookmaker"], "odds": str(q["odds"])} for q in quotes[:5]],
                    "odds_range": {"min": round(min(odds_values), 2), "max": round(max(odds_values), 2)},
                })

        # Any remaining markets not in the predefined order
        for (mk, pick_label), quotes in picks_data.items():
            if mk in seen_markets:
                continue
            odds_values = [q["odds"] for q in quotes]
            section.append({
                "market": _MARKET_LABELS.get(mk, mk),
                "pick": pick_label,
                "bookmaker_quotes": [{"bookmaker": q["bookmaker"], "odds": str(q["odds"])} for q in quotes[:5]],
                "odds_range": {"min": round(min(odds_values), 2), "max": round(max(odds_values), 2)},
            })

        return section
    except Exception as e:
        print(f"⚠️ [BUILD_ODDS] Eroare: {e}")
        return []

def _lookup_odds_from_db(sport: str, home_team: str, away_team: str) -> str:
    """Look up bookmaker odds JSON from the match_odds table. Returns raw JSON string or COTE_LIPSĂ."""
    fallback = "COTE_LIPSĂ"
    try:
        conn = _db_connect()
        cur = conn.cursor()
        home_kw = get_kw(home_team, sport)
        away_kw = get_kw(away_team, sport)
        odds_prefix = SPORT_TO_ODDS_PREFIX.get(sport, "")

        # Strict: both teams + sport
        cur.execute("""
            SELECT bookmakers_json, match_title FROM match_odds
            WHERE strip_accents(match_title) LIKE ? COLLATE NOCASE
            AND strip_accents(match_title) LIKE ? COLLATE NOCASE
            AND sport_key LIKE ?
        """, (f"%{home_kw}%", f"%{away_kw}%", f"{odds_prefix}%"))
        odds_row = cur.fetchone()

        # Fallback: home team only
        if not odds_row:
            if sport == "tennis":
                home_parts = strip_accents(home_team).strip().split()
                if len(home_parts) >= 2:
                    cur.execute("""
                        SELECT bookmakers_json, match_title FROM match_odds
                        WHERE strip_accents(match_title) LIKE ? COLLATE NOCASE
                        AND strip_accents(match_title) LIKE ? COLLATE NOCASE
                        AND sport_key LIKE ?
                    """, (f"%{home_parts[0]}%", f"%{home_parts[-1]}%", f"{odds_prefix}%"))
                    odds_row = cur.fetchone()
            else:
                cur.execute("""
                    SELECT bookmakers_json, match_title FROM match_odds
                    WHERE strip_accents(match_title) LIKE ? COLLATE NOCASE
                    AND sport_key LIKE ?
                """, (f"%{home_kw}%", f"{odds_prefix}%"))
                odds_row = cur.fetchone()

        conn.close()
        if odds_row:
            print(f"✅ [COTE] Găsite pentru {home_team} vs {away_team} → {odds_row['match_title']}")
            return odds_row["bookmakers_json"]
        print(f"⚠️ [COTE] Nu s-au găsit cote pentru {home_team} vs {away_team} (sport={sport})")
        return fallback
    except Exception as e:
        print(f"⚠️ [COTE] Eroare lookup: {e}")
        return fallback

def _inject_real_odds(analysis: dict, odds_str: str) -> dict:
    """Inject/override section3_odds with real bookmaker data."""
    real_odds = _build_real_odds_section(odds_str)
    if real_odds:
        analysis["section3_odds"] = real_odds
    return analysis

class AnalyzeRequest(BaseModel):
    sport: Sport
    league: str = Field(min_length=1, max_length=160)
    home_team: str = Field(min_length=1, max_length=120)
    away_team: str = Field(min_length=1, max_length=120)
    match_date: date
    extra_context: Optional[str] = Field(default=None, max_length=12000)

class TicketPick(BaseModel):
    match: str
    pick: str 
    league: str

class VerifyTicketRequest(BaseModel):
    picks: List[TicketPick]

class TicketVerifyRequest(BaseModel):
    ticket_text: str = Field(min_length=3, max_length=2000)

def get_exact_stats(response_data, team_id, sport):
    """Calculează matematic W-D-L din ultimele 10 meciuri."""
    if not response_data or not isinstance(response_data, list):
        return {"W": 0, "D": 0, "L": 0, "string": "N/A"}
    
    last_10 = response_data[:10]
    w, d, l = 0, 0, 0
    
    for g in last_10:
        home = g.get("teams", {}).get("home", {})
        away = g.get("teams", {}).get("away", {})
        scores = g.get("scores", {}) or g.get("goals", {})
        
        h_raw = scores.get("home")
        a_raw = scores.get("away")
        h_score = h_raw if isinstance(h_raw, int) else (h_raw.get("total") if isinstance(h_raw, dict) else None)
        a_score = a_raw if isinstance(a_raw, int) else (a_raw.get("total") if isinstance(a_raw, dict) else None)

        if h_score is None or a_score is None: continue

        if h_score == a_score:
            d += 1
        elif (home.get("id") == team_id and h_score > a_score) or (away.get("id") == team_id and a_score > h_score):
            w += 1
        else:
            l += 1
            
    return {
        "W": w, "D": d, "L": l, 
        "string": f"{w} Victorii, {d} Egaluri, {l} Înfrângeri (Ultimele {len(last_10)} meciuri)"
    }

def format_standings_for_prompt(standings: list, home_team: str, away_team: str, sport: str) -> str:
    """Format the full league standings into a readable string for the AI prompt."""
    if not standings:
        return ""
    
    lines = ["CLASAMENT ACTUALIZAT (complet):"]
    home_kw = strip_accents(home_team).lower()
    away_kw = strip_accents(away_team).lower()
    
    for entry in standings:
        rank = entry.get("rank", "?")
        team = entry.get("team", "?")
        
        if sport in ("football", "baseball"):
            pts = entry.get("points", "?")
            played = entry.get("played", "?")
            w = entry.get("w", "?")
            d = entry.get("d", "?")
            l = entry.get("l", "?")
            gf = entry.get("gf", "?")
            ga = entry.get("ga", "?")
            line = f"  {rank}. {team} — {pts}p | {played}j | {w}V-{d}E-{l}Î | Goluri: {gf}-{ga}"
        else:
            # Basketball / Hockey: no draws, points for/against
            w = entry.get("w", "?")
            l = entry.get("l", "?")
            pf = entry.get("pf", "?")
            pa = entry.get("pa", "?")
            line = f"  {rank}. {team} — {w}V-{l}Î | PF: {pf} PA: {pa}"
        
        # Highlight the two teams in the match
        team_norm = strip_accents(team).lower()
        if any(kw in team_norm for kw in home_kw.split() if len(kw) > 2) or \
           any(kw in team_norm for kw in away_kw.split() if len(kw) > 2):
            line += "  ◄"
        
        lines.append(line)
    
    return "\n".join(lines)

def calculate_exact_metrics(fixtures, team_id):
    """Calculează matematic cifrele pe care AI-ul are interzis să le schimbe."""
    if not fixtures:
        return {"string": "Lipsă date istorice", "avg_goals_for": 0, "avg_goals_against": 0}
    
    last_10 = fixtures[:10]
    w, d, l = 0, 0, 0
    total_for, total_against = 0, 0

    for f in last_10:
        h_id = f["teams"]["home"]["id"]
        a_id = f["teams"]["away"]["id"]

        goals = f.get("goals") or f.get("scores")
        if not goals: continue
        
        h_raw = goals.get("home")
        a_raw = goals.get("away")
        h_g = h_raw if isinstance(h_raw, int) else (h_raw.get("total") if isinstance(h_raw, dict) else None)
        a_g = a_raw if isinstance(a_raw, int) else (a_raw.get("total") if isinstance(a_raw, dict) else None)

        if h_g is None or a_g is None: continue
        if h_g == a_g: d += 1
        elif (h_id == team_id and h_g > a_g) or (a_id == team_id and a_g > h_g): w += 1
        else: l += 1
        if h_id == team_id:
            total_for += h_g
            total_against += a_g
        else:
            total_for += a_g
            total_against += h_g

    count = len(last_10) if len(last_10) > 0 else 1
    return {
        "w": w, "d": d, "l": l,
        "avg_for": round(total_for / count, 2),
        "avg_against": round(total_against / count, 2),
        "string": f"{w} Victorii, {d} Egaluri, {l} Înfrângeri în ultimele {len(last_10)} meciuri. Medie goluri: {round(total_for / count, 2)} marcate / {round(total_against / count, 2)} primite."
    }

# ── Token Auth System ─────────────────────────────────────────
# Secretul intern pentru semnăturile HMAC (derivat din APP_API_KEY)
_TOKEN_SECRET = hashlib.sha256((APP_API_KEY or "default-secret").encode()).hexdigest()
_TOKEN_TTL = 3600 * 12  # Token valid 12 ore

def _generate_token() -> dict:
    """Generează un token HMAC semnat cu timestamp."""
    ts = str(int(_time.time()))
    sig = hmac.new(_TOKEN_SECRET.encode(), ts.encode(), hashlib.sha256).hexdigest()
    return {"token": f"{ts}.{sig}", "expires_in": _TOKEN_TTL}

def _verify_token(token: str) -> bool:
    """Verifică un token HMAC — returnează True dacă e valid și nu a expirat."""
    try:
        parts = token.split(".")
        if len(parts) != 2:
            return False
        ts_str, sig = parts
        ts = int(ts_str)
        # Verifică expirare
        if _time.time() - ts > _TOKEN_TTL:
            return False
        # Verifică semnătura
        expected = hmac.new(_TOKEN_SECRET.encode(), ts_str.encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(sig, expected)
    except:
        return False

def require_api_key(x_api_key: Optional[str]) -> None:
    if not APP_API_KEY:
        return  # Fără cheie configurată = acces liber
    if x_api_key == APP_API_KEY:
        return  # Cheie directă (pentru generate_ticket.py intern)
    if x_api_key and _verify_token(x_api_key):
        return  # Token HMAC valid
    raise HTTPException(status_code=401, detail="Invalid API key")

@app.get("/auth/token")
def get_auth_token(x_app_secret: str = Header(..., alias="X-App-Secret")):
    """Endpoint care emite un token temporar. Frontend-ul trimite secretul printr-un header."""
    if not APP_API_KEY or x_app_secret != APP_API_KEY:
        raise HTTPException(status_code=403, detail="Forbidden")
    return _generate_token()

def _db_connect():
    conn = sqlite3.connect("sports.db", timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.create_function("strip_accents", 1, lambda s: strip_accents(s) if s else s)
    return conn

def _init_db():
    conn = _db_connect()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY, sport TEXT, league_key TEXT, league_name TEXT,
            start_time_utc TEXT, status TEXT, home_team TEXT, away_team TEXT,
            provider TEXT, provider_event_id TEXT, search_text TEXT
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS match_odds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            league_key TEXT,
            sport_key TEXT,
            match_title TEXT,
            start_time TEXT,
            bookmakers_json TEXT,
            updated_at TEXT
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS saved_analyses (
            match_key TEXT PRIMARY KEY,
            analysis_json TEXT,
            saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()


def _bootstrap_from_firestore():
    """If local sports.db is empty, download events/odds from Firestore."""
    conn = _db_connect()
    event_count = conn.execute("SELECT COUNT(*) FROM events").fetchone()[0]
    if event_count > 0:
        conn.close()
        return  # Already have data

    print("📥 [BOOTSTRAP] sports.db is empty — downloading from Firestore...")
    _refresh_from_firestore()


def _get_firestore_client():
    """Get or initialize a Firestore client."""
    try:
        import firebase_admin as _fb
        from firebase_admin import credentials as _creds, firestore as _fs
        cred_path = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY", "firebase-service-account.json")
        if not _fb._apps:
            if os.path.exists(cred_path):
                _fb.initialize_app(_creds.Certificate(cred_path))
            else:
                return None
        return _fs.client()
    except Exception:
        return None


_last_firestore_sync = ""  # ISO timestamp of last known Firestore sync


def _refresh_from_firestore():
    """Download events and odds from Firestore into local sports.db."""
    global _last_firestore_sync
    db_fs = _get_firestore_client()
    if db_fs is None:
        print("⚠️ [REFRESH] No Firebase credentials — skipping.")
        return

    try:
        # Check if Firestore has newer data than what we last pulled
        meta_doc = db_fs.collection("sync_meta").document("last_sync").get()
        if meta_doc.exists:
            meta = meta_doc.to_dict()
            fs_timestamp = meta.get("timestamp", "")
            if fs_timestamp and fs_timestamp == _last_firestore_sync:
                return  # No new data since our last refresh
            _last_firestore_sync = fs_timestamp

        conn = _db_connect()

        # Download events
        total_events = 0
        for doc in db_fs.collection("sync_events").stream():
            data = doc.to_dict()
            for ev in data.get("events", []):
                conn.execute("""
                    INSERT OR REPLACE INTO events
                    (id, sport, league_key, league_name, start_time_utc, status, home_team, away_team, provider, provider_event_id, search_text)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (ev.get("id"), ev.get("sport"), ev.get("league_key"), ev.get("league_name"),
                      ev.get("start_time_utc"), ev.get("status"), ev.get("home_team"), ev.get("away_team"),
                      ev.get("provider"), ev.get("provider_event_id"), ev.get("search_text")))
                total_events += 1

        # Download odds (replace all — ensures stale data is cleared)
        total_odds = 0
        odds_data = []
        for doc in db_fs.collection("sync_odds").stream():
            data = doc.to_dict()
            for od in data.get("odds", []):
                odds_data.append(od)
        if odds_data:
            conn.execute("DELETE FROM match_odds")
            for od in odds_data:
                conn.execute("""
                    INSERT INTO match_odds (league_key, sport_key, match_title, start_time, bookmakers_json, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (od.get("league_key"), od.get("sport_key"), od.get("match_title"),
                      od.get("start_time"), od.get("bookmakers_json"),
                      od.get("updated_at")))
                total_odds += 1

        conn.commit()
        conn.close()
        print(f"✅ [REFRESH] Loaded {total_events} events + {total_odds} odds from Firestore.")
    except Exception as e:
        print(f"⚠️ [REFRESH] Firestore download failed: {e}")


def _save_analysis_to_firestore(seif_key: str, analysis_json: str):
    """Persist a cached analysis to Firestore so it survives Railway restarts."""
    try:
        db_fs = _get_firestore_client()
        if db_fs is None:
            return
        db_fs.collection("saved_analyses").document(seif_key).set({
            "match_key": seif_key,
            "analysis_json": analysis_json,
            "saved_at": datetime.now(timezone.utc).isoformat(),
        })
        print(f"☁️ [SEIF→FIRESTORE] Salvat: {seif_key}")
    except Exception as e:
        print(f"⚠️ [SEIF→FIRESTORE] Eroare la salvare {seif_key}: {e}")


def _restore_analyses_from_firestore():
    """Load all cached analyses from Firestore into local SQLite on boot."""
    try:
        db_fs = _get_firestore_client()
        if db_fs is None:
            return
        conn = _db_connect()
        count = 0
        for doc in db_fs.collection("saved_analyses").stream():
            data = doc.to_dict()
            match_key = data.get("match_key", doc.id)
            analysis_json = data.get("analysis_json", "")
            if match_key and analysis_json:
                conn.execute(
                    "INSERT OR IGNORE INTO saved_analyses (match_key, analysis_json) VALUES (?, ?)",
                    (match_key, analysis_json),
                )
                count += 1
        conn.commit()
        conn.close()
        print(f"☁️ [FIRESTORE→SEIF] Restaurat {count} analize din Firestore.")
    except Exception as e:
        print(f"⚠️ [FIRESTORE→SEIF] Eroare la restaurare: {e}")


def _purge_old_analyses_from_firestore():
    """Remove analyses older than 2 days from Firestore to keep storage clean."""
    try:
        db_fs = _get_firestore_client()
        if db_fs is None:
            return
        cutoff = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
        batch = db_fs.batch()
        count = 0
        for doc in db_fs.collection("saved_analyses").stream():
            data = doc.to_dict()
            saved_at = data.get("saved_at", "")
            if saved_at and saved_at < cutoff:
                batch.delete(doc.reference)
                count += 1
                if count % 400 == 0:
                    batch.commit()
                    batch = db_fs.batch()
        if count % 400 != 0:
            batch.commit()
        if count > 0:
            print(f"🗑️ [SEIF] Purged {count} old analyses from Firestore.")
    except Exception as e:
        print(f"⚠️ [SEIF] Purge error: {e}")


async def auto_sync_worker():
    """Refresh from Firestore every hour to pick up data from the daily 09:00 sync."""
    while True:
        # Refresh from Firestore (picks up events + odds uploaded by morning sync)
        print("\n🔄 [AUTOPILOT] Checking Firestore for fresh data...")
        try:
            _refresh_from_firestore()
        except Exception as e:
            print(f"⚠️ [AUTOPILOT] Firestore refresh failed: {e}")

        # Purge old analyses from Firestore (older than 2 days)
        try:
            _purge_old_analyses_from_firestore()
        except Exception as e:
            print(f"⚠️ [AUTOPILOT] Analysis purge failed: {e}")

        # All syncing (ESPN + Odds API) happens ONCE daily at 09:00 Romanian time
        # via auto_sync_master.py on the local machine. The server only reads from Firestore.

        await asyncio.sleep(3600)  # Check every hour for fresh Firestore data

@app.on_event("startup")
def _startup():
    _init_db()
    _bootstrap_from_firestore()
    _restore_analyses_from_firestore()   # Restore cached analyses from Firestore
    init_users_db()
    asyncio.create_task(auto_sync_worker())

def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def _ro_tz():
    """Return Europe/Bucharest timezone offset (EET=+2, EEST=+3)."""
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo("Europe/Bucharest")
    except ImportError:
        # Fallback: assume EET (+2) for simplicity
        return timezone(timedelta(hours=2))

def _day_bounds_utc(d: date) -> tuple[str, str]:
    """Convert a Bucharest-local date to UTC start/end bounds for querying."""
    ro = _ro_tz()
    start_local = datetime(d.year, d.month, d.day, tzinfo=ro)
    end_local = start_local + timedelta(days=1)
    start_utc = start_local.astimezone(timezone.utc)
    end_utc = end_local.astimezone(timezone.utc)
    return start_utc.isoformat().replace("+00:00", "Z"), end_utc.isoformat().replace("+00:00", "Z")

def _normalize_status(raw_status: str) -> str:
    """Normalizează statusul ESPN într-un status standard (upcoming/live/finished)."""
    s = (raw_status or "").upper()
    if "IN_PROGRESS" in s or "IN_PLAY" in s or s == "LIVE" or "FIRST_HALF" in s or "SECOND_HALF" in s or "HALFTIME" in s:
        return "live"
    if "FINAL" in s or "FINISHED" in s or "FULL_TIME" in s or "END_PERIOD" in s or "POSTPONED" in s or "CANCELED" in s or "SUSPENDED" in s or "RETIRED" in s or "WALKOVER" in s or "ABANDONED" in s:
        return "finished"
    return "upcoming"

def _fix_probabilities(parsed: dict) -> dict:
    """
    Post-procesare: recalculează fair_odds din model_probability și 
    detectează dacă GPT a pus valori statice identice.
    Dacă fair_odds nu se potrivește cu 100/model_probability, îl corectează.
    """
    import random
    
    STATIC_PROBS = {60, 65, 55, 70, 50}  # Valori suspecte pe care GPT le repetă
    STATIC_ODDS = {1.54, 1.67, 1.82, 1.43, 2.00}
    
    def _recalc_bet(bet: dict, is_main: bool = True) -> dict:
        if not bet or not isinstance(bet, dict):
            return bet
        prob = bet.get("model_probability")
        fair = bet.get("fair_odds")
        
        # Dacă probabilitatea e un procent valid, recalculează fair_odds corect
        if isinstance(prob, (int, float)) and 1 < prob <= 100:
            correct_fair = round(100 / prob, 2)
            if fair != correct_fair:
                print(f"🔧 [FIX] fair_odds corectat: {fair} → {correct_fair} (prob={prob}%)")
                bet["fair_odds"] = correct_fair
        elif isinstance(prob, (int, float)) and 0 < prob <= 1:
            # GPT a dat probabilitatea ca fracție (0.65 = 65%)
            prob_pct = round(prob * 100, 1)
            bet["model_probability"] = prob_pct
            bet["fair_odds"] = round(100 / prob_pct, 2)
            print(f"🔧 [FIX] Probabilitate convertită: {prob} → {prob_pct}% | fair_odds: {bet['fair_odds']}")
        
        return bet
    
    try:
        bets = parsed.get("section2_bets", {})
        
        main_bet = bets.get("main_bet")
        if main_bet:
            bets["main_bet"] = _recalc_bet(main_bet, is_main=True)
        
        secondaries = bets.get("secondary_bets", [])
        if isinstance(secondaries, list):
            for i, sb in enumerate(secondaries):
                secondaries[i] = _recalc_bet(sb, is_main=False)
            bets["secondary_bets"] = secondaries
        
        parsed["section2_bets"] = bets
    except Exception as e:
        print(f"⚠️ [FIX_PROB] Eroare la post-procesare: {e}")
    
    return parsed

def get_real_live_data(sport: str, event_id: str, league_key: str, home_team: str, away_team: str) -> str:
    import urllib.parse
    report = ""
    
    try:
        oras = home_team.split()[-1] if len(home_team.split()) > 1 else home_team
        w_url = f"https://wttr.in/{urllib.parse.quote(oras)}?format=Conditii:+%C,+Temperatura:+%t,+Vant:+%w"
        w_res = requests.get(w_url, timeout=3)
        if w_res.status_code == 200:
            report += f"⛅ VREMEA LA STADION: {w_res.text.strip()}\n\n"
    except:
        report += "⛅ VREMEA: Date indisponibile momentan.\n\n"

    if not event_id or not league_key:
        return report + "⚠️ Meciul nu are ID oficial ESPN."

    espn_sport = "soccer"
    if sport == "basketball": espn_sport = "basketball"
    elif sport == "hockey": espn_sport = "hockey"
    elif sport == "tennis": espn_sport = "tennis"
    elif sport == "baseball": espn_sport = "baseball"

    url = f"https://site.api.espn.com/apis/site/v2/sports/{espn_sport}/{league_key}/summary?event={event_id}"
    try:
        r = requests.get(url, timeout=5)
        if r.status_code == 200:
            d = r.json()
            report += "📊 DATE TEHNICE OFICIALE (ESPN API):\n"
            
            if "standings" in d and len(d["standings"]) > 0:
                report += "- 🏆 CLASAMENT ACTUAL:\n"
                try:
                    entries = d["standings"][0]["standings"]["entries"]
                    for entry in entries:
                        t_name = entry["team"]["displayName"]
                        if strip_accents(home_team).lower() in strip_accents(t_name).lower() or strip_accents(away_team).lower() in strip_accents(t_name).lower():
                            stats = {s["name"]: s["displayValue"] for s in entry["stats"]}
                            poz = stats.get("rank", "?")
                            pct = stats.get("points", "?")
                            report += f"  * Locul {poz}: {t_name} ({pct} puncte)\n"
                except: pass

            if "form" in d:
                report += "\n- 📈 FORMA RECENTĂ:\n"
                for f in d["form"]:
                    report += f"  * {f.get('team', {}).get('displayName', '')}: {f.get('form', '')}\n"

            if "headToHead" in d:
                report += "\n- ⚔️ ISTORIC DIRECT (H2H):\n"
                for h2h in d["headToHead"][:5]:
                    h_team = h2h.get("homeTeam", {}).get("displayName", "")
                    a_team = h2h.get("awayTeam", {}).get("displayName", "")
                    h_score = h2h.get("homeTeamScore", "")
                    a_score = h2h.get("awayTeamScore", "")
                    report += f"  * {h_team} {h_score} - {a_score} {a_team}\n"

            if "injuries" in d and len(d["injuries"]) > 0:
                report += "\n- 🚑 ABSENȚI ȘI ACCIDENTAȚI:\n"
                for inj in d["injuries"]:
                    t_name = inj.get("team", {}).get("displayName", "")
                    for p in inj.get("injuries", []):
                        player = p.get("athlete", {}).get("displayName", "")
                        status = p.get("status", "Out")
                        report += f"  * {t_name}: {player} ({status})\n"
            else:
                report += "\n- 🚑 ABSENȚI: Niciun jucător accidentat raportat.\n"

            if "predictor" in d:
                pred = d["predictor"].get("homeAway", {})
                report += f"\n- 🤖 PROBABILITĂȚI ESPN: Gazde {pred.get('homeChance', '')}%, Oaspeți {pred.get('awayChance', '')}%, Egal {pred.get('tieChance', '')}%\n"
                
    except Exception as e:
        report += f"\nEroare API ESPN: {e}\n"
        
    return report

@app.get("/")
def root():
    return {
        "app": "GG-AI Sports Betting Analysis API",
        "status": "running",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }

@app.get("/health")
def health(): return {"ok": True}

@app.get("/sports")
def sports(): return {"sports": SPORTS_LIST}

@app.get("/dates")
def available_dates():
    ro = _ro_tz()
    now_ro = datetime.now(ro)
    today = now_ro.date().isoformat()
    tomorrow = (now_ro.date() + timedelta(days=1)).isoformat()
    yesterday = (now_ro.date() - timedelta(days=1)).isoformat()
    return {"default": today, "suggested": [yesterday, today, tomorrow]}

@app.get("/leagues")
def leagues(sport: Sport = Query(...), d: date = Query(..., alias="date")):
    start_iso, end_iso = _day_bounds_utc(d)
    conn = _db_connect()
    cur = conn.cursor()
    cur.execute("""
        SELECT league_key, MIN(league_name) as league_name, COUNT(*) as cnt
        FROM events
        WHERE sport=? AND start_time_utc>=? AND start_time_utc<?
        GROUP BY league_key
        ORDER BY MIN(league_name) ASC
    """, (sport, start_iso, end_iso))
    rows = cur.fetchall()
    conn.close()
    def _display_name(r):
        # For tennis, league_key (atp/wta) is more meaningful than individual tournament names
        if sport == "tennis":
            return r["league_key"].upper()
        return r["league_name"]
    return {"leagues": [{"league_key": r["league_key"], "league_name": _display_name(r), "count": int(r["cnt"])} for r in rows]}

@app.get("/fixtures")
def fixtures(sport: Sport = Query(...), d: date = Query(..., alias="date"), league_key: Optional[str] = Query(None), tab: str = Query("all"), limit: int = 300):
    start_iso, end_iso = _day_bounds_utc(d)
    conn = _db_connect()
    cur = conn.cursor()
    if league_key:
        cur.execute("""
            SELECT id, sport, league_key, league_name, start_time_utc, status, home_team, away_team, provider, provider_event_id
            FROM events
            WHERE sport=? AND league_key=? AND start_time_utc>=? AND start_time_utc<?
            ORDER BY start_time_utc ASC LIMIT ?
        """, (sport, league_key, start_iso, end_iso, limit))
    else:
        cur.execute("""
            SELECT id, sport, league_key, league_name, start_time_utc, status, home_team, away_team, provider, provider_event_id
            FROM events
            WHERE sport=? AND start_time_utc>=? AND start_time_utc<?
            ORDER BY start_time_utc ASC LIMIT ?
        """, (sport, start_iso, end_iso, limit))
    rows = cur.fetchall()
    conn.close()
    
    now_utc = datetime.utcnow()
    result = []
    for r in rows:
        status_norm = _normalize_status(r["status"])
        # Time-based override: if DB still says upcoming but the match has started, infer live/finished
        if status_norm == "upcoming" and r["start_time_utc"]:
            try:
                start_dt = datetime.fromisoformat(r["start_time_utc"].replace("Z", "+00:00")).replace(tzinfo=None)
                hours_passed = (now_utc - start_dt).total_seconds() / 3600
                if hours_passed > 3.5:
                    status_norm = "finished"
                elif hours_passed > 0:
                    status_norm = "live"
            except Exception:
                pass
        if tab != "all" and status_norm != tab:
            continue
        result.append({
            "id": r["id"], "sport": r["sport"], "league_key": r["league_key"],
            "league_name": r["league_name"], "start_time_utc": r["start_time_utc"],
            "status": r["status"], "status_norm": status_norm,
            "home_team": r["home_team"], "away_team": r["away_team"],
            "provider": r["provider"], "provider_event_id": r["provider_event_id"]
        })
    return {"fixtures": result}

@app.get("/search")
def search(q: str = Query(..., min_length=2), limit: int = 120):
    ql = q.strip().lower()
    conn = _db_connect()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, sport, league_key, league_name, start_time_utc, status, home_team, away_team
        FROM events
        WHERE search_text LIKE ?
        ORDER BY start_time_utc ASC LIMIT ?
    """, (f"%{ql}%", limit))
    rows = cur.fetchall()
    conn.close()
    return {"fixtures": [{"id": r["id"], "sport": r["sport"], "league_key": r["league_key"], "league_name": r["league_name"], "start_time_utc": r["start_time_utc"], "status": r["status"], "home_team": r["home_team"], "away_team": r["away_team"]} for r in rows]}

@app.get("/daily-ticket")
async def get_daily_ticket(
    type: str = Query("mixed"),
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
    authorization: Optional[str] = Header(default=None),
):
    # Firebase auth (preferred) or legacy API key
    if authorization and authorization.startswith("Bearer "):
        decoded = await verify_firebase_token(authorization)
        sub = get_user_subscription(decoded["uid"])
        if sub["status"] not in ("active", "canceled"):
            raise HTTPException(status_code=403, detail="Abonament inactiv. Alege un plan.")
    else:
        require_api_key(x_api_key)
    
    # Ticket window: 10:00 today -> 10:00 tomorrow (Romanian time)
    ro = _ro_tz()
    now_ro = datetime.now(ro)
    if now_ro.hour < 10:
        ticket_date = (now_ro - timedelta(days=1)).strftime("%d.%m.%Y")
    else:
        ticket_date = now_ro.strftime("%d.%m.%Y")
    valid_types = ["mixed", "football", "basketball", "hockey"]
    if type not in valid_types: type = "mixed"
    file_name = f"daily_ticket_{type}.json"

    # Helper: try to fetch today's ticket from Firestore
    def _load_from_firestore(cat: str, expected_date: str):
        try:
            from firebase_admin import firestore as _fs
            db = _fs.client()
            doc = db.collection("daily_tickets").document(cat).get()
            if doc.exists:
                data = doc.to_dict()
                if data.get("date") == expected_date and data.get("ticket") is not None:
                    return data
        except Exception:
            pass
        return None

    # 1) Check local file
    try:
        if os.path.exists(file_name):
            with open(file_name, "r", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("date") == ticket_date and data.get("ticket"):
                return data
    except Exception:
        pass

    # 2) Check Firestore (tickets uploaded by CI pipeline)
    fs_data = _load_from_firestore(type, ticket_date)
    if fs_data:
        return fs_data

    # 3) No ticket available yet — return empty with message (no on-the-fly generation)
    return {
        "ticket": [],
        "total_odds": 0,
        "date": ticket_date,
        "message": "Biletul zilei nu a fost generat încă. Revino după ora 10:00 pentru a vedea recomandarea AI.",
    }
    
@app.post("/verify-ticket")
def verify_ticket(data: TicketVerifyRequest, request: Request, x_api_key: Optional[str] = Header(default=None, alias="X-API-Key")):
    require_api_key(x_api_key)
    _check_risk_rate_limit(request.client.host if request.client else "unknown")

    system_prompt = """Ești un parior profesionist și analist de risc extrem de sincer, uneori chiar dur dar corect. 
    Utilizatorul îți va prezenta biletul lui de pariuri (o listă de meciuri și pronosticuri).
    
    Sarcina ta:
    1. Evaluează realismul biletului (E visător sau calculat?).
    2. Spune ce pronosticuri sunt 'solide' și logice.
    3. Atrage atenția asupra 'capcanelor' (meciuri foarte riscante, cote capcană) și explică de ce.
    4. Dă un verdict final și o notă de încredere de la 1 la 10 pentru bilet.
    
    Returnează răspunsul în format text (folosește ** pentru bold). NU returna JSON. Fii concis, obiectiv și ușor de citit."""

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            temperature=0,
            max_tokens=800,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Te rog evaluează următorul bilet:\n{data.ticket_text}"},
            ],
        )
        return {"verdict": response.choices[0].message.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

logger = logging.getLogger("uvicorn.error")

def get_api_sports_data(sport: str, home_team: str, match_date: date) -> Dict:
    api_key = os.getenv("API_SPORTS_KEY")
    if not api_key: return {}

    host_map = {
        "football": "v3.football.api-sports.io",
        "basketball": "v1.basketball.api-sports.io",
        "hockey": "v1.hockey.api-sports.io",
        "baseball": "v1.baseball.api-sports.io",
        "tennis": "v3.tennis.api-sports.io"
    }
    
    if sport not in host_map: return {}
    host = host_map[sport]
    headers = {"x-rapidapi-host": host, "x-rapidapi-key": api_key}
    kw = get_kw(home_team, sport).lower()
    season = match_date.year
    
    try:
        path = "fixtures" if sport in ["football", "tennis"] else "games"
        r = requests.get(f"https://{host}/{path}?date={match_date}", headers=headers, timeout=10).json()
        matches = r.get("response", [])
        
        found = next((m for m in matches if kw in strip_accents(m.get("teams", {}).get("home", {}).get("name") or "").lower()), None)
        if not found: return {}
        
        m_id = found.get("id") or found.get("fixture", {}).get("id")
        h_id = found["teams"]["home"]["id"]
        a_id = found["teams"]["away"]["id"]
        
        data = {"basic_info": found, "season_stats": {"home": {}, "away": {}}, "h2h_history": [], "standings": []}

        # Fetch full league standings for all sports (except tennis)
        if sport != "tennis":
            try:
                league_id = found.get("league", {}).get("id")
                if league_id:
                    s_res = requests.get(f"https://{host}/standings?league={league_id}&season={season}", headers=headers, timeout=10).json()
                    responses = s_res.get("response", [])
                    if responses:
                        if sport in ("football", "baseball"):
                            league_data = responses[0].get("league", {})
                            standings_list = league_data.get("standings", [])
                            if standings_list:
                                raw_standings = standings_list[0]
                                for entry in raw_standings:
                                    team_name = entry.get("team", {}).get("name", "?")
                                    team_tid = entry.get("team", {}).get("id")
                                    rank = entry.get("rank", "?")
                                    pts = entry.get("points", "?")
                                    all_stats = entry.get("all", {})
                                    played = all_stats.get("played", all_stats.get("matchs", {}).get("played", "?"))
                                    win = all_stats.get("win", all_stats.get("matchs", {}).get("win", "?"))
                                    draw = all_stats.get("draw", all_stats.get("matchs", {}).get("draw", "?"))
                                    lose = all_stats.get("lose", all_stats.get("matchs", {}).get("lose", "?"))
                                    gf = all_stats.get("goals", {}).get("for", "?")
                                    ga = all_stats.get("goals", {}).get("against", "?")
                                    data["standings"].append({
                                        "rank": rank, "team": team_name, "points": pts,
                                        "played": played, "w": win, "d": draw, "l": lose,
                                        "gf": gf, "ga": ga
                                    })
                                    if team_tid == h_id:
                                        data["season_stats"]["home"] = all_stats
                                    if team_tid == a_id:
                                        data["season_stats"]["away"] = all_stats
                        else:
                            # Basketball & Hockey: different response structure
                            for group in responses:
                                entries = group if isinstance(group, list) else group.get("league", {}).get("standings", [[]])[0] if isinstance(group, dict) else []
                                if isinstance(group, dict) and not isinstance(entries, list):
                                    # Try flat structure: response is list of standing entries
                                    entries = [group]
                                for entry in (entries if isinstance(entries, list) else []):
                                    team_info = entry.get("team", {})
                                    team_name = team_info.get("name", "?")
                                    team_tid = team_info.get("id")
                                    pos = entry.get("position", entry.get("rank", "?"))
                                    win = entry.get("games", {}).get("win", {}).get("total", entry.get("win", {}).get("total", "?"))
                                    lose = entry.get("games", {}).get("lose", {}).get("total", entry.get("lose", {}).get("total", "?"))
                                    pts_for = entry.get("points", {}).get("for", "?")
                                    pts_against = entry.get("points", {}).get("against", "?")
                                    data["standings"].append({
                                        "rank": pos, "team": team_name,
                                        "w": win, "l": lose,
                                        "pf": pts_for, "pa": pts_against
                                    })
                                    if team_tid == h_id:
                                        data["season_stats"]["home"] = entry
                                    if team_tid == a_id:
                                        data["season_stats"]["away"] = entry
            except Exception as e:
                logger.error(f"Standings fetch failed for {sport}: {e}")

        inj_path = "injuries" if sport == "football" else "injuries"
        game_param = "fixture" if sport == "football" else "game"
        
        r_inj = requests.get(f"https://{host}/{inj_path}?{game_param}={m_id}", headers=headers).json()
        data["injuries"] = r_inj.get("response", [])

        h2h_res = requests.get(f"https://{host}/{path}/h2h?h2h={h_id}-{a_id}", headers=headers).json()
        data["h2h_history"] = h2h_res.get("response", [])[:10]

        # Fetch each team's ACTUAL last 10 fixtures (not just H2H) for real form
        try:
            if sport == "football":
                r_home = requests.get(f"https://{host}/{path}?team={h_id}&last=10", headers=headers, timeout=10).json()
                r_away = requests.get(f"https://{host}/{path}?team={a_id}&last=10", headers=headers, timeout=10).json()
                data["recent_home"] = (r_home.get("response") or [])[:10]
                data["recent_away"] = (r_away.get("response") or [])[:10]
            else:
                # Basketball, hockey, baseball: season endpoint returns games oldest-first,
                # so reverse to get most recent 10
                r_home = requests.get(f"https://{host}/{path}?team={h_id}&season={season}", headers=headers, timeout=10).json()
                r_away = requests.get(f"https://{host}/{path}?team={a_id}&season={season}", headers=headers, timeout=10).json()
                home_games = r_home.get("response") or []
                away_games = r_away.get("response") or []
                data["recent_home"] = list(reversed(home_games))[:10]
                data["recent_away"] = list(reversed(away_games))[:10]
        except Exception:
            data["recent_home"] = []
            data["recent_away"] = []

        return data
    except Exception as e:
        logger.error(f"Eroare date premium {sport}: {str(e)}")
        return {}
    
@app.get("/context")
def get_match_context(match_key: str = Query("")):
    if not match_key:
        return {"context": "Bazează-te pe cunoștințele tale interne."}
        
    try:
        parts = match_key.split("|")
        if len(parts) >= 5:
            sport = parts[0].lower()
            home_team = parts[2]
            away_team = parts[3]
            match_date = parts[4] 

            if sport == "football":
                data = get_premium_football_data(home_team, away_team, match_date)
            elif sport == "basketball":
                data = get_premium_basketball_data(home_team, away_team, match_date)
            elif sport == "hockey":
                data = get_premium_hockey_data(home_team, away_team, match_date)
            elif sport == "tennis":
                data = get_premium_tennis_data(home_team, away_team, match_date)
            elif sport == "baseball":
                data = get_premium_baseball_data(home_team, away_team, match_date)
            else:
                data = f"Date premium indisponibile pentru {sport}. Bazează-te pe experiența ta."
                
            return {"context": data}
            
    except Exception as e:
        return {"context": f"Eroare extragere context: {e}"}
        
    return {"context": "Folosește-ți expertiza internă."}

def get_premium_football_data(home_team, away_team, match_date):
    api_key = os.getenv("API_SPORTS_KEY")
    if not api_key: 
        return "Fă analiza bazându-te doar pe valoarea istorică a loturilor și pe cotele primite. Nu te plânge de lipsa datelor."
    
    headers = {"x-rapidapi-host": "v3.football.api-sports.io", "x-rapidapi-key": api_key}
    
    try:
        url_fixtures = f"https://v3.football.api-sports.io/fixtures?date={match_date}"
        r_fixtures = requests.get(url_fixtures, headers=headers, timeout=10).json()
        
        fixture_id = None
        api_home_name = home_team
        api_away_name = away_team

        ignore_words = ['club', 'team', 'real', 'city', 'united', 'sporting', 'fc', 'as', 'cf', 'athletic', 'dinamo']
        valid_words = [w for w in strip_accents(home_team).split() if len(w) > 2 and w.lower() not in ignore_words]
        home_kw = max(valid_words, key=len).lower() if valid_words else strip_accents(home_team).split()[0].lower()
        
        if r_fixtures.get("response"):
            # Try matching home team in fixture's home position first
            for f in r_fixtures["response"]:
                h_name = strip_accents(f["teams"]["home"]["name"]).lower()
                if home_kw in h_name:
                    fixture_id = f["fixture"]["id"]
                    api_home_name = f["teams"]["home"]["name"]
                    api_away_name = f["teams"]["away"]["name"]
                    break
            # Fallback: also check away position (in case ESPN and API-Sports disagree on home/away)
            if not fixture_id:
                for f in r_fixtures["response"]:
                    a_name = strip_accents(f["teams"]["away"]["name"]).lower()
                    if home_kw in a_name:
                        fixture_id = f["fixture"]["id"]
                        api_home_name = f["teams"]["home"]["name"]
                        api_away_name = f["teams"]["away"]["name"]
                        break
                    
        if not fixture_id:
            return "Concentrează-te strict pe valoarea loturilor și pe stilul de joc istoric. Nu menționa că îți lipsesc date recente."

        url_pred = f"https://v3.football.api-sports.io/predictions?fixture={fixture_id}"
        r_pred = requests.get(url_pred, headers=headers, timeout=10).json()
        
        if r_pred.get("response"):
            pred = r_pred["response"][0]
            home_stats = pred.get("teams", {}).get("home", {})
            away_stats = pred.get("teams", {}).get("away", {})
            
            home_id = home_stats.get("id")
            away_id = away_stats.get("id")

            url_inj = f"https://v3.football.api-sports.io/injuries?fixture={fixture_id}"
            r_inj = requests.get(url_inj, headers=headers, timeout=5).json()
            
            absenti = {api_home_name: [], api_away_name: []}
            if r_inj.get("response"):
                for inj in r_inj["response"]:
                    team_id = inj.get("team", {}).get("id")
                    player_name = inj.get("player", {}).get("name")
                    reason = inj.get("player", {}).get("reason", "Indisponibil")
                    
                    if team_id == home_id:
                        absenti[api_home_name].append(f"{player_name} ({reason})")
                    elif team_id == away_id:
                        absenti[api_away_name].append(f"{player_name} ({reason})")

            # Get actual goal averages — these are REAL stats, not model predictions
            home_goals_for = home_stats.get("league", {}).get("goals", {}).get("for", {}).get("average", {}).get("total")
            home_goals_against = home_stats.get("league", {}).get("goals", {}).get("against", {}).get("average", {}).get("total")
            away_goals_for = away_stats.get("league", {}).get("goals", {}).get("for", {}).get("average", {}).get("total")
            away_goals_against = away_stats.get("league", {}).get("goals", {}).get("against", {}).get("average", {}).get("total")

            stats_premium = {
                "sfat_matematic_API": pred.get("predictions", {}).get("advice"),
                "jucatori_absenti_meci_azi": absenti,
                f"statistici_sezon_{api_home_name}": {
                    "forma_sir_meciuri": home_stats.get("league", {}).get("form"),
                    "medie_goluri_marcate": home_goals_for,
                    "medie_goluri_primite": home_goals_against
                },
                f"statistici_sezon_{api_away_name}": {
                    "forma_sir_meciuri": away_stats.get("league", {}).get("form"),
                    "medie_goluri_marcate": away_goals_for,
                    "medie_goluri_primite": away_goals_against
                },
                "istoric_direct_h2h_ultimele_3": []
            }
            
            for h2h in pred.get("h2h", [])[:3]:
                h_name, h_goal = h2h.get("teams", {}).get("home", {}).get("name"), h2h.get("goals", {}).get("home")
                a_name, a_goal = h2h.get("teams", {}).get("away", {}).get("name"), h2h.get("goals", {}).get("away")
                stats_premium["istoric_direct_h2h_ultimele_3"].append(f"{h_name} {h_goal} - {a_goal} {a_name}")
                
            return json.dumps(stats_premium, indent=2, ensure_ascii=False)
            
        return "Nu menționa forma recentă, rezumă-te la forța de joc bazată pe cotele primite."
    except Exception as e: 
        return "Ignoră lipsa datelor și analizează meciul pe baza cotelor."

def get_premium_basketball_data(home_team, away_team, match_date):
    api_key = os.getenv("API_SPORTS_KEY")
    if not api_key: return "Fă analiza bazându-te doar pe valoarea istorică a loturilor și pe cotele primite. Nu te plânge de lipsa datelor."
    headers = {"x-rapidapi-host": "v1.basketball.api-sports.io", "x-rapidapi-key": api_key}
    
    try:
        r_games = requests.get(f"https://v1.basketball.api-sports.io/games?date={match_date}", headers=headers, timeout=5).json()
        if not r_games.get("response"): return "Concentrează-te strict pe valoarea loturilor. Nu menționa că îți lipsesc date recente."
        
        game_id, home_id, away_id = None, None, None
        home_kw = home_team.split()[-1] 
        
        for g in r_games["response"]:
            if strip_accents(home_kw).lower() in strip_accents(g["teams"]["home"]["name"]).lower():
                game_id = g["id"]
                home_id = g["teams"]["home"]["id"]
                away_id = g["teams"]["away"]["id"]
                break
                
        if not game_id: return "Analizează meciul pe baza cotelor. Nu menționa că îți lipsesc date recente."
        
        stats = {"sport": "Baschet", "jucatori_absenti_meci_azi": {"gazde": [], "oaspeti": []}, "istoric_direct_h2h_ultimele_5_meciuri": []}
        
        r_inj = requests.get(f"https://v1.basketball.api-sports.io/injuries?game={game_id}", headers=headers, timeout=5).json()
        if r_inj.get("response"):
            for inj in r_inj["response"]:
                t_id = inj.get("team", {}).get("id")
                p_name = inj.get("player", {}).get("name")
                reason = inj.get("type", "Indisponibil") 
                
                if t_id == home_id:
                    stats["jucatori_absenti_meci_azi"]["gazde"].append(f"{p_name} ({reason})")
                elif t_id == away_id:
                    stats["jucatori_absenti_meci_azi"]["oaspeti"].append(f"{p_name} ({reason})")

        r_h2h = requests.get(f"https://v1.basketball.api-sports.io/games/h2h?h2h={home_id}-{away_id}", headers=headers, timeout=5).json()
        
        if r_h2h.get("response"):
            for h2h in r_h2h["response"][:5]: 
                h_name, h_score = h2h["teams"]["home"]["name"], h2h["scores"]["home"]["total"]
                a_name, a_score = h2h["teams"]["away"]["name"], h2h["scores"]["away"]["total"]
                stats["istoric_direct_h2h_ultimele_5_meciuri"].append(f"{h_name} {h_score} - {a_score} {a_name} (Total Puncte: {h_score + a_score})")
                
        return json.dumps(stats, indent=2, ensure_ascii=False)
    except Exception as e: return "Ignoră lipsa datelor și analizează meciul pe baza cotelor."

def get_premium_hockey_data(home_team, away_team, match_date):
    api_key = os.getenv("API_SPORTS_KEY")
    if not api_key: return "Fă analiza bazându-te doar pe valoarea istorică a loturilor și pe cotele primite. Nu te plânge de lipsa datelor."
    headers = {"x-rapidapi-host": "v1.hockey.api-sports.io", "x-rapidapi-key": api_key}
    
    try:
        r_games = requests.get(f"https://v1.hockey.api-sports.io/games?date={match_date}", headers=headers, timeout=5).json()
        if not r_games.get("response"): return "Concentrează-te strict pe valoarea loturilor. Nu menționa că îți lipsesc date recente."
        
        game_id, home_id, away_id = None, None, None
        home_kw = home_team.split()[-1] 
        
        for g in r_games["response"]:
            if strip_accents(home_kw).lower() in strip_accents(g["teams"]["home"]["name"]).lower():
                game_id = g["id"]
                home_id = g["teams"]["home"]["id"]
                away_id = g["teams"]["away"]["id"]
                break
                
        if not game_id: return "Analizează meciul pe baza cotelor. Nu menționa că îți lipsesc date recente."
        
        stats = {"sport": "Hochei", "jucatori_absenti_meci_azi": {"gazde": [], "oaspeti": []}, "istoric_direct_h2h_ultimele_5_meciuri": []}

        r_inj = requests.get(f"https://v1.hockey.api-sports.io/injuries?game={game_id}", headers=headers, timeout=5).json()
        if r_inj.get("response"):
            for inj in r_inj["response"]:
                t_id = inj.get("team", {}).get("id")
                p_name = inj.get("player", {}).get("name")
                reason = inj.get("type", "Indisponibil") 
                
                if t_id == home_id:
                    stats["jucatori_absenti_meci_azi"]["gazde"].append(f"{p_name} ({reason})")
                elif t_id == away_id:
                    stats["jucatori_absenti_meci_azi"]["oaspeti"].append(f"{p_name} ({reason})")

        r_h2h = requests.get(f"https://v1.hockey.api-sports.io/games/h2h?h2h={home_id}-{away_id}", headers=headers, timeout=5).json()
        
        if r_h2h.get("response"):
            for h2h in r_h2h["response"][:5]:
                h_name, h_score = h2h["teams"]["home"]["name"], h2h["scores"]["home"]
                a_name, a_score = h2h["teams"]["away"]["name"], h2h["scores"]["away"]
                stats["istoric_direct_h2h_ultimele_5_meciuri"].append(f"{h_name} {h_score} - {a_score} {a_name} (Total Goluri: {h_score + a_score})")
                
        return json.dumps(stats, indent=2, ensure_ascii=False)
    except Exception as e: return "Ignoră lipsa datelor și analizează meciul pe baza cotelor."

def get_premium_tennis_data(home_team, away_team, match_date):
    api_key = os.getenv("API_SPORTS_KEY")
    if not api_key: return "Lipsă API_SPORTS_KEY."
    headers = {"x-rapidapi-host": "v3.tennis.api-sports.io", "x-rapidapi-key": api_key}
    
    try:
        r_games = requests.get(f"https://v3.tennis.api-sports.io/fixtures?date={match_date}", headers=headers, timeout=5).json()
        if not r_games.get("response"): return "Meci de tenis negăsit azi."
        
        home_id, away_id = None, None

        home_kw = home_team.split()[-1].replace(".", "").strip()
        
        for g in r_games["response"]:
            h_name = g["teams"]["home"]["name"]
            if strip_accents(home_kw).lower() in strip_accents(h_name).lower():
                home_id = g["teams"]["home"]["id"]
                away_id = g["teams"]["away"]["id"]
                break
                
        if not home_id or not away_id: return "Jucători de tenis negăsiți în baza de date API."

        r_h2h = requests.get(f"https://v3.tennis.api-sports.io/fixtures/h2h?h2h={home_id}-{away_id}", headers=headers, timeout=5).json()
        
        stats = {"sport": "Tenis", "istoric_direct_h2h_ultimele_5_meciuri": []}
        
        if r_h2h.get("response"):
            for h2h in r_h2h["response"][:5]: 
                h_name = h2h["teams"]["home"]["name"]
                a_name = h2h["teams"]["away"]["name"]

                h_sets = h2h.get("scores", {}).get("home", 0)
                a_sets = h2h.get("scores", {}).get("away", 0)

                score_str = h2h.get("score", {}).get("all", "Detalii game-uri indisponibile")
                
                stats["istoric_direct_h2h_ultimele_5_meciuri"].append(
                    f"{h_name} vs {a_name} | Seturi: {h_sets} - {a_sets} | Scor: {score_str}"
                )
                
        return json.dumps(stats, indent=2, ensure_ascii=False)
    except Exception as e: return f"Eroare Tenis: {e}"

def get_kw(name: str, sport: str = "") -> str:
    """Extrage cuvântul cheie relevant din numele unei echipe/jucător pentru matching."""
    if not name: return ""
    normalized = strip_accents(name)
    junk = {'fc', 'united', 'city', 'real', 'sporting', 'athletic', 'club', 'sc', 'ac', 'st', 'fcsb', 'dinamo', 'cs', 'afc', 'cf', 'as'}
    parts = [w for w in normalized.replace('-', ' ').split() if len(w) > 2 and w.lower() not in junk]
    if not parts:
        return normalized.split()[0]
    # For tennis player names, prefer the LAST word (surname) as it's more unique
    if sport == "tennis":
        return parts[-1]
    return max(parts, key=len)

def get_premium_baseball_data(home_team, away_team, match_date):
    api_key = os.getenv("API_SPORTS_KEY")
    if not api_key:
        return "Date premium baseball indisponibile."
    
    headers = {"x-rapidapi-host": "v1.baseball.api-sports.io", "x-rapidapi-key": api_key}
    
    try:
        r_games = requests.get(f"https://v1.baseball.api-sports.io/games?date={match_date}", headers=headers, timeout=5).json()
        if not r_games.get("response"):
            return "{}"
        
        game_id, home_id, away_id = None, None, None
        home_kw = get_kw(home_team).lower()
        
        for g in r_games["response"]:
            if home_kw in strip_accents(g["teams"]["home"]["name"]).lower():
                game_id = g["id"]
                home_id = g["teams"]["home"]["id"]
                away_id = g["teams"]["away"]["id"]
                break
        
        if not game_id:
            return "{}"
        
        stats = {"sport": "Baseball", "absenți_accidentați": {"gazde": [], "oaspeți": []}, "h2h_recent": []}
        
        r_inj = requests.get(f"https://v1.baseball.api-sports.io/injuries?game={game_id}", headers=headers, timeout=5).json()
        if r_inj.get("response"):
            for inj in r_inj["response"]:
                t_id = inj.get("team", {}).get("id")
                player = inj.get("player", {}).get("name")
                if t_id == home_id:
                    stats["absenți_accidentați"]["gazde"].append(player)
                else:
                    stats["absenți_accidentați"]["oaspeți"].append(player)
        
        r_h2h = requests.get(f"https://v1.baseball.api-sports.io/games/h2h?h2h={home_id}-{away_id}", headers=headers, timeout=5).json()
        if r_h2h.get("response"):
            for h in r_h2h["response"][:5]:
                h_name = h["teams"]["home"]["name"]
                h_score = h["scores"]["home"]["total"]
                a_name = h["teams"]["away"]["name"]
                a_score = h["scores"]["away"]["total"]
                stats["h2h_recent"].append(f"{h_name} {h_score} - {a_score} {a_name}")

        return json.dumps(stats, indent=2, ensure_ascii=False)
    except:
        return "{}"


@app.get("/analyze-cached")
def analyze_cached(sport: str = Query(""), home_team: str = Query(""), away_team: str = Query(""), match_date: str = Query("")):
    """
    Lightweight cache-only endpoint. Returns saved analysis instantly if it exists.
    No auth required, no external API calls, no AI generation.
    """
    if not sport or not home_team or not away_team or not match_date:
        return {"cached": False}
    seif_key = f"{sport}_{home_team}_{away_team}_{match_date}".replace(" ", "_").lower()
    conn = _db_connect()
    row = conn.execute("SELECT analysis_json FROM saved_analyses WHERE match_key=?", (seif_key,)).fetchone()
    conn.close()
    if row:
        analysis = json.loads(row["analysis_json"])
        # Always inject fresh odds from DB (they may have been missing at generation time)
        odds_str = _lookup_odds_from_db(sport, home_team, away_team)
        analysis = _inject_real_odds(analysis, odds_str)
        return {"cached": True, "analysis": analysis}
    return {"cached": False}


@app.post("/analyze")
async def analyze(
    data: AnalyzeRequest,
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
    authorization: Optional[str] = Header(default=None),
):
    """
    FUNCȚIA ANALYZE BETONATĂ: 
    Unește calculul matematic Python cu Promptul Expert.
    Protejată prin Firebase Auth + tier-based quotas.
    """
    # ── Authenticate FIRST ──
    firebase_uid = None
    user_plan = None
    if authorization and authorization.startswith("Bearer "):
        decoded = await verify_firebase_token(authorization)
        firebase_uid = decoded["uid"]
        sub = get_user_subscription(firebase_uid)
        if sub["status"] not in ("active", "canceled"):
            raise HTTPException(status_code=403, detail="Abonament inactiv. Alege un plan.")
        user_plan = sub["plan"]
    else:
        require_api_key(x_api_key)

    # ── Restrict analysis to daily sync window (10:00 RO → 09:59 RO next day) ──
    # After the daily sync at ~10:00 Romania, analyses are available for all
    # matches kicking off between 10:00 RO today and 09:59 RO tomorrow.
    # A match at e.g. 05:07 RO on Apr 6 belongs to the Apr 5 10:00 window.
    ro = _ro_tz()
    now_ro = datetime.now(ro)

    # Parse kickoff time from extra_context or DB
    kickoff_utc = None
    if data.extra_context:
        try:
            ctx = json.loads(data.extra_context)
            raw_start = ctx.get("start_time_utc")
            if raw_start:
                kickoff_utc = datetime.fromisoformat(raw_start.replace("Z", "+00:00"))
                if kickoff_utc.tzinfo is None:
                    kickoff_utc = kickoff_utc.replace(tzinfo=timezone.utc)
        except (json.JSONDecodeError, ValueError):
            pass

    if kickoff_utc is None:
        try:
            conn_ev = _db_connect()
            cur_ev = conn_ev.cursor()
            cur_ev.execute(
                "SELECT start_time_utc FROM events WHERE sport=? AND home_team=? AND away_team=? ORDER BY start_time_utc DESC LIMIT 1",
                (data.sport.value if hasattr(data.sport, 'value') else data.sport, data.home_team, data.away_team),
            )
            ev_row = cur_ev.fetchone()
            conn_ev.close()
            if ev_row and ev_row["start_time_utc"]:
                kickoff_utc = datetime.fromisoformat(ev_row["start_time_utc"].replace("Z", "+00:00"))
                if kickoff_utc.tzinfo is None:
                    kickoff_utc = kickoff_utc.replace(tzinfo=timezone.utc)
        except Exception:
            pass

    # Determine which 10:00 RO sync covers this match
    if kickoff_utc:
        kickoff_ro = kickoff_utc.astimezone(ro)
        # Matches 10:00-23:59 → same day's 10:00 sync; 00:00-09:59 → previous day's 10:00 sync
        if kickoff_ro.hour >= 10:
            sync_day = kickoff_ro.date()
        else:
            sync_day = (kickoff_ro - timedelta(days=1)).date()
    else:
        # Fallback: match_date at 10:00 RO
        sync_day = data.match_date

    available_at_ro = datetime(sync_day.year, sync_day.month, sync_day.day, 10, 0, 0, tzinfo=ro)

    if now_ro < available_at_ro:
        diff = available_at_ro - now_ro
        hours_left = int(diff.total_seconds() // 3600)
        mins_left = int((diff.total_seconds() % 3600) // 60)
        eta_str = f"{hours_left}h {mins_left}m" if hours_left > 0 else f"{mins_left}m"
        raise HTTPException(
            status_code=422,
            detail=json.dumps({
                "code": "ANALYSIS_NOT_AVAILABLE",
                "message": f"Analiza va fi disponibilă pe {available_at_ro.strftime('%d.%m.%Y')} după sincronizarea zilnică (~10:00).",
                "eta": eta_str,
                "available_at": available_at_ro.isoformat(),
            })
        )

    # ── Build match key for cache + view tracking ──
    seif_key = f"{data.sport}_{data.home_team}_{data.away_team}_{data.match_date}".replace(" ", "_").lower()

    # ── Skip quota check if user already viewed this match today ──
    already_seen = firebase_uid and _already_viewed_today(firebase_uid, seif_key)
    if not already_seen and firebase_uid and user_plan:
        check_analysis_quota(firebase_uid, user_plan)

    # ── Check cache (fast path, no lock needed) ──
    conn = _db_connect()
    cur = conn.cursor()
    cur.execute("SELECT analysis_json FROM saved_analyses WHERE match_key=?", (seif_key,))
    row = cur.fetchone()
    conn.close()
    
    if row:
        if firebase_uid:
            _increment_unique_analysis(firebase_uid, seif_key)
        analysis = json.loads(row["analysis_json"])
        # Always inject fresh odds from DB
        odds_str = _lookup_odds_from_db(data.sport, data.home_team, data.away_team)
        analysis = _inject_real_odds(analysis, odds_str)
        print(f"💎 [SEIF] Analiză livrată din memorie pentru: {data.home_team}")
        return {"analysis": analysis}

    # ── Cache miss — acquire per-match lock to prevent duplicate AI generations ──
    # If 100 users request the same match, only the first generates via AI.
    # The rest wait for the lock and then read from cache.
    match_lock = await _get_seif_lock(seif_key)
    async with match_lock:
        # Re-check cache inside lock (another request may have filled it while we waited)
        conn = _db_connect()
        cur = conn.cursor()
        cur.execute("SELECT analysis_json FROM saved_analyses WHERE match_key=?", (seif_key,))
        row = cur.fetchone()
        if row:
            conn.close()
            if firebase_uid:
                _increment_unique_analysis(firebase_uid, seif_key)
            analysis = json.loads(row["analysis_json"])
            odds_str = _lookup_odds_from_db(data.sport, data.home_team, data.away_team)
            analysis = _inject_real_odds(analysis, odds_str)
            print(f"💎 [SEIF] Analiză livrată din memorie (post-lock) pentru: {data.home_team}")
            return {"analysis": analysis}

        # ── No cache — fetch premium data ──
        premium_raw = get_api_sports_data(data.sport, data.home_team, data.match_date)
        
        home_id = premium_raw.get("basic_info", {}).get("teams", {}).get("home", {}).get("id")
        away_id = premium_raw.get("basic_info", {}).get("teams", {}).get("away", {}).get("id")

        # Use each team's ACTUAL recent fixtures for form (not H2H between them)
        recent_home = premium_raw.get("recent_home", []) or []
        recent_away = premium_raw.get("recent_away", []) or []

        if recent_home:
            forma_home = calculate_exact_metrics(recent_home, home_id)
        else:
            # Fallback: use H2H if recent fixtures unavailable
            history = premium_raw.get("h2h_history", []) or []
            forma_home = get_exact_stats(history, home_id, data.sport)

        if recent_away:
            forma_away = calculate_exact_metrics(recent_away, away_id)
        else:
            history = premium_raw.get("h2h_history", []) or []
            forma_away = get_exact_stats(history, away_id, data.sport)

        intel_pool = {
            "forma_exacta_gazde": forma_home["string"],
            "forma_exacta_oaspeti": forma_away["string"],
            "detalii_premium": premium_raw
        }

        # Build standings string from fetched data
        standings_raw = premium_raw.get("standings", [])
        standings_str = format_standings_for_prompt(standings_raw, data.home_team, data.away_team, data.sport)

        odds_str = _lookup_odds_from_db(data.sport, data.home_team, data.away_team)

        if data.sport == "football":
            live_intel = get_premium_football_data(data.home_team, data.away_team, data.match_date)
        else:
            cur.execute("SELECT provider_event_id, league_key FROM events WHERE home_team=? AND away_team=? COLLATE NOCASE LIMIT 1", (data.home_team, data.away_team))
            ev_row = cur.fetchone()
            event_id = ev_row["provider_event_id"] if ev_row else ""
            league_key = ev_row["league_key"] if ev_row else ""
            live_intel = get_real_live_data(data.sport, event_id, league_key, data.home_team, data.away_team)

        system_prompt = generate_system_prompt()
        
        # Trim odds to reduce token cost (keep top 3 bookmakers, remove bloat)
        odds_trimmed = _trim_odds_json(odds_str)
        
        user_input = f"""MECI: {data.home_team} vs {data.away_team}
LIGA: {data.league}
DATA: {data.match_date}
SPORT: {data.sport}

FORMĂ MATEMATICĂ (server-calculated, nu modifica):
- {data.home_team}: {intel_pool['forma_exacta_gazde']}
- {data.away_team}: {intel_pool['forma_exacta_oaspeti']}

{standings_str}

COTE LIVE:
{odds_trimmed}

DATE STATISTICE (din API extern — folosește mediile de goluri ca referință principală, ignoră sfatul modelului extern dacă contrazice cifrele):
{live_intel}
{f"Note utilizator: {data.extra_context}" if data.extra_context else ""}
Returnează DOAR JSON valid conform schemei din system prompt."""
        try:
            response = client.chat.completions.create(
                model=MODEL,
                temperature=0,
                max_tokens=1200,
                messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_input}],
            )
            content = response.choices[0].message.content
            if content.startswith("```json"):
                content = content.replace("```json", "", 1)
            if content.endswith("```"):
                content = content[::-1].replace("```"[::-1], "", 1)[::-1]
            
            parsed_json = json.loads(content.strip())
            
            # Post-procesare: validează și corectează model_probability / fair_odds
            parsed_json = _fix_probabilities(parsed_json)
            
            # Override section3_odds with real bookmaker data (never trust AI-generated odds)
            parsed_json = _inject_real_odds(parsed_json, odds_str)
            
            analysis_str = json.dumps(parsed_json, ensure_ascii=False)
            cur.execute("INSERT OR REPLACE INTO saved_analyses (match_key, analysis_json) VALUES (?, ?)", 
                        (seif_key, analysis_str))
            conn.commit()
            conn.close()
            
            # Persist to Firestore so cache survives server restarts
            _save_analysis_to_firestore(seif_key, analysis_str)
            
            print(f"✅ [SUCCES] Analiză generată și salvată pentru {data.home_team}")

            # Track usage for Firebase-authenticated users
            if firebase_uid:
                _increment_unique_analysis(firebase_uid, seif_key)

            return {"analysis": parsed_json}
            
        except Exception as e:
            if 'conn' in locals(): conn.close()
            print(f"❌ [EROARE AI] {e}")
            raise HTTPException(status_code=500, detail=str(e))

# ── Admin: Purge cached analysis ─────────────────────────────
@app.delete("/admin/analysis/{match_key:path}")
def admin_delete_analysis(
    match_key: str,
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
):
    """Delete a cached analysis by exact match_key. Requires APP_API_KEY."""
    require_api_key(x_api_key)
    conn = _db_connect()
    cur = conn.cursor()
    cur.execute("DELETE FROM saved_analyses WHERE match_key = ?", (match_key,))
    deleted = cur.rowcount
    conn.commit()
    conn.close()
    # Also delete from Firestore
    try:
        db_fs = _get_firestore_client()
        if db_fs:
            db_fs.collection("saved_analyses").document(match_key).delete()
    except Exception:
        pass
    return {"deleted": deleted, "match_key": match_key}

@app.delete("/admin/analysis-search")
def admin_delete_analysis_search(
    q: str = Query(..., description="Substring to match in match_key"),
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
):
    """Delete all cached analyses whose match_key contains the given substring."""
    require_api_key(x_api_key)
    conn = _db_connect()
    cur = conn.cursor()
    # First show what will be deleted
    cur.execute("SELECT match_key FROM saved_analyses WHERE match_key LIKE ?", (f"%{q}%",))
    keys = [r["match_key"] for r in cur.fetchall()]
    cur.execute("DELETE FROM saved_analyses WHERE match_key LIKE ?", (f"%{q}%",))
    deleted = cur.rowcount
    conn.commit()
    conn.close()
    # Also delete from Firestore
    try:
        db_fs = _get_firestore_client()
        if db_fs:
            for k in keys:
                db_fs.collection("saved_analyses").document(k).delete()
    except Exception:
        pass
    return {"deleted": deleted, "query": q, "keys_removed": keys}

@app.get("/admin/analyses")
def admin_list_analyses(
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
):
    """List all cached analyses (match_key and saved_at timestamp)."""
    require_api_key(x_api_key)
    conn = _db_connect()
    cur = conn.cursor()
    cur.execute("SELECT match_key, saved_at FROM saved_analyses ORDER BY saved_at DESC")
    rows = [{"match_key": r["match_key"], "saved_at": r["saved_at"]} for r in cur.fetchall()]
    conn.close()
    return {"count": len(rows), "analyses": rows}

@app.get("/admin/odds")
def admin_list_odds(
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
    q: Optional[str] = Query(default=None),
):
    """List match_odds entries. Optional ?q= to filter by match_title."""
    require_api_key(x_api_key)
    conn = _db_connect()
    cur = conn.cursor()
    if q:
        cur.execute("SELECT match_title, sport_key, league_key, start_time FROM match_odds WHERE match_title LIKE ? ORDER BY start_time", (f"%{q}%",))
    else:
        cur.execute("SELECT match_title, sport_key, league_key, start_time FROM match_odds ORDER BY start_time")
    rows = [{"match_title": r["match_title"], "sport_key": r["sport_key"], "league_key": r["league_key"], "start_time": r["start_time"]} for r in cur.fetchall()]
    conn.close()
    return {"count": len(rows), "odds": rows}

@app.post("/admin/refresh-firestore")
def admin_refresh_firestore(
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
):
    """Force a Firestore refresh (downloads latest events + odds)."""
    require_api_key(x_api_key)
    global _last_firestore_sync
    _last_firestore_sync = ""  # Reset to force re-download
    _refresh_from_firestore()
    conn = _db_connect()
    event_count = conn.execute("SELECT COUNT(*) FROM events").fetchone()[0]
    odds_count = conn.execute("SELECT COUNT(*) FROM match_odds").fetchone()[0]
    conn.close()
    return {"status": "ok", "events": event_count, "odds": odds_count}

@app.post("/analyze-ticket")
async def analyze_custom_ticket(
    data: VerifyTicketRequest,
    request: Request,
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
    authorization: Optional[str] = Header(default=None),
):
    # Firebase auth (preferred) or legacy API key
    firebase_uid = None
    if authorization and authorization.startswith("Bearer "):
        decoded = await verify_firebase_token(authorization)
        firebase_uid = decoded["uid"]
        sub = get_user_subscription(firebase_uid)
        if sub["status"] not in ("active", "canceled"):
            raise HTTPException(status_code=403, detail="Abonament inactiv. Alege un plan.")
        check_risk_quota(firebase_uid, sub["plan"])
    else:
        require_api_key(x_api_key)
        _check_risk_rate_limit(request.client.host if request.client else "unknown")
    
    if not data.picks or len(data.picks) < 2:
        raise HTTPException(status_code=400, detail="Biletul trebuie să conțină minim 2 meciuri.")
    conn = _db_connect()
    cur = conn.cursor()
    enriched_picks = []
    match_analyses = {}  # match_name -> analysis JSON for contradiction check

    for p in data.picks:
        team_words = strip_accents(p.match.split(" vs ")[0]).split()
        kw = team_words[0].lower()
        if len(kw) <= 3 and len(team_words) > 1:
            kw = team_words[1].lower()
        cur.execute("SELECT analysis_json FROM saved_analyses WHERE strip_accents(match_key) LIKE ? ORDER BY saved_at DESC LIMIT 1", (f"%{kw}%",))
        row = cur.fetchone()
        
        analysis_context = ""
        if row:
            try:
                ans = json.loads(row[0])
                match_analyses[p.match] = ans
                main_bet = ans.get('section2_bets', {}).get('main_bet', {})
                secondary = ans.get('section2_bets', {}).get('secondary_bets', [])
                sec_summary = "; ".join(f"{s.get('market')}-{s.get('pick')}(p={s.get('model_probability')}%)" for s in secondary[:2]) if secondary else ""
                analysis_context = f"\n  AI: {main_bet.get('market')}-{main_bet.get('pick')}(p={main_bet.get('model_probability')}%,fair={main_bet.get('fair_odds')})"
                if sec_summary:
                    analysis_context += f" | Alt: {sec_summary}"
            except:
                pass

        enriched_picks.append(f"{p.match} ({p.league}) | Pariu: {p.pick}{analysis_context}")
    
    conn.close()

    # ── Deterministic contradiction detection (runs BEFORE LLM) ──
    det_weak_links = []
    for p in data.picks:
        if p.match in match_analyses:
            canonical = extract_canonical_prediction(match_analyses[p.match])
            contradiction = check_contradiction(p.pick, p.league, canonical)
            if contradiction:
                det_weak_links.append({
                    "match": p.match,
                    "reason": f"Pariul tău ({contradiction['user_pick']}) contrazice recomandarea AI ({contradiction['ai_market']}: {contradiction['ai_pick']}, probabilitate {contradiction['ai_probability']}%).",
                    "_severity": contradiction["severity"],
                })

    ticket_details = "\n".join(enriched_picks)

    # ── Deterministic pre-contradictions injected into the LLM prompt ──
    contradiction_note = ""
    if det_weak_links:
        contradiction_note = "\n\nCONTRADICȚII DETECTATE AUTOMAT (include obligatoriu în weak_links):\n"
        for wl in det_weak_links:
            contradiction_note += f"- {wl['match']}: {wl['reason']}\n"

    system_prompt = f"""Ești Risk Manager pariuri sportive. Validezi biletul utilizatorului comparând pariurile lui cu recomandările AI atașate (market, pick, probabilitate).
REGULI:
1. Datele AI atașate sunt 100% corecte pentru meciul respectiv.
2. Dacă pariul utilizatorului se aliniază cu recomandarea AI (sau e logic), validează-l.
3. Penalizează în weak_links DOAR dacă pariul e complet invers față de AI.
4. Dacă biletul e bun, weak_links = [] și confidence_score mare (8-10).
5. Contradicțiile detectate automat de sistem sunt OBLIGATORIU incluse în weak_links — nu le ignora.
Răspunde EXCLUSIV JSON valid:
{{"general_verdict":"string","weak_links":[{{"match":"string","reason":"string"}}],"confidence_score":number(1-10)}}"""

    user_input = f"Verifică biletul:\n{ticket_details}{contradiction_note}"

    try:
        response = client.chat.completions.create(
            model=RISK_MODEL,
            temperature=0,
            max_tokens=500,
            response_format={ "type": "json_object" },
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_input},
            ],
        )
        content = response.choices[0].message.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        
        result = json.loads(content.strip())

        # ── Post-LLM enforcement: merge any deterministic contradictions
        # the LLM might have omitted back into weak_links ──
        llm_weak_matches = {wl.get("match", "").lower() for wl in (result.get("weak_links") or [])}
        for det_wl in det_weak_links:
            if det_wl["match"].lower() not in llm_weak_matches:
                if result.get("weak_links") is None:
                    result["weak_links"] = []
                result["weak_links"].append({"match": det_wl["match"], "reason": det_wl["reason"]})

        # If deterministic contradictions exist, cap the confidence score
        if det_weak_links:
            high_severity = any(wl["_severity"] == "high" for wl in det_weak_links)
            max_score = 4 if high_severity else 6
            try:
                current = int(result.get("confidence_score", 10))
                if current > max_score:
                    result["confidence_score"] = max_score
            except (ValueError, TypeError):
                pass

        # Track usage for Firebase-authenticated users
        if firebase_uid:
            _increment_usage(firebase_uid, "risk_analyses_count")

        return {"risk_analysis": result}
    except Exception as e:
        print(f"❌ [EROARE JSON RISK MANAGER]: {e}")
        raise HTTPException(status_code=500, detail=f"Eroare Risk Manager: {str(e)}")