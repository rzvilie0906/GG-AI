import os
import sqlite3
import requests
import json
from datetime import datetime, timezone
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
    "fifa.world": "soccer_fifa_world_cup",
    "rou.1": "soccer_romania_liga1",
    "ned.1": "soccer_netherlands_eredivisie",
    "por.1": "soccer_portugal_primeira_liga",
    "tur.1": "soccer_turkey_super_league",
    "nba": "basketball_nba",
    "euroleague": "basketball_euroleague",
    "nhl": "icehockey_nhl",
    "mlb": "baseball_mlb",
    "mlb_preseason": "baseball_mlb_preseason"
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
    conn = sqlite3.connect("sports.db")
    cur = conn.cursor()
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
    cur.execute("DELETE FROM match_odds")
    conn.commit()
    return conn

def sync_odds():
    if not API_KEYS:
        print("❌ EROARE: Nu ai pus ODDS_API_KEYS în fișierul .env (sau formatul e greșit)!")
        return

    conn = init_db()
    cur = conn.cursor()

    print("📊 Încep descărcarea cotelor COMPLETE (1X2, Totals, Spreads)...")
    print(f"🔑 Avem la dispoziție {len(API_KEYS)} chei API.")

    total_matches = 0
    current_key_index = 0

    for espn_key, odds_key in LEAGUE_MAP.items():
        print(f"   -> Scanez liga: {odds_key}...")
        
        if odds_key.startswith("soccer"):
            regions = "eu"
            markets = "h2h,totals,spreads"
        else:
            regions = "us,eu"
            markets = "h2h,totals,spreads"
            
        while current_key_index < len(API_KEYS):
            current_key = API_KEYS[current_key_index]
            
            url = f"https://api.the-odds-api.com/v4/sports/{odds_key}/odds/?apiKey={current_key}&regions={regions}&markets={markets}&oddsFormat=decimal"
            
            try:
                resp = requests.get(url, timeout=15)
                
                if resp.status_code == 200:
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
                url = f"https://api.the-odds-api.com/v4/sports/{tennis_key}/odds/?apiKey={current_key}&regions={regions}&markets={markets}&oddsFormat=decimal"

                try:
                    resp = requests.get(url, timeout=15)

                    if resp.status_code == 200:
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
    print(f"✅ GATA! Am descărcat și actualizat cotele live (Complete) pentru {total_matches} meciuri viitoare.")
    print("=====================================================")

if __name__ == "__main__":
    sync_odds()