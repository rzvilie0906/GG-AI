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
    "usa.1": "soccer_usa_mls",
    "fifa.world": "soccer_fifa_world_cup",
    "fifa.worldq.uefa": "soccer_fifa_world_cup_qualifiers_europe",
    "uefa.euro": "soccer_uefa_european_championship",
    "uefa.euroq": "soccer_uefa_euro_qualification",
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

# ── Credit budget ──────────────────────────────────────────────
# 2000 credits/month (4 keys × 500) ÷ 31 days ≈ 64 credits/day.
# Soccer uses 3cr (h2h+totals+spreads) + 1cr/event for btts, others 3cr, tennis 2cr.
# We cap each sync at 120 credits to stay safely within budget.
DAILY_CREDIT_BUDGET = 120
MAX_TENNIS_TOURNAMENTS = 3
BTTS_CREDIT_BUDGET = 40  # max credits to spend on btts (1cr per event)

def sync_odds():
    if not API_KEYS:
        print("❌ EROARE: Nu ai pus ODDS_API_KEYS în fișierul .env (sau formatul e greșit)!")
        return

    conn = init_db()
    cur = conn.cursor()

    # Date filter: only fetch odds for TODAY (09:00 Romania today → 08:59 Romania tomorrow)
    # This ensures we only spend API credits on matches we can actually analyze today.
    now_utc = datetime.now(timezone.utc)
    commence_from = now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
    commence_to = (now_utc + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"📅 Filtrez cote doar pentru AZI: {commence_from} → {commence_to}")

    # Only fetch odds for leagues that actually have events in the DB
    try:
        existing_leagues = set(
            r[0] for r in conn.execute("SELECT DISTINCT league_key FROM events").fetchall()
        )
    except Exception:
        existing_leagues = set()

    print("📊 Încep descărcarea cotelor (piețe inteligente per sport)...")
    print(f"🔑 Avem la dispoziție {len(API_KEYS)} chei API.")
    print(f"💰 Buget zilnic: {DAILY_CREDIT_BUDGET} credite (soccer=3cr+btts, others=3cr, tennis=2cr)")

    total_matches = 0
    current_key_index = 0
    api_calls = 0
    credits_used = 0

    # Collect soccer events for btts second pass
    # List of (espn_key, odds_key, event_id, db_match_title)
    soccer_events_for_btts = []

    for espn_key, odds_key in LEAGUE_MAP.items():
        # Skip leagues with no events in DB (saves API credits)
        if existing_leagues and espn_key not in existing_leagues:
            print(f"   ⏭️ Skip {odds_key} (no events in DB for {espn_key})")
            continue

        # Smart market selection per sport:
        # Soccer: h2h + totals + spreads = 3 credits (btts fetched separately per event)
        # Basketball/Hockey/Baseball: h2h + totals + spreads = 3 credits
        # Tennis: h2h + totals = 2 credits (no spreads in tennis)
        regions = "eu"
        if odds_key.startswith("soccer_"):
            markets = "h2h,totals,spreads"
            call_cost = 3
        else:
            markets = "h2h,totals,spreads"
            call_cost = 3

        # Check budget before making the call
        if credits_used + call_cost > DAILY_CREDIT_BUDGET:
            print(f"   ⚠️ Buget zilnic atins ({credits_used}/{DAILY_CREDIT_BUDGET} credite). Opresc scanarea ligilor.")
            break

        print(f"   -> Scanez liga: {odds_key} ({markets}, {call_cost}cr)...")
            
        while current_key_index < len(API_KEYS):
            current_key = API_KEYS[current_key_index]
            
            url = f"https://api.the-odds-api.com/v4/sports/{odds_key}/odds/?apiKey={current_key}&regions={regions}&markets={markets}&oddsFormat=decimal&commenceTimeFrom={commence_from}&commenceTimeTo={commence_to}"
            
            try:
                resp = requests.get(url, timeout=15)
                
                if resp.status_code == 200:
                    api_calls += 1
                    credits_used += call_cost
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

                        # Track soccer events for btts second pass
                        if odds_key.startswith("soccer_") and m.get("id"):
                            soccer_events_for_btts.append((espn_key, odds_key, m["id"], title))
                    
                    print(f"      ✅ {len(matches)} matches (budget: {credits_used}/{DAILY_CREDIT_BUDGET}cr, key remaining: {remaining})")
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

    # ── BTTS second pass: fetch per-event (Additional Market) ─────
    # btts is not a "featured market" so it must be fetched via
    # /v4/sports/{sport}/events/{eventId}/odds?markets=btts
    # Cost: 1 credit per event (0 if no btts data available).
    if soccer_events_for_btts and current_key_index < len(API_KEYS):
        btts_credits = 0
        btts_fetched = 0
        print(f"\n⚽ BTTS: Descărcarea cotelor 'Ambele Marchează' pentru {len(soccer_events_for_btts)} meciuri de fotbal...")
        for espn_key, odds_key, event_id, match_title in soccer_events_for_btts:
            if btts_credits >= BTTS_CREDIT_BUDGET:
                print(f"   ⚠️ Buget BTTS atins ({btts_credits}/{BTTS_CREDIT_BUDGET}cr). Opresc.")
                break
            if credits_used + 1 > DAILY_CREDIT_BUDGET:
                print(f"   ⚠️ Buget zilnic atins ({credits_used}/{DAILY_CREDIT_BUDGET}cr). Opresc BTTS.")
                break

            while current_key_index < len(API_KEYS):
                current_key = API_KEYS[current_key_index]
                btts_url = (
                    f"https://api.the-odds-api.com/v4/sports/{odds_key}/events/{event_id}/odds"
                    f"?apiKey={current_key}&regions=eu&markets=btts&oddsFormat=decimal"
                )
                try:
                    resp = requests.get(btts_url, timeout=15)
                    if resp.status_code == 200:
                        data = resp.json()
                        btts_bookmakers = data.get("bookmakers", [])
                        actual_cost = int(resp.headers.get("x-requests-last", "1"))
                        credits_used += actual_cost
                        btts_credits += actual_cost
                        api_calls += 1

                        if btts_bookmakers:
                            # Merge btts markets into the existing bookmakers_json for this match
                            row = cur.execute(
                                "SELECT id, bookmakers_json FROM match_odds WHERE match_title = ? AND sport_key = ? ORDER BY id DESC LIMIT 1",
                                (match_title, odds_key)
                            ).fetchone()
                            if row:
                                existing = json.loads(row[1])
                                # Build a lookup: bookmaker_key -> bookmaker dict
                                bk_lookup = {bk["key"]: bk for bk in existing}
                                for btts_bk in btts_bookmakers:
                                    bk_key = btts_bk["key"]
                                    btts_markets = btts_bk.get("markets", [])
                                    if bk_key in bk_lookup:
                                        # Append btts market(s) to existing bookmaker
                                        bk_lookup[bk_key].setdefault("markets", []).extend(btts_markets)
                                    else:
                                        # New bookmaker with only btts
                                        existing.append(btts_bk)
                                cur.execute(
                                    "UPDATE match_odds SET bookmakers_json = ? WHERE id = ?",
                                    (json.dumps(existing), row[0])
                                )
                            btts_fetched += 1
                            print(f"      ✅ BTTS {match_title}: {len(btts_bookmakers)} bookmakers")
                        else:
                            print(f"      ⏭️ BTTS {match_title}: nicio cotă disponibilă")
                        break

                    elif resp.status_code == 429:
                        print(f"   ⚠️ Cheia {current_key_index + 1} epuizată! Trec la următoarea...")
                        current_key_index += 1

                    elif resp.status_code == 404:
                        print(f"      ⏭️ BTTS {match_title}: eveniment indisponibil")
                        break

                    else:
                        print(f"      ⚠️ BTTS {match_title}: eroare {resp.status_code}")
                        break

                except Exception as e:
                    print(f"      ⚠️ BTTS {match_title}: eroare rețea {e}")
                    break

            if current_key_index >= len(API_KEYS):
                print("❌ ATENȚIE: Am epuizat complet creditele! Opresc BTTS.")
                break

        print(f"   ⚽ BTTS gata: {btts_fetched}/{len(soccer_events_for_btts)} meciuri cu cote BTTS ({btts_credits}cr)")
    else:
        if soccer_events_for_btts:
            print("   ⚠️ Nu mai avem chei API disponibile pentru BTTS.")

    # ── Tennis: descoperire dinamică a sporturilor active ──────────
    if current_key_index < len(API_KEYS) and credits_used < DAILY_CREDIT_BUDGET:
        print("\n🎾 Descoperire dinamică a turneelor de tenis active...")
        tennis_sports = get_live_tennis_sports(API_KEYS[current_key_index])
        # Cap tennis tournaments to save credits
        if len(tennis_sports) > MAX_TENNIS_TOURNAMENTS:
            print(f"   Găsite {len(tennis_sports)} turnee — limitat la {MAX_TENNIS_TOURNAMENTS} (buget)")
            tennis_sports = tennis_sports[:MAX_TENNIS_TOURNAMENTS]
        else:
            print(f"   Găsite {len(tennis_sports)} turnee de tenis active: {tennis_sports}")

        for tennis_key in tennis_sports:
            # Tennis: h2h + totals = 2 credits (no spreads in tennis)
            regions = "eu"
            markets = "h2h,totals"
            call_cost = 2

            # Check budget
            if credits_used + call_cost > DAILY_CREDIT_BUDGET:
                print(f"   ⚠️ Buget zilnic atins ({credits_used}/{DAILY_CREDIT_BUDGET}cr). Opresc scanarea tenisului.")
                break

            print(f"   -> Scanez tenis: {tennis_key} ({markets}, {call_cost}cr)...")

            while current_key_index < len(API_KEYS):
                current_key = API_KEYS[current_key_index]
                url = f"https://api.the-odds-api.com/v4/sports/{tennis_key}/odds/?apiKey={current_key}&regions={regions}&markets={markets}&oddsFormat=decimal&commenceTimeFrom={commence_from}&commenceTimeTo={commence_to}"

                try:
                    resp = requests.get(url, timeout=15)

                    if resp.status_code == 200:
                        api_calls += 1
                        credits_used += call_cost
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
                        print(f"      ✅ {len(matches)} matches (budget: {credits_used}/{DAILY_CREDIT_BUDGET}cr, key remaining: {remaining})")
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
    print(f"💰 Credite consumate: {credits_used}/{DAILY_CREDIT_BUDGET} buget zilnic (incl. BTTS per-event)")
    print(f"📊 Estimare lunară: ~{credits_used * 31} credite/lună din 2000 disponibile")
    print("=====================================================")

if __name__ == "__main__":
    sync_odds()