import os
import sqlite3
import requests
import json
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

load_dotenv()

keys_string = os.environ.get("ODDS_API_KEYS", "")
API_KEYS = [k.strip() for k in keys_string.split(",") if k.strip()]

LEAGUE_MAP = {
    "eng.1": "soccer_epl",
    "esp.1": "soccer_spain_la_liga",
    "ita.1": "soccer_italy_serie_a",
    "ger.1": "soccer_germany_bundesliga",
    "fra.1": "soccer_france_ligue_one",
    "uefa.champions": "soccer_uefa_champs_league",
    "uefa.europa": "soccer_uefa_europa_league",
    "uefa.europa.conf": "soccer_uefa_europa_conference_league",
    "rou.1": "soccer_romania_liga1",
    "ned.1": "soccer_netherlands_eredivisie",
    "por.1": "soccer_portugal_primeira_liga",
    "tur.1": "soccer_turkey_super_league",
    "bra.1": "soccer_brazil_serie_a",
    "arg.1": "soccer_argentina_primera_division",
    "mex.1": "soccer_mexico_ligamx",
    "sco.1": "soccer_spl",
    "bel.1": "soccer_belgium_first_div",
    "nba": "basketball_nba",
    "wnba": "basketball_wnba",
    "nhl": "icehockey_nhl",
    "mlb": "baseball_mlb",
}

def get_live_tennis_sports(api_key):
    """Fetch all currently active tennis sport keys from The Odds API."""
    try:
        resp = requests.get(
            f"https://api.the-odds-api.com/v4/sports/?apiKey={api_key}",
            timeout=10,
        )
        if resp.status_code == 200:
            sports = resp.json()
            tennis_sports = [
                s["key"] for s in sports
                if s.get("key", "").startswith("tennis") and s.get("active", False)
            ]
            return tennis_sports
    except Exception as e:
        print(f"   ⚠️ Eroare la descoperirea sporturilor de tenis: {e}")
    return []

def init_db():
    conn = sqlite3.connect("sports.db", timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    cur = conn.cursor()
    cur.execute("DROP TABLE IF EXISTS match_odds")
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
    conn.commit()
    return conn

def sync_odds():
    if not API_KEYS:
        print("❌ EROARE: Nu ai pus ODDS_API_KEYS în fișierul .env (sau formatul e greșit)!")
        return

    conn = init_db()
    cur = conn.cursor()

    # Date filter: only fetch odds for the next 2 days
    now_utc = datetime.now(timezone.utc)
    commence_from = now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
    commence_to = (now_utc + timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"📅 Filtrez cote doar pentru perioada: {commence_from} → {commence_to}")

    # Only fetch odds for leagues that actually have events in the DB
    try:
        existing_leagues = set(
            r[0] for r in conn.execute("SELECT DISTINCT league_key FROM events").fetchall()
        )
    except Exception:
        existing_leagues = set()

    print("📊 Încep descărcarea cotelor (1X2, Totals, Spreads)...")
    print(f"🔑 Avem la dispoziție {len(API_KEYS)} chei API.")
    print("💰 Cost: 3 credite per ligă (h2h+totals+spreads, eu region)")

    total_matches = 0
    current_key_index = 0
    api_calls = 0

    for espn_key, odds_key in LEAGUE_MAP.items():
        # Skip leagues with no events in DB (saves API credits)
        if existing_leagues and espn_key not in existing_leagues:
            print(f"   ⏭️ Skip {odds_key} (no events in DB for {espn_key})")
            continue

        print(f"   -> Scanez liga: {odds_key}...")
        
        # h2h+totals+spreads × eu = 3 credits/call (~60/day × 30 = 1800/month, fits 4 keys × 500)
        regions = "eu"
        markets = "h2h,totals,spreads"
            
        while current_key_index < len(API_KEYS):
            current_key = API_KEYS[current_key_index]
            
            url = f"https://api.the-odds-api.com/v4/sports/{odds_key}/odds/?apiKey={current_key}&regions={regions}&markets={markets}&oddsFormat=decimal&commenceTimeFrom={commence_from}&commenceTimeTo={commence_to}"
            
            try:
                resp = requests.get(url, timeout=15)
                
                if resp.status_code == 200:
                    api_calls += 1
                    remaining = resp.headers.get('x-requests-remaining', '?')
                    matches = resp.json()
                    for m in matches:
                        title = f"{m.get('home_team')} vs {m.get('away_team')}"
                        start_time = m.get('commence_time')
                        bookies = m.get('bookmakers', [])
                        
                        cur.execute("""
                            INSERT INTO match_odds (league_key, sport_key, match_title, start_time, bookmakers_json, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?)
                        """, (
                            espn_key, odds_key, title, start_time, json.dumps(bookies), datetime.now(timezone.utc).isoformat()
                        ))
                        total_matches += 1
                    
                    print(f"      ✅ {len(matches)} matches (credits remaining: {remaining})")
                    break 
                    
                elif resp.status_code == 429:
                    print(f"   ⚠️ Cheia {current_key_index + 1} a rămas fără credite! Trecem automat la următoarea...")
                    current_key_index += 1
                    
                elif resp.status_code == 401:
                    print(f"   ❌ Cheia {current_key_index + 1} este invalidă! Trecem automat la următoarea...")
                    current_key_index += 1
                    
                elif resp.status_code == 404:
                    print(f"   ⚠️ Liga {odds_key} nu e disponibila momentan in API (Poate fi in pauza).")
                    break
                    
                else:
                    print(f"   ⚠️ Eroare {resp.status_code}: {resp.text}")
                    break
                    
            except Exception as e:
                print(f"   ⚠️ Eroare rețea: {e}")
                break
                
        if current_key_index >= len(API_KEYS):
            print("❌ ATENȚIE: Am epuizat complet creditele de pe TOATE cheile disponibile! Opresc scanarea restului de ligi.")
            break

    # ── Tennis: descoperire dinamică a sporturilor active ──────────
    if current_key_index < len(API_KEYS):
        print("\n🎾 Descoperire dinamică a turneelor de tenis active...")
        tennis_sports = get_live_tennis_sports(API_KEYS[current_key_index])
        print(f"   Găsite {len(tennis_sports)} turnee de tenis active: {tennis_sports}")

        for tennis_key in tennis_sports:
            print(f"   -> Scanez tenis: {tennis_key}...")
            regions = "eu"
            markets = "h2h,totals,spreads"

            while current_key_index < len(API_KEYS):
                current_key = API_KEYS[current_key_index]
                url = f"https://api.the-odds-api.com/v4/sports/{tennis_key}/odds/?apiKey={current_key}&regions={regions}&markets={markets}&oddsFormat=decimal&commenceTimeFrom={commence_from}&commenceTimeTo={commence_to}"

                try:
                    resp = requests.get(url, timeout=15)

                    if resp.status_code == 200:
                        api_calls += 1
                        remaining = resp.headers.get('x-requests-remaining', '?')
                        matches = resp.json()
                        for m in matches:
                            title = f"{m.get('home_team')} vs {m.get('away_team')}"
                            start_time = m.get('commence_time')
                            bookies = m.get('bookmakers', [])

                            # Map to generic tennis league key for DB matching
                            league_key = "atp" if "_atp_" in tennis_key else "wta" if "_wta_" in tennis_key else "tennis"
                            cur.execute("""
                                INSERT INTO match_odds (league_key, sport_key, match_title, start_time, bookmakers_json, updated_at)
                                VALUES (?, ?, ?, ?, ?, ?)
                            """, (
                                league_key, tennis_key, title, start_time, json.dumps(bookies), datetime.now(timezone.utc).isoformat()
                            ))
                            total_matches += 1
                        print(f"      ✅ {len(matches)} matches (credits remaining: {remaining})")
                        break

                    elif resp.status_code == 429:
                        print(f"   ⚠️ Cheia {current_key_index + 1} a rămas fără credite! Trecem automat la următoarea...")
                        current_key_index += 1

                    elif resp.status_code == 401:
                        print(f"   ❌ Cheia {current_key_index + 1} este invalidă! Trecem automat la următoarea...")
                        current_key_index += 1

                    elif resp.status_code == 404:
                        print(f"   ⚠️ Turneul {tennis_key} nu e disponibil momentan.")
                        break

                    else:
                        print(f"   ⚠️ Eroare {resp.status_code}: {resp.text}")
                        break

                except Exception as e:
                    print(f"   ⚠️ Eroare rețea: {e}")
                    break

            if current_key_index >= len(API_KEYS):
                print("❌ ATENȚIE: Am epuizat complet creditele! Opresc scanarea restului de turnee de tenis.")
                break

    conn.commit()
    conn.close()
    
    print("=====================================================")
    print(f"✅ GATA! Am descărcat cotele pentru {total_matches} meciuri ({api_calls} API calls).")
    print(f"💰 Credite consumate: ~{api_calls * 3} (3 credite/call cu h2h+totals+spreads × eu)")
    print("=====================================================")

if __name__ == "__main__":
    sync_odds()