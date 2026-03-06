import sqlite3
import requests
from datetime import datetime, timedelta

SPORT_LEAGUES = {
    "football": {
        "espn_path": "soccer", 
        "leagues": ["rou.1", "eng.1", "esp.1", "ita.1", "ger.1", "fra.1", "uefa.champions", "uefa.europa", "uefa.europa.conf", "ned.1", "tur.1", "gre.1", "usa.1"]
    },
    "basketball": {
        "espn_path": "basketball", 
        "leagues": ["nba", "mens-euroleague"]
    },
    "hockey": {
        "espn_path": "hockey", 
        "leagues": ["nhl"]
    },
    "baseball": {
        "espn_path": "baseball", 
        "leagues": ["mlb"]
    },
    "tennis": {
        "espn_path": "tennis", 
        "leagues": ["atp", "wta"]
    }
}

def norm(s): return " ".join((s or "").strip().lower().split())

def sync_urmatoarele_7_zile():
    conn = sqlite3.connect("sports.db")
    cur = conn.cursor()
    
    cur.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            sport TEXT,
            league_key TEXT,
            league_name TEXT,
            start_time_utc TEXT,
            status TEXT,
            home_team TEXT,
            away_team TEXT,
            provider TEXT,
            provider_event_id TEXT,
            search_text TEXT
        )
    """)
    
    print("⏳ Descarc calendarul CURAT pentru următoarele 7 zile (Toate sporturile)...")
    # Clean up stale tennis entries (old format stored tournament-level "Unknown" records)
    cur.execute("DELETE FROM events WHERE sport='tennis' AND (home_team='Unknown' OR away_team='Unknown')")
    conn.commit()
    total_meciuri = 0
    
    for i in range(8):
        target_date = datetime.now() + timedelta(days=i)
        date_str = target_date.strftime("%Y%m%d")
        
        for sport, data in SPORT_LEAGUES.items():
            for league in data["leagues"]:
                url = f"https://site.api.espn.com/apis/site/v2/sports/{data['espn_path']}/{league}/scoreboard?dates={date_str}"
                
                try:
                    r = requests.get(url, timeout=5)
                    if r.status_code == 200:
                        resp_json = r.json()
                        events = resp_json.get("events", [])
                        league_name = resp_json.get("leagues", [{}])[0].get("name", league.upper())
                        
                        for ev in events:
                            # Tennis uses nested groupings → competitions for individual matches
                            if sport == "tennis":
                                groupings = ev.get("groupings", [])
                                for grp in groupings:
                                    grp_name = grp.get("grouping", {}).get("displayName", "")
                                    # Only include singles matches
                                    if "singles" not in grp_name.lower():
                                        continue
                                    for match in grp.get("competitions", []):
                                        match_id = match.get("id", "")
                                        start_time = match.get("startDate") or match.get("date")
                                        status = match.get("status", {}).get("type", {}).get("name", "UNKNOWN")

                                        competitors = match.get("competitors", [])
                                        home_team, away_team = "Unknown", "Unknown"
                                        for comp in competitors:
                                            player_name = comp.get("athlete", {}).get("displayName", "Unknown")
                                            if comp.get("homeAway") == "home" or comp.get("order") == 1:
                                                home_team = player_name
                                            else:
                                                away_team = player_name

                                        if home_team == "Unknown" and away_team == "Unknown":
                                            continue

                                        date_short = start_time.split("T")[0] if start_time else ""
                                        tournament_name = ev.get("name", league_name)
                                        display_league = f"{tournament_name}"
                                        internal_id = f"{sport}|{norm(league)}|{norm(home_team)}|{norm(away_team)}|{date_short}"
                                        search_text = f"{home_team} {away_team} {display_league} {sport}".lower()

                                        cur.execute("""
                                            INSERT OR REPLACE INTO events 
                                            (id, sport, league_key, league_name, start_time_utc, status, home_team, away_team, provider, provider_event_id, search_text)
                                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                        """, (internal_id, sport, league, display_league, start_time, status, home_team, away_team, "espn", match_id, search_text))
                                        total_meciuri += 1
                            else:
                                # Standard flat structure for other sports
                                event_id = ev.get("id")
                                start_time = ev.get("date")
                                status = ev.get("status", {}).get("type", {}).get("name", "UNKNOWN")
                            
                                competitors = ev.get("competitions", [{}])[0].get("competitors", [])
                                home_team, away_team = "Unknown", "Unknown"
                            
                                for comp in competitors:
                                    if comp.get("homeAway") == "home": 
                                        home_team = comp.get("athlete", {}).get("displayName") or comp.get("team", {}).get("displayName", "Unknown")
                                    else: 
                                        away_team = comp.get("athlete", {}).get("displayName") or comp.get("team", {}).get("displayName", "Unknown")

                                date_short = start_time.split("T")[0] if start_time else ""
                                internal_id = f"{sport}|{norm(league)}|{norm(home_team)}|{norm(away_team)}|{date_short}"
                                search_text = f"{home_team} {away_team} {league_name} {sport}".lower()

                                cur.execute("""
                                    INSERT OR REPLACE INTO events 
                                    (id, sport, league_key, league_name, start_time_utc, status, home_team, away_team, provider, provider_event_id, search_text)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                """, (internal_id, sport, league, league_name, start_time, status, home_team, away_team, "espn", event_id, search_text))
                                total_meciuri += 1
                except:
                    pass
                    
    conn.commit()
    conn.close()
    print("=========================================================")
    print(f"✅ GATA! Baza de date a fost populată cu {total_meciuri} meciuri pentru următoarele 7 zile.")
    print("=========================================================")

if __name__ == "__main__":
    sync_urmatoarele_7_zile()