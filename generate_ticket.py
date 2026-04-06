
import os
import json
import sqlite3
import sys
import time
import asyncio
from datetime import datetime, timedelta, timezone
import pytz
from dotenv import load_dotenv
from openai import OpenAI
from main import analyze, AnalyzeRequest
from prediction_utils import build_ticket_from_analyses, validate_ticket_coherence

import firebase_admin
from firebase_admin import credentials, firestore

load_dotenv()
OPENAI_KEY = os.environ.get("OPENAI_API_KEY")
if not OPENAI_KEY:
    print("[FATAL] OPENAI_API_KEY is not set! Cannot generate tickets.")
    sys.exit(1)
client = OpenAI(api_key=OPENAI_KEY, max_retries=1)

AMERICA_LEAGUES = [
    "MLS", "USA", "Mexico", "Brazil", "Argentina", "Chile", "Colombia", 
    "Ecuador", "Peru", "Paraguay", "Uruguay", "Copa Libertadores", "Copa Sudamericana",
    "NBA", "NHL", "MLB", "NFL", "NCAA"
]

def _get_firestore_client():
    """Initialize Firebase Admin SDK and return Firestore client."""
    cred_path = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY", "firebase-service-account.json")
    if not firebase_admin._apps:
        if os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
        else:
            return None
    return firestore.client()

def _upload_ticket_to_firestore(cat_name: str, data: dict):
    """Upload a ticket to Firestore so the deployed backend can serve it."""
    db = _get_firestore_client()
    if db is None:
        print(f"[ERR] Cannot upload {cat_name}: Firebase not initialized (missing service account file)")
        sys.exit(1)
    db.collection("daily_tickets").document(cat_name).set(data)
    print(f"[OK] Bilet {cat_name} uploadat în Firestore.")

def save_empty(cat_name: str, today_display: str, reason: str = "Niciun meci disponibil pentru această categorie."):
    """Salvează un bilet gol când nu sunt meciuri disponibile."""
    data = {"ticket": [], "total_odds": 0, "date": today_display, "message": reason}
    with open(f"daily_ticket_{cat_name}.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    _upload_ticket_to_firestore(cat_name, data)
    print(f"[INFO] Bilet {cat_name} gol salvat — {reason}")

async def generate_all_tickets():
    conn = sqlite3.connect("sports.db", timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Ensure tables exist (CI runners start with no DB)
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

    # Verify DB has data
    event_count = cur.execute("SELECT COUNT(*) FROM events").fetchone()[0]
    print(f"[DB] events table has {event_count} rows")
    if event_count == 0:
        print("[WARN] events table is EMPTY — auto_sync may have failed. All tickets will be empty.")

    ro_tz = pytz.timezone("Europe/Bucharest")
    now_local = datetime.now(ro_tz)
    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Ticket window: 10:00 today -> 10:00 tomorrow (Romanian time)
    # If before 10:00, the window is from yesterday 10:00 to today 10:00
    if now_local.hour < 10:
        window_start = (now_local - timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
        window_end = now_local.replace(hour=10, minute=0, second=0, microsecond=0)
    else:
        window_start = now_local.replace(hour=10, minute=0, second=0, microsecond=0)
        window_end = (now_local + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)

    today_display = window_start.strftime("%d.%m.%Y")
    start_str = window_start.strftime("%Y-%m-%dT%H:%M:%SZ")
    end_str = window_end.strftime("%Y-%m-%dT%H:%M:%SZ")
    azi_str = window_start.strftime("%Y-%m-%d")
    maine_str = (window_start + timedelta(days=1)).strftime("%Y-%m-%d")
    
    eur_start, eur_end = f"{azi_str}T07:00:00Z", f"{maine_str}T07:00:00Z"
    us_start, us_end = f"{azi_str}T14:00:00Z", f"{maine_str}T14:00:00Z"

    AMERICA_KEYS = ["nba", "nhl", "mlb", "usa", "mex", "bra", "arg", "mls", "copa"]
    america_sql = " OR ".join([f"league_key LIKE '%{k}%'" for k in AMERICA_KEYS])

    categories = {
        "mixed": "1=1", 
        "football": "sport = 'football'",
        "basketball": "sport = 'basketball'",
        "hockey": "sport = 'hockey'"
    }

    for cat_name, condition in categories.items():
        print(f"\n[PILOT AUTOMAT] Extragere meciuri {cat_name.upper()}...")

        query = f"""
            SELECT sport, league_name, home_team, away_team, start_time_utc 
            FROM events 
            WHERE ({condition}) 
            AND start_time_utc > ?
            AND home_team != 'TBD' AND away_team != 'TBD'
            AND (
                (NOT ({america_sql}) AND start_time_utc >= ? AND start_time_utc <= ?)
                OR 
                (({america_sql}) AND start_time_utc >= ? AND start_time_utc <= ?)
            )
            ORDER BY start_time_utc ASC
        """

        cur.execute(query, (now_utc, eur_start, eur_end, us_start, us_end))
        matches = [dict(row) for row in cur.fetchall()]

        # For mixed: sample evenly across sports so we don't get all tennis/etc
        if cat_name == "mixed" and matches:
            from collections import defaultdict
            by_sport = defaultdict(list)
            for m in matches:
                by_sport[m["sport"]].append(m)
            # Prioritize sports that typically have odds: football, basketball, hockey
            priority_order = ["football", "basketball", "hockey", "baseball", "tennis"]
            mixed_picks = []
            per_sport = max(4, 15 // len(by_sport)) if by_sport else 4
            for sport in priority_order:
                if sport in by_sport:
                    mixed_picks.extend(by_sport[sport][:per_sport])
            # Add any remaining sports not in priority
            for sport, sport_matches in by_sport.items():
                if sport not in priority_order:
                    mixed_picks.extend(sport_matches[:per_sport])
            matches = mixed_picks[:20]
            print(f"  [MIXED] Distribuție: {', '.join(f'{s}={len(ms)}' for s, ms in by_sport.items())}")

        if not matches:
            print(f"[WARN] SQL query returned 0 matches for {cat_name} (now_utc={now_utc}, us_window={us_start}->{us_end}, eur_window={eur_start}->{eur_end})")
            save_empty(cat_name, today_display, "Niciun meci disponibil pentru această categorie.")
            continue

        print(f"[INFO] Găsite {len(matches)} meciuri pentru {cat_name}. Analizez premium primele {min(len(matches), 10)}...")
        print(f"[DEBUG] Primele 3 meciuri: {[(m['home_team'], m['away_team'], m['start_time_utc']) for m in matches[:3]]}")

        analyze_ok = 0
        analyze_fail = 0
        for m in matches[:10]: 
            try:
                print(f"  [ANALYZE] {m['home_team']} vs {m['away_team']} ({m['sport']})...")
                await analyze(AnalyzeRequest(
                    sport=m["sport"],
                    home_team=m["home_team"],
                    away_team=m["away_team"],
                    match_date=azi_str,
                    league=m["league_name"]
                ), x_api_key=os.environ.get("APP_API_KEY", ""), authorization=None)
                analyze_ok += 1
                print(f"  [OK] ✅ {m['home_team']} vs {m['away_team']}")
                await asyncio.sleep(1) 
            except Exception as ae:
                analyze_fail += 1
                print(f"  [FAIL] ❌ {m['home_team']} vs {m['away_team']}: {type(ae).__name__}: {ae}")
                continue
        print(f"[INFO] Analize reușite: {analyze_ok}/{min(len(matches), 10)} pentru {cat_name} (eșuate: {analyze_fail})")
        
        # Pauză între faza de analiză și generarea biletului pentru a evita rate limits
        if analyze_ok > 0:
            print("⏳ Pauză 10s între analize și generarea biletului...")
            await asyncio.sleep(10)

        # ── Build ticket from canonical analyses (no second LLM call) ──
        # Load all saved analyses for today's matches
        analyses_map = {}
        for m in matches[:15]:
            home = m["home_team"]
            away = m["away_team"]
            seif_key = f"{m['sport']}_{home}_{away}_{azi_str}".replace(" ", "_").lower()
            cur.execute("SELECT analysis_json FROM saved_analyses WHERE match_key=?", (seif_key,))
            row = cur.fetchone()
            if row:
                try:
                    analyses_map[seif_key] = json.loads(row[0])
                except json.JSONDecodeError:
                    pass

        print(f"[INFO] Analize canonice găsite: {len(analyses_map)}/{len(matches[:15])} pentru {cat_name}")

        picks = build_ticket_from_analyses(
            matches=matches[:15],
            analyses=analyses_map,
            max_picks=4,
            min_picks=2,
            mixed=(cat_name == "mixed"),
        )

        if not picks:
            print(f"[WARN] Bilet {cat_name}: insuficiente meciuri cu value din analizele canonice.")
            save_empty(cat_name, today_display, "Insuficiente meciuri cu valoare identificate.")
            continue

        # Validate coherence — remove any picks that contradict the AI analysis
        coherence = validate_ticket_coherence(picks, analyses_map)
        if not coherence["valid"]:
            contradiction_matches = set()
            for c in coherence["contradictions"]:
                print(f"[CONTRADICTION] {c['match']}: ticket={c.get('user_pick')} vs AI={c.get('ai_pick')} ({c.get('severity')}) — REMOVED")
                contradiction_matches.add(c["match"])
            picks = [p for p in picks if p.get("match") not in contradiction_matches]
            if len(picks) < 2:
                print(f"[WARN] Bilet {cat_name}: sub 2 picks rămase după eliminarea contradicțiilor.")
                save_empty(cat_name, today_display, "Insuficiente meciuri cu valoare identificate.")
                continue

        result_data = {"ticket": picks}

        total_odds = 1.0
        for p in result_data.get('ticket', []):
            try: total_odds *= float(p.get('odds', 1))
            except: pass

        result_data["total_odds"] = round(total_odds, 2)
        result_data["date"] = today_display

        with open(f"daily_ticket_{cat_name}.json", "w", encoding="utf-8") as f:
            json.dump(result_data, f, ensure_ascii=False, indent=2)
        _upload_ticket_to_firestore(cat_name, result_data)

        print(f"[OK] Bilet {cat_name} salvat. Cota: {result_data['total_odds']}")

    conn.close()

if __name__ == "__main__":
    asyncio.run(generate_all_tickets())