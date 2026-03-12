"use client";

import { isoFromLocalDate, chipLabel, roShort } from "@/lib/utils";

interface DayChipsProps {
  selectedDate: string;
  onSelectDate: (iso: string) => void;
}


export default function DayChips({ selectedDate, onSelectDate }: DayChipsProps) {
  // Get current date in Europe/Bucharest timezone, at 00:00
  const now = new Date();
  const roNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Europe/Bucharest" })
  );
  roNow.setHours(0, 0, 0, 0);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(roNow.getTime() + i * 86400000);
    return { date: d, iso: isoFromLocalDate(d), label: chipLabel(d, i), short: roShort(d) };
  });

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5">
      {days.map((day) => (
        <button
          key={day.iso}
          onClick={() => onSelectDate(day.iso)}
          className={`min-w-[54px] px-2 py-2 rounded-lg cursor-pointer text-center transition-all duration-200 flex-shrink-0 border font-ui ${
            day.iso === selectedDate
              ? "bg-primary/15 border-primary/40 shadow-[0_0_12px_-4px_rgba(99,102,241,0.3)]"
              : "bg-transparent border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.1)]"
          }`}
        >
          <div className={`text-[9px] font-medium uppercase tracking-wider ${day.iso === selectedDate ? "text-primary" : "text-text-muted"}`}>{day.label}</div>
          <div className={`font-bold text-[12px] font-mono mt-0.5 ${day.iso === selectedDate ? "text-white" : "text-text-secondary"}`}>{day.short}</div>
        </button>
      ))}
    </div>
  );
}
