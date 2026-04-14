"""
prediction_utils.py — Single Source of Truth for Match Predictions

Provides:
  • extract_canonical_prediction(): extracts the structured prediction from a saved analysis
  • build_ticket_from_analyses(): builds a ticket deterministically from cached analyses
  • check_contradiction(): detects if a pick contradicts the canonical analysis
  • validate_ticket_coherence(): validates an entire ticket against saved analyses
"""

import json
import sqlite3
import unicodedata
from typing import Optional


def _db_connect():
    conn = sqlite3.connect("sports.db", timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _strip_accents(s: str) -> str:
    if not s:
        return s
    return ''.join(
        c for c in unicodedata.normalize('NFD', s)
        if unicodedata.category(c) != 'Mn'
    )


_SPORT_TO_ODDS_PREFIX = {
    "football": "soccer",
    "basketball": "basketball",
    "hockey": "icehockey",
    "baseball": "baseball",
    "tennis": "tennis",
}

# Preferred bookmakers in order (well-known, reliable)
_PREFERRED_BOOKMAKERS = [
    "williamhill", "unibet", "bet365", "pinnacle", "betfair",
    "tipico_de", "marathonbet", "onexbet",
]


def _lookup_real_odd(sport: str, home_team: str, away_team: str,
                     market: str, pick: str) -> float | None:
    """
    Look up the real bookmaker odd for a specific market+pick.
    Returns the price from the first preferred bookmaker that has it, or None.
    """
    try:
        conn = _db_connect()
        conn.create_function("strip_accents", 1, lambda s: _strip_accents(s) if s else s)
        cur = conn.cursor()
        odds_prefix = _SPORT_TO_ODDS_PREFIX.get(sport, "")

        # Fuzzy match: search by home team keyword
        home_norm = _strip_accents(home_team).lower()
        home_parts = [w for w in home_norm.replace('-', ' ').split() if len(w) > 2]
        home_kw = max(home_parts, key=len) if home_parts else home_norm.split()[0]

        cur.execute("""
            SELECT bookmakers_json FROM match_odds
            WHERE strip_accents(match_title) LIKE ? COLLATE NOCASE
            AND sport_key LIKE ?
        """, (f"%{home_kw}%", f"{odds_prefix}%"))
        row = cur.fetchone()
        conn.close()

        if not row:
            return None

        bookmakers = json.loads(row["bookmakers_json"])
        if not isinstance(bookmakers, list):
            return None

        # Map AI market names to odds API market keys
        mkt_lower = market.lower()
        if any(k in mkt_lower for k in ("1x2", "solist", "moneyline", "result")):
            api_market = "h2h"
        elif any(k in mkt_lower for k in ("total", "peste", "sub", "over", "under", "goluri", "puncte")):
            api_market = "totals"
        elif any(k in mkt_lower for k in ("btts", "both teams", "ambele", "gg")):
            api_market = "btts"
        elif any(k in mkt_lower for k in ("handicap", "spread")):
            api_market = "spreads"
        elif any(k in mkt_lower for k in ("double chance", "dubla", "dublă", "sansa dubla", "șansă dublă")):
            api_market = "double_chance"
        else:
            api_market = "h2h"  # default fallback

        pick_lower = pick.strip().lower()

        # Normalize pick for matching
        # "Yes"/"Da" → "Yes", "No"/"Nu" → "No" for BTTS
        btts_yes = pick_lower in ("yes", "da", "gg")
        btts_no = pick_lower in ("no", "nu", "ngg")

        # Sort bookmakers: preferred first, then others
        def bookie_priority(b):
            key = b.get("key", "")
            try:
                return _PREFERRED_BOOKMAKERS.index(key)
            except ValueError:
                return 100

        bookmakers.sort(key=bookie_priority)

        for bookie in bookmakers:
            for mkt in bookie.get("markets", []):
                if mkt.get("key") != api_market:
                    continue
                for outcome in mkt.get("outcomes", []):
                    name = outcome.get("name", "").strip().lower()
                    price = outcome.get("price")
                    point = outcome.get("point")

                    if not isinstance(price, (int, float)) or price <= 0:
                        continue

                    matched = False

                    if api_market == "h2h":
                        # Match team name or Draw
                        if pick_lower in ("x", "draw", "egal"):
                            matched = name == "draw"
                        else:
                            # Match by team keyword
                            pick_kw = _strip_accents(pick).lower()
                            pick_parts = [w for w in pick_kw.replace('-', ' ').split() if len(w) > 2]
                            pk = max(pick_parts, key=len) if pick_parts else pick_kw
                            matched = pk in _strip_accents(name).lower()

                    elif api_market == "totals":
                        # Match Over/Under + optional point
                        if "peste" in pick_lower or "over" in pick_lower:
                            matched = name == "over"
                        elif "sub" in pick_lower or "under" in pick_lower:
                            matched = name == "under"
                        # If pick has a threshold (e.g. "Over 2.5"), also check point
                        if matched and point is not None:
                            import re
                            nums = re.findall(r'\d+\.?\d*', pick)
                            if nums:
                                matched = abs(float(nums[0]) - point) < 0.01

                    elif api_market == "btts":
                        if btts_yes:
                            matched = name == "yes"
                        elif btts_no:
                            matched = name == "no"

                    elif api_market == "spreads":
                        # Match team name in spread
                        pick_kw = _strip_accents(pick).lower()
                        pick_parts = [w for w in pick_kw.replace('-', ' ').split() if len(w) > 2]
                        pk = max(pick_parts, key=len) if pick_parts else pick_kw
                        matched = pk in _strip_accents(name).lower()

                    elif api_market == "double_chance":
                        # Match "1X", "X2", "12" outcome names
                        pick_norm = pick_lower.replace(" ", "")
                        matched = name.lower().replace(" ", "") == pick_norm

                    if matched:
                        return round(price, 2)

        return None
    except Exception as e:
        print(f"⚠️ [REAL_ODD] Lookup error: {e}")
        return None


def extract_canonical_prediction(analysis_json: dict) -> dict:
    """
    Extract the canonical structured prediction from a saved analysis.
    Returns a flat dict with the primary recommendation.
    """
    bets = analysis_json.get("section2_bets", {})
    main_bet = bets.get("main_bet", {})
    secondary_bets = bets.get("secondary_bets", [])

    return {
        "main_market": main_bet.get("market", ""),
        "main_pick": main_bet.get("pick", ""),
        "main_probability": main_bet.get("model_probability", 0),
        "main_fair_odds": main_bet.get("fair_odds", 0),
        "main_reasoning": main_bet.get("reasoning_bullets", []),
        "secondary_bets": [
            {
                "market": sb.get("market", ""),
                "pick": sb.get("pick", ""),
                "probability": sb.get("model_probability", 0),
                "fair_odds": sb.get("fair_odds", 0),
            }
            for sb in (secondary_bets or [])
        ],
        "analysis_text": analysis_json.get("section1_analysis", ""),
    }


# ── Contradiction detection ───────────────────────────────────

# Maps of mutually exclusive outcomes per market family
_OPPOSITE_SIDES = {
    # 1X2 family
    "1": {"2", "x2"},
    "2": {"1", "1x"},
    "x": set(),
    "1x": {"2"},
    "x2": {"1"},
    "12": {"x"},
    # Over/Under family (normalized)
    "peste": {"sub"},
    "sub": {"peste"},
    "over": {"under"},
    "under": {"over"},
    # GG/NGG family
    "gg": {"ngg", "nu"},
    "ngg": {"gg", "da"},
    "da": {"ngg", "nu"},
    "nu": {"gg", "da"},
}


def _normalize_pick(pick: str) -> str:
    """Normalize a pick string for comparison."""
    p = pick.strip().lower()
    # Normalize Romanian terms
    p = p.replace("peste ", "peste_").replace("sub ", "sub_")
    p = p.replace("over ", "over_").replace("under ", "under_")
    return p


def _picks_contradict(pick_a: str, pick_b: str, market_a: str, market_b: str) -> bool:
    """
    Check if two picks are contradictory (opposite sides of the same market).
    Returns True if they contradict, False if compatible or unrelated.
    """
    pa = _normalize_pick(pick_a)
    pb = _normalize_pick(pick_b)

    # Same pick = no contradiction
    if pa == pb:
        return False

    # Different market families = no contradiction (e.g., 1X2 vs Over/Under)
    ma = market_a.strip().lower()
    mb = market_b.strip().lower()

    # Check if markets are in the same family
    same_family = False
    families = [
        {"1x2", "solist", "moneyline"},
        {"total", "peste", "sub", "over", "under", "goluri", "puncte"},
        {"gg", "ngg", "ambele", "btts"},
        {"handicap", "spread"},
        {"sansa dubla", "șansă dublă", "double chance"},
    ]
    for family in families:
        a_in = any(kw in ma for kw in family)
        b_in = any(kw in mb for kw in family)
        if a_in and b_in:
            same_family = True
            break

    if not same_family:
        return False

    # Check direct opposition
    opposites = _OPPOSITE_SIDES.get(pa, set())
    if pb in opposites:
        return True

    # For over/under with thresholds: "peste_2.5" vs "sub_2.5"
    if ("peste_" in pa or "over_" in pa) and ("sub_" in pb or "under_" in pb):
        # Extract threshold
        try:
            thresh_a = pa.split("_")[-1]
            thresh_b = pb.split("_")[-1]
            if thresh_a == thresh_b:
                return True
        except (IndexError, ValueError):
            pass

    if ("sub_" in pa or "under_" in pa) and ("peste_" in pb or "over_" in pb):
        try:
            thresh_a = pa.split("_")[-1]
            thresh_b = pb.split("_")[-1]
            if thresh_a == thresh_b:
                return True
        except (IndexError, ValueError):
            pass

    return False


def check_contradiction(
    user_pick: str,
    user_market: str,
    canonical: dict,
) -> Optional[dict]:
    """
    Check if a user's pick contradicts the canonical analysis for that match.

    Args:
        user_pick: The user's chosen pick (e.g., "2", "Peste 2.5")
        user_market: The user's chosen market (e.g., "1X2", "Total Goluri")
        canonical: Output of extract_canonical_prediction()

    Returns:
        None if no contradiction, or a dict with contradiction details.
    """
    # Check against main bet
    if _picks_contradict(user_pick, canonical["main_pick"], user_market, canonical["main_market"]):
        return {
            "type": "main_bet_contradiction",
            "user_pick": user_pick,
            "user_market": user_market,
            "ai_pick": canonical["main_pick"],
            "ai_market": canonical["main_market"],
            "ai_probability": canonical["main_probability"],
            "severity": "high",
        }

    # Check against secondary bets (lower severity)
    for sb in canonical.get("secondary_bets", []):
        if _picks_contradict(user_pick, sb["pick"], user_market, sb["market"]):
            return {
                "type": "secondary_bet_contradiction",
                "user_pick": user_pick,
                "user_market": user_market,
                "ai_pick": sb["pick"],
                "ai_market": sb["market"],
                "ai_probability": sb["probability"],
                "severity": "medium",
            }

    return None


def validate_ticket_coherence(picks: list[dict], match_analyses: dict[str, dict]) -> dict:
    """
    Validate an entire ticket for internal contradictions against saved analyses.

    Args:
        picks: List of {"match": ..., "pick": ..., "market": ..., "league": ...}
        match_analyses: Dict mapping match identifier to saved analysis JSON

    Returns:
        {"valid": bool, "contradictions": [...], "warnings": [...]}
    """
    contradictions = []
    warnings = []

    for pick in picks:
        match_id = pick.get("match", "")
        analysis = match_analyses.get(match_id)

        if not analysis:
            warnings.append({
                "match": match_id,
                "message": "Nu există analiză AI salvată pentru acest meci.",
            })
            continue

        canonical = extract_canonical_prediction(analysis)
        contradiction = check_contradiction(
            pick.get("pick", ""),
            pick.get("market", ""),
            canonical,
        )

        if contradiction:
            contradiction["match"] = match_id
            contradictions.append(contradiction)

    return {
        "valid": len(contradictions) == 0,
        "contradictions": contradictions,
        "warnings": warnings,
    }


def build_ticket_from_analyses(
    matches: list[dict],
    analyses: dict[str, dict],
    max_picks: int = 4,
    min_picks: int = 2,
    mixed: bool = False,
) -> list[dict]:
    """
    Build a ticket deterministically by selecting the best main_bets from cached analyses.
    No LLM call — purely data-driven selection from the canonical predictions.
    Uses real bookmaker odds instead of AI fair_odds.
    Pick count is flexible: targets 3 picks, can shrink to 2 if combined probability
    is very high, or expand to 4 if individual probabilities are lower but still valuable.

    Args:
        matches: List of match dicts with sport, home_team, away_team, league_name
        analyses: Dict mapping match_key to saved analysis JSON
        max_picks: Maximum picks to include
        min_picks: Minimum picks required
        mixed: If True, enforce sport diversity (max 2 per sport)

    Returns:
        List of ticket pick dicts, or empty list if insufficient quality picks.
    """
    candidates = []

    for m in matches:
        home = m["home_team"]
        away = m["away_team"]
        sport = m["sport"]
        league = m["league_name"]

        # Find the analysis for this match
        analysis = None
        for key, val in analyses.items():
            if home.lower().replace(" ", "_") in key and away.lower().replace(" ", "_") in key:
                analysis = val
                break
        # Fallback: partial match on home team
        if not analysis:
            home_lower = home.lower().replace(" ", "_")
            for key, val in analyses.items():
                if home_lower in key:
                    analysis = val
                    break

        if not analysis:
            continue

        canonical = extract_canonical_prediction(analysis)
        prob = canonical["main_probability"]
        if isinstance(prob, str):
            try:
                prob = float(prob)
            except ValueError:
                continue

        # Filter: only include picks with probability >= 55% and fair_odds in valid range
        if prob < 55:
            continue

        fair_odds = canonical["main_fair_odds"]
        if isinstance(fair_odds, str):
            try:
                fair_odds = float(fair_odds)
            except ValueError:
                fair_odds = 0

        # Skip if fair_odds below 1.20 (too safe / no value)
        if fair_odds > 0 and fair_odds < 1.20:
            continue

        # Look up real bookmaker odds for this pick
        real_odd = _lookup_real_odd(
            sport, home, away,
            canonical["main_market"], canonical["main_pick"]
        )
        if real_odd:
            display_odds = str(real_odd)
        elif fair_odds > 0:
            display_odds = str(round(fair_odds, 2))
        else:
            display_odds = "N/A"

        candidates.append({
            "match": f"{home} vs {away}",
            "league": league,
            "market": canonical["main_market"],
            "pick": canonical["main_pick"],
            "odds": display_odds,
            "reasoning": "; ".join(canonical["main_reasoning"][:2]) if canonical["main_reasoning"] else "",
            "probability": prob,
            "sport": sport,
            "_source": "canonical_analysis",
        })

    # Sort by probability descending (safest picks first)
    candidates.sort(key=lambda c: c["probability"], reverse=True)

    # If mixed, enforce sport diversity
    if mixed:
        selected = []
        sport_counts: dict[str, int] = {}
        for c in candidates:
            s = c["sport"]
            if sport_counts.get(s, 0) >= 2:
                continue
            selected.append(c)
            sport_counts[s] = sport_counts.get(s, 0) + 1
            if len(selected) >= max_picks:
                break
        candidates = selected
    else:
        candidates = candidates[:max_picks]

    if len(candidates) < min_picks:
        return []

    # ── Dynamic pick count: target 3, flex between 2 and 4 ──
    # If top picks have very high probability (avg ≥ 70%), 2 picks suffice.
    # If probabilities are moderate (avg 55-65%), include up to 4 for value.
    # Default target is 3 picks.
    if len(candidates) > 3:
        avg_prob = sum(c["probability"] for c in candidates[:3]) / 3
        if avg_prob >= 70:
            # Very confident — keep 2-3 picks (lower total odds, higher win chance)
            candidates = candidates[:3]
        elif avg_prob < 62:
            # Moderate confidence — include 4th pick for more value
            candidates = candidates[:4]
        else:
            # Normal — 3 picks is the sweet spot
            candidates = candidates[:3]
    # If exactly 3 candidates with very high avg prob, trim to 2
    if len(candidates) == 3:
        avg_prob = sum(c["probability"] for c in candidates) / 3
        if avg_prob >= 75:
            candidates = candidates[:2]

    # Clean up internal fields before returning
    for c in candidates:
        c.pop("probability", None)
        c.pop("sport", None)
        c.pop("_source", None)

    return candidates
