// ── Types ──────────────────────────────────────────────────────

export interface Fixture {
  id: string;
  home_team: string;
  away_team: string;
  league_name: string;
  start_time_utc: string;
  status: string;
  status_norm: string;
  provider?: string;
}

export interface League {
  league_key: string;
  league_name: string;
  count: number;
}

export interface MainBet {
  market: string;
  pick: string;
  model_probability: number | string;
  fair_odds: number | string;
  reasoning_bullets: string[];
}

export interface SecondaryBet {
  market: string;
  pick: string;
  model_probability: number | string;
  fair_odds: number | string;
  reasoning_bullets: string[];
}

export interface OddsEntry {
  market: string;
  pick: string;
  odds_range?: { min: number; max: number };
  bookmaker_quotes?: { bookmaker: string; odds: string }[];
}

export interface AnalysisResult {
  section1_analysis?: string;
  section2_bets?: {
    main_bet?: MainBet;
    secondary_bets?: SecondaryBet[];
  };
  section3_odds?: OddsEntry[];
}

export interface DailyPick {
  match: string;
  league: string;
  market: string;
  pick: string;
  odds: string;
}

export interface DailyTicketData {
  ticket: DailyPick[];
  date?: string;
  total_odds?: string | number;
  message?: string;
}

export interface TicketPick {
  match: string;
  league: string;
  pick: string;
}

export interface WeakLink {
  match: string;
  reason: string;
}

export interface RiskAnalysis {
  general_verdict: string;
  confidence_score: number | string;
  weak_links?: WeakLink[];
}
