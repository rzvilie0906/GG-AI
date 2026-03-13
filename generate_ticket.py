
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
    conn = sqlite3.connect("sports.db")
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

        analyze_ok = 0
        for m in matches[:10]: 
            try:
                await analyze(AnalyzeRequest(
                    sport=m["sport"],
                    home_team=m["home_team"],
                    away_team=m["away_team"],
                    match_date=azi_str,
                    league=m["league_name"]
                ), x_api_key=os.environ.get("APP_API_KEY", ""))
                analyze_ok += 1
                await asyncio.sleep(1) 
            except Exception as ae:
                print(f"[WARN] Analiza eșuată pentru {m['home_team']} vs {m['away_team']}: {ae}")
                continue
        print(f"[INFO] Analize reușite: {analyze_ok}/{min(len(matches), 10)} pentru {cat_name}")
        
        # Pauză între faza de analiză și generarea biletului pentru a evita rate limits
        if analyze_ok > 0:
            print("⏳ Pauză 10s între analize și generarea biletului...")
            await asyncio.sleep(10)

        prompt_data = []
        for m in matches[:15]:
            home = m["home_team"]
            words = [w for w in home.split() if len(w) > 3]
            home_kw = words[0] if words else home.split()[0]

            cur.execute("SELECT analysis_json FROM saved_analyses WHERE match_key LIKE ? ORDER BY saved_at DESC", (f"%{home_kw.lower()}%",))
            ans_row = cur.fetchone()
            
            # Filtrare cote strict pe sport — previne mixarea inter-sport
            sport = m["sport"]
            odds_prefix = {"football": "soccer", "basketball": "basketball", "hockey": "icehockey", "baseball": "baseball", "tennis": "tennis"}.get(sport, "")
            cur.execute("""
                SELECT bookmakers_json FROM match_odds 
                WHERE match_title LIKE ? COLLATE NOCASE 
                AND sport_key LIKE ?
            """, (f"%{home_kw}%", f"{odds_prefix}%"))
            odds_row = cur.fetchone()
            
            premium_info = "Fara analiza"
            if ans_row:
                full_info = json.loads(ans_row[0])
                premium_info = {
                    "analiza": full_info.get("section1_analysis", "")[:350], 
                    "recomandare": full_info.get("recommendation", ""),
                    "cota": full_info.get("odds", "")
                }
            
            cote_scurte = "Fara cote"
            if odds_row:
                try:
                    bookies = json.loads(odds_row[0])
                    if bookies and len(bookies) > 0:
                        cote_scurte = []
                        for bookie in bookies[:3]: 
                            cote_scurte.append({
                                "casa_de_pariuri": bookie.get("title", "Unknown"),
                                "markets": bookie.get("markets", [])
                            })
                except:
                    pass

            prompt_data.append({
                "meci": f"{home} vs {m['away_team']}",
                "analiza_premium": premium_info,
                "cote_disponibile": cote_scurte 
            })

        # --- Build the system prompt ---
        if cat_name == "mixed":
            sport_instruction = """Acum construiești un bilet MIXT din mai multe sporturi.
        REGULI SUPLIMENTARE PENTRU BILET MIXT:
        1. Alege meciuri din SPORTURI DIFERITE (ideal: 1 fotbal + 1 baschet + 1 hochei, sau orice combinație diversă).
        2. NU alege mai mult de 2 meciuri din același sport.
        3. Scopul biletului MIXT este diversificarea riscului pe mai multe sporturi."""
        else:
            sport_instruction = f"Acum analizezi secțiunea: {cat_name.upper()}."

        system_prompt = f"""Ești cel mai bun tipster profesionist din lume. {sport_instruction}
        Ești un motor profesionist de analiză sportivă. Tu îți câștigi existența din pariuri, deci ești obsedat de valoare și siguranță.
        
        ⚠️ REGULI STRICTE DE PARIERE:
        1. Cota ta țintă pentru fiecare meci trebuie să fie între 1.30 și 2.00. Nu juca 1.15, au value zero!
        2. NU TE LIMITA LA CEVA ANUME! Foloseste orice tip de pariu are valoare reală:
           - La Fotbal folosește Peste/Sub, GG (Ambele marchează), 1X2, șansă dublă (dacă au valoare).
           - La Baschet și Hochei folosește Total Puncte (Peste/Sub), Handicap (Spreads), 1X2 (Dacă e disponibil și are valoare).
        3. Alege cele mai SIGURE 2, 3 sau 4 meciuri cu cote excelente din lista furnizată, analizând toate tipurile de 'cote_disponibile'.
        
        ⚠️ REGULA ECHILIBRULUI ȘI A VALORII REALE (FĂRĂ PREJUDECĂȚI):
        1. Ești un analist obiectiv. NU te fixa pe un singur tip de pariu.
        2. Citește cu mare atenție MEDIILE de goluri și forța ofensivă/defensivă.
        3. Explorează toate opțiunile disponibile pentru a găsi cele mai bune cote - fie că este vorba de 1X2, Peste/Sub, GG, Handicap sau altele, folosește orice tip de pariu care oferă valoare reală.
        4. Alege cel mai LOGIC pariu din tot meniul disponibil.

        ⚠️ REGULI STRICTE DE PARIERE:
        1. Cota ta țintă pentru fiecare pariu trebuie să fie între 1.30 și 2.00.
        2. Nu te limita la un singur tip de pariu. Explorează toate opțiunile disponibile pentru a găsi cele mai bune cote - fie că este vorba de 1X2, Peste/Sub, GG, Handicap sau altele, folosește orice tip de pariu care oferă valoare reală.
        3. Analizează cu atenție câmpul 'cote_disponibile'.
        4. Dacă nu ai cota exactă în JSON, ESTIMEAZĂ O COTĂ.

        Returnează DOAR un JSON valid cu structura:
        {{
          "ticket": [
            {{
              "match": "Echipa 1 vs Echipa 2",
              "league": "Nume Liga",
              "market": "Ce pariu joci",
              "pick": "Pronostic",
              "odds": "1.75",
              "reasoning": "Motivația"
            }}
          ]
        }}"""
        
        try:
            result_data = None
            max_attempts = 3
            for attempt in range(max_attempts):
                try:
                    response = client.chat.completions.create(
                        model="gpt-4o",
                        temperature=0.3 if attempt > 0 else 0,
                        response_format={ "type": "json_object" },
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": json.dumps(prompt_data, ensure_ascii=False)}
                        ]
                    )
                    
                    result_data = json.loads(response.choices[0].message.content)
                    picks = result_data.get('ticket', [])
                    
                    if len(picks) >= 2:
                        break  # Good enough
                    print(f"[WARN] Încercarea {attempt+1}/{max_attempts}: GPT a returnat doar {len(picks)} meciuri pentru {cat_name}.")
                except Exception as gpt_err:
                    print(f"[WARN] Încercarea {attempt+1}/{max_attempts} GPT eșuată pentru {cat_name}: {type(gpt_err).__name__}: {gpt_err}")
                
                if attempt < max_attempts - 1:
                    wait_time = 30 * (attempt + 1)  # 30s, 60s
                    print(f"⏳ Aștept {wait_time}s înainte de reîncercare...")
                    time.sleep(wait_time)

            # Enforce 2-4 picks per ticket
            if result_data is None:
                print(f"[ERR] Bilet {cat_name}: toate cele {max_attempts} încercări GPT au eșuat.")
                save_empty(cat_name, today_display, "Eroare temporară la generare. Revino mai târziu.")
                continue
                
            picks = result_data.get('ticket', [])
            if len(picks) < 2:
                print(f"[WARN] Bilet {cat_name} are doar {len(picks)} meciuri după {max_attempts} încercări — prea puține.")
                save_empty(cat_name, today_display, "Insuficiente meciuri cu valoare identificate.")
                continue
            if len(picks) > 4:
                print(f"[WARN] Bilet {cat_name} are {len(picks)} meciuri — trunchiem la 4.")
                result_data['ticket'] = picks[:4]

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
            print("⏳ Aștept 90 de secunde pentru resetarea limitei OpenAI...")
            time.sleep(90)

        except Exception as e:
            print(f"[ERR] {cat_name} — excepție neașteptată: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            save_empty(cat_name, today_display, "Eroare temporară la generare. Revino mai târziu.")

    conn.close()

if __name__ == "__main__":
    asyncio.run(generate_all_tickets())