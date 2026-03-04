export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function isoFromLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function roDayName(d: Date): string {
  const n = ["Duminică", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă"];
  return n[d.getDay()];
}

export function roShort(d: Date): string {
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
}

export function chipLabel(d: Date, idx: number): string {
  if (idx === 0) return "Azi";
  if (idx === 1) return "Mâine";
  return roDayName(d).substring(0, 3);
}

export function labelSport(s: string): string {
  const m: Record<string, string> = {
    football: "Fotbal",
    tennis: "Tenis",
    basketball: "Baschet",
    hockey: "Hochei",
    handball: "Handbal",
    baseball: "Baseball",
  };
  return m[s] || s;
}

export function fmtTime(isoUtc: string | undefined): string {
  if (!isoUtc) return "—";
  const d = new Date(isoUtc);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("ro-RO", { hour: "2-digit", minute: "2-digit" });
}

export function normKey(x: string): string {
  return String(x || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/ /g, "-");
}

export function buildMatchKey(sport: string, league: string, home: string, away: string, dateIso: string): string {
  return `${sport}|${normKey(league)}|${normKey(home)}|${normKey(away)}|${dateIso}`;
}

export function nowStr(): string {
  return new Date().toLocaleTimeString();
}
