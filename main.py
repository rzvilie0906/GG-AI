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
from datetime import date, datetime, timedelta, timezone
from typing import Optional, Literal, Any, Dict, List

from fastapi import FastAPI, Header, HTTPException, Query, Request, logger
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List
from dotenv import load_dotenv, find_dotenv

# Load .env BEFORE importing auth_billing so Stripe/Firebase env vars are available
_ = load_dotenv(find_dotenv())

from openai import OpenAI
from prompts import generate_system_prompt
from auth_billing import (
    billing_router, init_users_db, verify_firebase_token,
    get_user_subscription, check_analysis_quota, check_risk_quota,
    _increment_usage, _get_user, TIER_LIMITS,
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
TEMPERATURE = float(os.environ.get("TEMPERATURE", "0"))
MAX_TOKENS = int(os.environ.get("MAX_TOKENS", "1200"))

ALLOWED_ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173",
).split(",")

app = FastAPI(title="GG-AI Sports API", version="2.0.0")

ticket_lock = asyncio.Lock()

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
        
        h_score = scores.get("home") if isinstance(scores.get("home"), int) else scores.get("home", {}).get("total")
        a_score = scores.get("away") if isinstance(scores.get("away"), int) else scores.get("away", {}).get("total")

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
        
        h_g = goals.get("home") if isinstance(goals.get("home"), int) else goals.get("home", {}).get("total")
        a_g = goals.get("away") if isinstance(goals.get("away"), int) else goals.get("away", {}).get("total")

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
    conn = sqlite3.connect("sports.db")
    conn.row_factory = sqlite3.Row
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
            match_title TEXT PRIMARY KEY,
            sport_key TEXT,
            bookmakers_json TEXT,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    
    # Curăță analizele vechi la startup pentru a forța regenerarea cu promptul actualizat
    try:
        conn2 = _db_connect()
        conn2.execute("DELETE FROM saved_analyses")
        conn2.commit()
        conn2.close()
        print("🧹 [STARTUP] Cache analize vechi curățat — se vor regenera cu promptul nou.")
    except:
        pass

async def auto_sync_worker():
    while True:
        await asyncio.sleep(86400) 
        
        print("\n🔄 [AUTOPILOT] Actualizez calendarul și cotele pe silențios...")
        try:
            proc1 = await asyncio.create_subprocess_exec('python', 'sync_zile.py')
            await proc1.communicate() 
            
            proc2 = await asyncio.create_subprocess_exec('python', 'sync_odds.py')
            await proc2.communicate() 
            
            print("✅ [AUTOPILOT] Actualizare terminată cu succes!")
        except Exception as e:
            print(f"❌ [AUTOPILOT] Eroare în fundal: {e}")

@app.on_event("startup")
def _startup():
    _init_db()
    init_users_db()
    asyncio.create_task(auto_sync_worker())

def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def _day_bounds_utc(d: date) -> tuple[str, str]:
    start = datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    return start.isoformat().replace("+00:00", "Z"), end.isoformat().replace("+00:00", "Z")

def _normalize_status(raw_status: str) -> str:
    """Normalizează statusul ESPN într-un status standard (upcoming/live/finished)."""
    s = (raw_status or "").upper()
    if "IN_PROGRESS" in s or "IN_PLAY" in s or s == "LIVE" or "FIRST_HALF" in s or "SECOND_HALF" in s or "HALFTIME" in s:
        return "live"
    if "FINAL" in s or "FINISHED" in s or "FULL_TIME" in s or "END_PERIOD" in s or "POSTPONED" in s or "CANCELED" in s or "SUSPENDED" in s or "RETIRED" in s or "WALKOVER" in s or "ABANDONED" in s:
        return "finished"
    return "upcoming"

def _fix_probabilities(parsed: dict, odds_str: str) -> dict:
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
    return "upcoming"

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
                        if home_team.lower() in t_name.lower() or away_team.lower() in t_name.lower():
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

@app.get("/health")
def health(): return {"ok": True}

@app.get("/sports")
def sports(): return {"sports": SPORTS_LIST}

@app.get("/dates")
def available_dates():
    today = date.today().isoformat()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()
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
    
    result = []
    for r in rows:
        status_norm = _normalize_status(r["status"])
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
    now = datetime.now()
    if now.hour < 10:
        ticket_date = (now - timedelta(days=1)).strftime("%d.%m.%Y")
    else:
        ticket_date = now.strftime("%d.%m.%Y")
    valid_types = ["mixed", "football", "basketball", "hockey"]
    if type not in valid_types: type = "mixed"
    file_name = f"daily_ticket_{type}.json"

    try:
        if os.path.exists(file_name):
            with open(file_name, "r", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("date") == ticket_date and data.get("ticket"):
                return data
    except Exception:
        pass

    async with ticket_lock:
        if os.path.exists(file_name):
            with open(file_name, "r", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("date") == ticket_date and data.get("ticket"):
                return data

        print(f"⚠️ [FIRST VISITOR] Pornim generarea biletelor...")
        
        try:
            import sys
            import subprocess

            python_exe = sys.executable
            script_path = os.path.join(os.path.dirname(__file__), "generate_ticket.py")
            def run_script():
                return subprocess.run(
                    [python_exe, script_path],
                    capture_output=True,
                    text=True,
                    encoding='utf-8'
                )

            result = await asyncio.to_thread(run_script)

            if result.returncode == 0:
                print("✅ Generare terminată cu succes.")
                if os.path.exists(file_name):
                    with open(file_name, "r", encoding="utf-8") as f:
                        return json.load(f)
            else:
                print(f"❌ Scriptul a crăpat:\n{result.stderr}")
                
        except Exception as e:
            print(f"❌ Eroare la execuție: {e}")
            
    return {"ticket": [], "message": "Generarea este în curs sau a eșuat. Reveniți în 2 minute."}
    
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
        "baseball": "v1.baseball.api-sports.io"
    }
    
    if sport not in host_map: return {}
    host = host_map[sport]
    headers = {"x-rapidapi-host": host, "x-rapidapi-key": api_key}
    kw = get_kw(home_team).lower()
    season = match_date.year
    
    try:
        path = "fixtures" if sport in ["football"] else "games"
        r = requests.get(f"https://{host}/{path}?date={match_date}", headers=headers, timeout=10).json()
        matches = r.get("response", [])
        
        found = next((m for m in matches if kw in (m.get("teams", {}).get("home", {}).get("name") or "").lower()), None)
        if not found: return {}
        
        m_id = found.get("id") or found.get("fixture", {}).get("id")
        h_id = found["teams"]["home"]["id"]
        a_id = found["teams"]["away"]["id"]
        
        data = {"basic_info": found, "season_stats": {"home": {}, "away": {}}, "h2h_history": []}

        if sport in ["football", "baseball"]:
            league_id = found.get("league", {}).get("id")
            if league_id:
                s_res = requests.get(f"https://{host}/standings?league={league_id}&season={season}", headers=headers).json()
                responses = s_res.get("response", [])
                if responses:
                    league_data = responses[0].get("league", {})
                    standings_list = league_data.get("standings", [])
                    if standings_list:
                        actual_standings = standings_list[0]
                        for entry in actual_standings:
                            if entry.get("team", {}).get("id") == h_id: 
                                data["season_stats"]["home"] = entry.get("all", entry.get("stats", {}))
                            if entry.get("team", {}).get("id") == a_id: 
                                data["season_stats"]["away"] = entry.get("all", entry.get("stats", {}))
        inj_path = "injuries" if sport == "football" else "injuries"
        game_param = "fixture" if sport == "football" else "game"
        
        r_inj = requests.get(f"https://{host}/{inj_path}?{game_param}={m_id}", headers=headers).json()
        data["injuries"] = r_inj.get("response", [])

        h2h_res = requests.get(f"https://{host}/{path}/h2h?h2h={h_id}-{a_id}", headers=headers).json()
        data["h2h_history"] = h2h_res.get("response", [])[:10]
            
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

        ignore_words = ['club', 'team', 'real', 'city', 'united', 'sporting', 'fc', 'as', 'cf', 'athletic', 'dinamo']
        valid_words = [w for w in home_team.split() if len(w) > 2 and w.lower() not in ignore_words]
        home_kw = max(valid_words, key=len).lower() if valid_words else home_team.split()[0].lower()
        
        if r_fixtures.get("response"):
            for f in r_fixtures["response"]:
                h_name = f["teams"]["home"]["name"].lower()
                if home_kw in h_name:
                    fixture_id = f["fixture"]["id"]
                    break
                    
        if not fixture_id:
            return "Concentrează-te strict pe valoarea loturilor și pe stilul de joc istoric. Nu menționa că îți lipsesc date recente."

        url_pred = f"https://v3.football.api-sports.io/predictions?fixture={fixture_id}"
        r_pred = requests.get(url_pred, headers=headers, timeout=10).json()
        
        if r_pred.get("response"):
            pred = r_pred["response"][0]
            home_stats = pred.get("teams", {}).get("home", {})
            away_stats = pred.get("teams", {}).get("away", {})
            comp = pred.get("comparison", {})
            
            home_id = home_stats.get("id")
            away_id = away_stats.get("id")

            url_inj = f"https://v3.football.api-sports.io/injuries?fixture={fixture_id}"
            r_inj = requests.get(url_inj, headers=headers, timeout=5).json()
            
            absenti = {"gazde": [], "oaspeti": []}
            if r_inj.get("response"):
                for inj in r_inj["response"]:
                    team_id = inj.get("team", {}).get("id")
                    player_name = inj.get("player", {}).get("name")
                    reason = inj.get("player", {}).get("reason", "Indisponibil")
                    
                    if team_id == home_id:
                        absenti["gazde"].append(f"{player_name} ({reason})")
                    elif team_id == away_id:
                        absenti["oaspeti"].append(f"{player_name} ({reason})")

            stats_premium = {
                "sfat_matematic_API": pred.get("predictions", {}).get("advice"),
                "jucatori_absenti_meci_azi": absenti,
                "comparatie_stil_joc_si_forta": {
                    "forta_ofensiva": {"gazde": comp.get("att", {}).get("home"), "oaspeti": comp.get("att", {}).get("away")},
                    "forta_defensiva": {"gazde": comp.get("def", {}).get("home"), "oaspeti": comp.get("def", {}).get("away")}
                },
                "gazde_statistici_sezon": {
                    "forma_sir_meciuri": home_stats.get("league", {}).get("form"),
                    "medie_goluri_marcate": home_stats.get("league", {}).get("goals", {}).get("for", {}).get("average", {}).get("total"),
                    "medie_goluri_primite": home_stats.get("league", {}).get("goals", {}).get("against", {}).get("average", {}).get("total")
                },
                "oaspeti_statistici_sezon": {
                    "forma_sir_meciuri": away_stats.get("league", {}).get("form"),
                    "medie_goluri_marcate": away_stats.get("league", {}).get("goals", {}).get("for", {}).get("average", {}).get("total"),
                    "medie_goluri_primite": away_stats.get("league", {}).get("goals", {}).get("against", {}).get("average", {}).get("total")
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
            if home_kw.lower() in g["teams"]["home"]["name"].lower():
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
            if home_kw.lower() in g["teams"]["home"]["name"].lower():
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
            if home_kw.lower() in h_name.lower():
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

def get_kw(name: str) -> str:
    """Extrage cuvântul cheie relevant din numele unei echipe pentru matching."""
    if not name: return ""
    junk = {'fc', 'united', 'city', 'real', 'sporting', 'athletic', 'club', 'sc', 'ac', 'st', 'fcsb', 'dinamo', 'cs', 'afc', 'cf', 'as'}
    parts = [w for w in name.replace('-', ' ').split() if len(w) > 2 and w.lower() not in junk]
    return max(parts, key=len) if parts else name.split()[0]

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
            if home_kw in g["teams"]["home"]["name"].lower():
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
    # Firebase auth (preferred) or legacy API key
    firebase_uid = None
    if authorization and authorization.startswith("Bearer "):
        decoded = await verify_firebase_token(authorization)
        firebase_uid = decoded["uid"]
        sub = get_user_subscription(firebase_uid)
        if sub["status"] not in ("active", "canceled"):  # canceled = still has access until period end
            raise HTTPException(status_code=403, detail="Abonament inactiv. Alege un plan.")
        check_analysis_quota(firebase_uid, sub["plan"])
    else:
        require_api_key(x_api_key)

    premium_raw = get_api_sports_data(data.sport, data.home_team, data.match_date)
    
    home_id = premium_raw.get("basic_info", {}).get("teams", {}).get("home", {}).get("id")
    away_id = premium_raw.get("basic_info", {}).get("teams", {}).get("away", {}).get("id")
    history = premium_raw.get("h2h_history", []) or []

    forma_home = get_exact_stats(history, home_id, data.sport)
    forma_away = get_exact_stats(history, away_id, data.sport)

    intel_pool = {
        "forma_exacta_gazde": forma_home["string"],
        "forma_exacta_oaspeti": forma_away["string"],
        "detalii_premium": premium_raw
    }

    seif_key = f"{data.sport}_{data.home_team}_{data.away_team}_{data.match_date}".replace(" ", "_").lower()
    conn = _db_connect()
    cur = conn.cursor()
    cur.execute("SELECT analysis_json FROM saved_analyses WHERE match_key=?", (seif_key,))
    row = cur.fetchone()
    
    if row:
        conn.close()
        print(f"💎 [SEIF] Analiză livrată instant din memorie pentru: {data.home_team}")
        return {"analysis": json.loads(row["analysis_json"])}

    odds_str = "COTE_LIPSĂ: Nu oferi nicio cotă pe ecran. Nu inventa. Nu te plânge de lipsa lor."
    try:
        home_kw = get_kw(data.home_team)
        away_kw = get_kw(data.away_team)
        odds_prefix = SPORT_TO_ODDS_PREFIX.get(data.sport, "")
        
        # Pas 1: Căutare strictă — ambele echipe + sport corect
        cur.execute("""
            SELECT bookmakers_json, match_title, sport_key FROM match_odds 
            WHERE match_title LIKE ? COLLATE NOCASE 
            AND match_title LIKE ? COLLATE NOCASE
            AND sport_key LIKE ?
        """, (f"%{home_kw}%", f"%{away_kw}%", f"{odds_prefix}%"))
        odds_row = cur.fetchone()
        
        # Pas 2: Fallback — doar echipa gazdă + sport corect
        if not odds_row:
            cur.execute("""
                SELECT bookmakers_json, match_title, sport_key FROM match_odds 
                WHERE match_title LIKE ? COLLATE NOCASE 
                AND sport_key LIKE ?
            """, (f"%{home_kw}%", f"{odds_prefix}%"))
            odds_row = cur.fetchone()
        
        if odds_row:
            odds_str = odds_row["bookmakers_json"]
            print(f"✅ [COTE] Găsite pentru {data.home_team} vs {data.away_team} ({data.sport}) → meci DB: {odds_row['match_title']} | sport_key: {odds_row['sport_key']}")
        else:
            print(f"⚠️ [COTE] Nu s-au găsit cote pentru {data.home_team} vs {data.away_team} ({data.sport}, prefix: {odds_prefix})")
    except Exception as e:
        print(f"⚠️ Eroare la citirea cotelor: {e}")

    if data.sport == "football":
        live_intel = get_premium_football_data(data.home_team, data.away_team, data.match_date)
    else:
        cur.execute("SELECT provider_event_id, league_key FROM events WHERE home_team=? AND away_team=? COLLATE NOCASE LIMIT 1", (data.home_team, data.away_team))
        ev_row = cur.fetchone()
        event_id = ev_row["provider_event_id"] if ev_row else ""
        league_key = ev_row["league_key"] if ev_row else ""
        live_intel = get_real_live_data(data.sport, event_id, league_key, data.home_team, data.away_team)

    system_prompt = generate_system_prompt()
    user_input = f"""
    MECI: {data.home_team} vs {data.away_team}
    LIGA: {data.league}
    DATA: {data.match_date}
    
    🚨 REZULTATE MATEMATICE REALE (PROCESATE DE SERVER - INTERZIS SĂ MODIFICI ACESTE CIFRE):
    - Gazde: {intel_pool['forma_exacta_gazde']}
    - Oaspeți: {intel_pool['forma_exacta_oaspeti']}

    === 1. COTE LIVE DE LA CASELE DE PARIURI (1X2, Totals, Spreads) ===
    ```json
    {odds_str}
    ```

    === 2. DATE OFICIALE LIVE (Clasament, Forma, H2H, Absenți, Vreme, Predicții) ===
    {live_intel}
    
    {f"Note Extra de la utilizator: {data.extra_context}" if data.extra_context else ""}

    ⚠️ REGULĂ CRITICĂ ANTI-UMPLUTURĂ (FĂRĂ SCUZE):
    Dacă secțiunea "DATE OFICIALE LIVE" de mai sus este parțial goală (ex: lipsesc H2H sau clasamentul, lucru normal la meciurile de Cupă), ESTE STRICT INTERZIS să te scuzi în text. Nu folosi NICIODATĂ expresii precum "Deși nu avem informații", "Datele nu sunt disponibile", "În absența altor date". 
    În schimb, bazează-te exclusiv pe vasta ta cunoaștere internă despre istoria acestor cluburi, valoarea lotului și tactica antrenorilor pentru a umple golurile. Fii asumat, direct și sigur pe tine!

    INSTRUCȚIUNE MENTALĂ OBLIGATORIE:
    Înainte de a genera textul pentru "section1_analysis", procesează următoarele puncte din viziunea unui analist expert:
    - Contextul competiției (miza meciului)
    - Forma recentă acasă/deplasare
    - Poziția în clasament și diferența de puncte
    - Forța ofensivă vs Forța defensivă
    - Posesie, tactică și stil de joc preconizat
    - Impactul jucătorilor absenți asupra lotului
    - Istoricul direct (H2H)
    - Factori fizici și psihologici
    
    ⚠️ REGULI STRICTE DE ANALIZĂ (CITEȘTE CU ATENȚIE):

    SITUAȚIA A (Dacă ai primit date la secțiunea 2):
    - FĂRĂ POEZIE! Este interzis să folosești descrieri vagi ("formă favorabilă"). 
    - Tradu forma (W/D/L) în cifre clare: "Echipa are X victorii și Y înfrângeri". 
    - Bazează-te STRICT pe ce cifre ai primit (folosește datele de la secțiunea REZULTATE MATEMATICE de mai sus).

    SITUAȚIA B (Dacă datele de la secțiunea 2 lipsesc sau sunt indisponibile):
    - ESTE STRICT INTERZIS SĂ INVENTEZI forma recentă (victorii/înfrângeri în ultimele 5 meciuri) sau scoruri directe (H2H)!
    - ESTE STRICT INTERZIS să te scuzi (ex: "Nu avem informații despre formă").
    - În acest caz, concentrează-te EXCLUSIV pe: diferența de valoare a loturilor, experiența în competițiile europene, stilul tactic tradițional al echipelor și avantajul terenului propriu. Fii un analist care cunoaște greutatea cluburilor, dar nu inventează statistici de weekend.

    ⚠️ REGULA 2 - ANTI-UMPLUTURĂ LA DATE LIPSĂ:
    Dacă datele de mai sus sunt goale (lucru normal uneori la meciurile de Cupă), NU te scuza ("Datele nu sunt disponibile"). Bazează-te exclusiv pe memoria ta vastă despre istoria cluburilor și scrie exact ce știi despre forța lor globală.

    ⚠️ REGULA 3 - GESTIONAREA COTELOR LIPSĂ (Peste/Sub, Handicap):
    Dacă decizi că cel mai bun pariu este unul de tip "Peste/Sub" sau "Handicap" (în special la Baschet/Hochei), iar în secțiunea "COTE LIVE" primești doar cotele pentru câștigător (h2h/1x2), ESTE PERFECT NORMAL! 
    Nu scrie "N/A" sau "Fără cote live". În schimb, la secțiunea "odds", estimează o cotă standard de piață (ex: 1.85 - 1.90 pentru liniile asiatice/puncte echilibrate) și menționează la detalii: "Cota estimată pentru linia standard. Verifică oferta agenției tale."
    
    ⚠️ REGULĂ SPECIALĂ PENTRU BASCHET ȘI HOCHEI:
    Dacă sportul este baschet sau hochei, ESTE OBLIGATORIU să cauți și să analizezi piețele de "totals" (Peste/Sub puncte/goluri) și "spreads" (Handicap asiatic) din secțiunea de cote. Recomanzi soliști sau șansă dublă doar dacă cotele pentru 1X2 indică o valoare reală clară.

    ⚠️ REGULA DE AUR A EXPERTULUI (INTERZIS SĂ O ÎNCALCI):
    ESTE STRICT INTERZIS să folosești expresii de genul "Nu avem informații despre...", "Nu dispun de date", "Deși nu cunoaștem" sau "Lipsesc informațiile". Un tipster profesionist nu se plânge niciodată de lipsa datelor!
    Dacă o anumită informație (cum ar fi forma recentă, H2H sau accidentările) lipsește din datele brute pe care le primești, PUR ȘI SIMPLU IGNORĂ subiectul și nu îl menționa deloc în text. 
    Compensează folosind cunoștințele tale interne despre valoarea loturilor, stilul de joc istoric (ex: defensiv, ofensiv), motivația din campionat și cotele primite. Fii mereu 100% asertiv, obiectiv și sigur pe tine!

    ⚠️ REGULA COTELOR (TOLERANȚĂ ZERO LA INVENTAT):
    Cotele pe care le recomanzi pe bilet și pe care le afișezi în analiza ta TREBUIE SĂ FIE EXTRASE STRICT ȘI EXACT din datele pe care le primești în câmpul `cote_reale_agregate`.
    ESTE STRICT INTERZIS să inventezi, să aproximezi sau să estimezi cote din oficiu (ex: nu pune 1.85 sau 1.90 la Peste/Sub doar pentru că așa e standardul). 
    Dacă decizi să joci "Peste 2.5 goluri", te duci în JSON la `totals`, te uiți la casa de pariuri, cauți exact "Over 2.5" și iei cota REALĂ de acolo (ex: 1.73 sau 2.05). Dacă o cotă nu există fizic în JSON-ul primit, folosește textul "N/A" sau "Cotă indisponibilă momentan". Nu te juca cu banii pariorilor!

    ⚠️ INTERZIS SĂ TE PLÂNGI DE LIPSA DATELOR:
    - Este STRICT INTERZIS să folosești expresii precum: "Fără date recente", "În absența unor informații", "Nu putem evalua", "Lipsesc detalii", "Nu știm forma". 
    - Este STRICT INTERZIS să aduci vorba de absenți, accidentări sau "lineup-uri". Dacă nu primești aceste date, PRESUPUNE implicit că ambele echipe aliniază cel mai bun 11.
    - Vorbește asertiv DOAR despre lucrurile pe care le ȘTII sigur (cote, statistici primite). Un tipster adevărat nu se plânge niciodată clienților săi că nu și-a făcut temele!

    ⚠️ REGULA ECHILIBRULUI ȘI A VALORII REALE (FĂRĂ PREJUDECĂȚI):
    1. Ești un analist obiectiv. NU te fixa pe un singur tip de pariu (nu da mereu "Peste 2.5" sau mereu "GG"). 
    2. Citește cu mare atenție MEDIILE de goluri și forța ofensivă/defensivă! Dacă ambele echipe au medii mici de goluri marcate (ex: sub 1.3) și apărări solide, este OBLIGATORIU să recomanzi "Sub 2.5" sau "Sub 3.5". Nu forța pariuri pe goluri multe la echipe defensive!
    3. Soliștii (1, X, 2) sunt pariuri excelente dacă o echipă are o cotă cu valoare reală. Poți sugera și Șansă Dublă (1X sau X2) dacă cota permite.
    4. Alege cel mai LOGIC pariu din tot meniul disponibil (1X2, Peste/Sub, GG/NGG, DNB, Handicap, Pauza sau Final). Adaptează pariul EXACT la stilul de joc din statistici (ex: echipe de contraatac = meci închis = Sub 2.5/NGG; echipe ofensive = Peste 2.5/GG).
    5. Poti alege de asemenea si gg sau peste 2.5 sau gg si peste 2.5, daca datele indica acest lucru.
    
    ⚠️ ANALIZA AVANSATĂ A PIEȚEI 'BOTH TEAMS TO SCORE' (GG/NGG):
    SCENARIUL GG: Dacă ambele echipe au primit gol în cel puțin 70% din meciurile sezonului curent și au o medie de peste 1.3 goluri marcate, prioritizează 'Ambele marchează: DA' (GG).
    SCENARIUL NGG: Dacă una dintre echipe are o defensivă de fier (sub 0.8 goluri primite/meci) SAU dacă ambele echipe au medii de marcare sub 1.0 goluri/meci (meciuri de tip 'under'), prioritizează 'Ambele marchează: NU' (NGG).
    VALOARE: Dacă cota pentru NGG este de peste 1.80 în meciuri cu echipe defensive (ex. campionatul Italiei Serie B sau ligile secunde), recomandă acest pronostic ca 'High Value'. Nu forța GG-ul doar pentru spectacol; pariază pe pragmatism dacă cifrele o cer.

    ⚠️ CALCULUL VALORII MATEMATICE (OBLIGATORIU):
    1. Estimarea Probabilității: Pe baza formei sezonului, H2H și absenților, atribuie o probabilitate procentuală (ex. 60%) pentru pronosticul ales (GG, 1, Over etc.).
    2. Verificarea Cotei: Identifică cota reală din JSON.
    3. Aplicarea Formulei: Calculează Value = (Probabilitate * Cotă) - 1.
    4. Criteriu de Selecție: Recomandă pronosticul DOAR dacă valoarea este pozitivă (>0).
    5. Exemplu de logică în text: 'Estimez o probabilitate de 70% pentru GG (echivalentul unei cote de 1.43). Deoarece casa oferă cota 1.70, avem un Value de 0.19, ceea ce face pariul extrem de atractiv.'

    INSTRUCȚIUNE MENTALĂ OBLIGATORIE:
    Înainte de a scrie "section1_analysis", procesează: Miza, Forma exactă (W/D/L tradusă), Clasamentul, Forța Ofensivă, Istoricul H2H și Absenții.
    Corelează datele de mai sus și generează DOAR JSON valid conform schemei, găsind cel mai bun value bet pentru a-ți câștiga existența!

    ⚠️ REGULĂ ABSOLUTĂ PENTRU model_probability ȘI fair_odds (ANTI-VALORI STATICE):
    - model_probability TREBUIE să fie un număr UNIC calculat matematic pe baza datelor ACESTUI meci specific.
    - Formula fair_odds = 100 / model_probability (rotunjit la 2 zecimale).
    - ESTE STRICT INTERZIS să folosești mereu aceleași valori! NU folosi: 60/1.67, 65/1.54, 55/1.82 ca valori implicite.
    - Calculul: analizezi forma (% victorii), media goluri, H2H, forța echipelor → derivezi un procent REAL (ex: 72.3%, nu mereu 60 sau 65).
    - Fiecare meci produce probabilități DIFERITE. Un meci Real Madrid vs echipă mică = 82%. Un derby = 53%.
    - main_bet și secondary_bets TREBUIE să aibă probabilități DIFERITE între ele.
    """
    try:
        response = client.chat.completions.create(
            model=MODEL,
            temperature=0,
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_input}],
        )
        content = response.choices[0].message.content
        if content.startswith("```json"):
            content = content.replace("```json", "", 1)
        if content.endswith("```"):
            content = content[::-1].replace("```"[::-1], "", 1)[::-1]
        
        parsed_json = json.loads(content.strip())
        
        # Post-procesare: validează și corectează model_probability / fair_odds
        parsed_json = _fix_probabilities(parsed_json, odds_str)
        
        cur.execute("INSERT OR REPLACE INTO saved_analyses (match_key, analysis_json) VALUES (?, ?)", 
                    (seif_key, json.dumps(parsed_json, ensure_ascii=False)))
        conn.commit()
        conn.close()
        
        print(f"✅ [SUCCES] Analiză generată și salvată pentru {data.home_team}")

        # Track usage for Firebase-authenticated users
        if firebase_uid:
            _increment_usage(firebase_uid, "analyses_count")

        return {"analysis": parsed_json}
        
    except Exception as e:
        if 'conn' in locals(): conn.close()
        print(f"❌ [EROARE AI] {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
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

    for p in data.picks:
        team_words = p.match.split(" vs ")[0].split()
        kw = team_words[0].lower()
        if len(kw) <= 3 and len(team_words) > 1:
            kw = team_words[1].lower()
        cur.execute("SELECT analysis_json FROM saved_analyses WHERE match_key LIKE ? ORDER BY saved_at DESC LIMIT 1", (f"%{kw}%",))
        row = cur.fetchone()
        
        analysis_context = " (Fără date premium. Bazează-te pe experiența ta.)"
        if row:
            try:
                ans = json.loads(row[0])
                text_full = ans.get('section1_analysis', '')
                main_bet = ans.get('section2_bets', {}).get('main_bet', {})
                bet_recomandat = f"Recomandare Sistem AI: {main_bet.get('market')} - {main_bet.get('pick')} (Cotă: {main_bet.get('fair_odds')})"
                
                analysis_context = f"\n   | DATE PREMIUM: {text_full}\n   | {bet_recomandat}"
            except:
                pass

        enriched_picks.append(f"MECI: {p.match} ({p.league})\nJUCĂTORUL A PARIAT: {p.pick}{analysis_context}\n")
    
    conn.close()
    ticket_details = "\n".join(enriched_picks)

    system_prompt = """Ești un Risk Manager profesionist în pariuri sportive. 
    Rolul tău este să validezi biletul utilizatorului. 
    Ai la dispoziție DATELE PREMIUM (analiza text și recomandarea sistemului) pentru meciurile jucate.
    
    REGULI DE AUR:
    1. Asumă-ți OBLIGATORIU că datele premium atașate sunt 100% pentru meciul respectiv. NU afirma niciodată că 'analiza nu corespunde meciului'.
    2. Compară ce a pariat utilizatorul (JUCĂTORUL A PARIAT) cu DATELE PREMIUM. Dacă pariul utilizatorului are logică matematică și e susținut de textul analizei (ex: el a pus GG, iar analiza zice că ambele iau/dau goluri), validează-l ca fiind EXCELENT!
    3. Nu căuta nod în papură! Dacă biletul e bun, lasă lista 'weak_links' GOALĂ [] și dă-i o notă mare (8-10).
    4. Penalizează ('weak_links') DOAR dacă utilizatorul a pariat complet invers față de analiza premium (ex: pune 1 Solist, deși analiza zice că oaspeții domină).

    OBLIGATORIU: Trebuie să returnezi răspunsul EXCLUSIV sub formă de JSON valid, cu EXACT următoarea structură:
    {
        "general_verdict": "Concluzia ta (aprobă biletul dacă e bun, nu fi paranoic)",
        "weak_links": [
            {
                "match": "Echipa X vs Echipa Y",
                "reason": "Explicația clară de ce e periculos"
            }
        ],
        "confidence_score": 0
    }
    (Nota: confidence_score trebuie să fie un număr de la 1 la 10 bazat pe potrivirea dintre pariurile jucătorului și datele premium)."""

    user_input = f"""
    Te rog să verifici următorul bilet:
    {ticket_details}
    """

    try:
        response = client.chat.completions.create(
            model=MODEL,
            temperature=0, 
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

        # Track usage for Firebase-authenticated users
        if firebase_uid:
            _increment_usage(firebase_uid, "risk_analyses_count")

        return {"risk_analysis": result}
    except Exception as e:
        print(f"❌ [EROARE JSON RISK MANAGER]: {e}")
        raise HTTPException(status_code=500, detail=f"Eroare Risk Manager: {str(e)}")