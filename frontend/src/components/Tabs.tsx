"use client";

interface TabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = [
  { key: "all", label: "Toate" },
  { key: "live", label: "Live" },
  { key: "upcoming", label: "Viitoare" },
  { key: "finished", label: "Finalizate" },
];

export default function Tabs({ activeTab, onTabChange }: TabsProps) {
  return (
    <div className="bg-[#07090f] p-1 rounded-lg border border-[rgba(255,255,255,0.04)]">
      <div className="flex w-full gap-0.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => onTabChange(t.key)}
            className={`flex-1 py-2 px-2 text-xs font-semibold cursor-pointer rounded-md transition-all duration-200 font-ui border-none ${
              activeTab === t.key
                ? "bg-primary/15 text-primary shadow-sm"
                : "text-text-muted hover:text-text-secondary hover:bg-[rgba(255,255,255,0.03)] bg-transparent"
            }`}
          >
            {t.key === "live" && activeTab === t.key && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-live mr-1.5 animate-pulse-soft" />
            )}
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
