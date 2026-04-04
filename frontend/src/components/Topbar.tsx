"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw } from "./Icons";

interface TopbarProps {
  apiOnline: boolean;
  lastRefresh: string;
  isRefreshing: boolean;
  onRefresh: () => void;
  userEmail?: string | null;
  userName?: string | null;
  onSignOut?: () => void;
  onUpgradePlan?: () => void;
}

export default function Topbar({ apiOnline, lastRefresh, isRefreshing, onRefresh, userEmail, userName, onSignOut, onUpgradePlan }: TopbarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const initials = userName
    ? userName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : userEmail
    ? userEmail.charAt(0).toUpperCase()
    : "?";

  return (
    <header className="h-16 border-b border-[rgba(255,255,255,0.06)] bg-[#0d1117]/80 backdrop-blur-xl sticky top-0 z-50">
      <div className="max-w-[1920px] mx-auto h-full px-5 flex items-center justify-between">
        {/* Left — Brand + Home */}
        <div className="flex items-center gap-3">
          <Link href="/" title="Pagina principală">
            <img src="/logo.png" alt="GG-AI" className="h-11 w-auto object-contain rounded-xl border border-[rgba(100,180,255,0.3)] shadow-[0_0_16px_rgba(59,130,246,0.25),0_0_4px_rgba(139,92,246,0.15)] hover:border-[rgba(100,180,255,0.6)] hover:shadow-[0_0_24px_rgba(59,130,246,0.4),0_0_8px_rgba(139,92,246,0.3)] hover:scale-105 transition-all" />
          </Link>
          <Link
            href="/"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-white hover:bg-white/[0.06] transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            Acasă
          </Link>
        </div>

        {/* Right — Status + Refresh + Avatar */}
        <div className="flex items-center gap-4">
          {/* API Status */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${apiOnline ? "bg-success shadow-[0_0_6px_rgba(52,211,153,0.5)]" : "bg-danger shadow-[0_0_6px_rgba(248,113,113,0.5)]"}`} />
            <span className="text-xs text-text-muted font-medium hidden sm:inline">
              {apiOnline ? "Online" : "Offline"}
            </span>
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-[rgba(255,255,255,0.08)]" />

          {/* Last refresh */}
          <span className="text-[11px] font-mono text-text-muted hidden sm:inline">
            {lastRefresh}
          </span>

          {/* Refresh button */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="btn-ghost !p-2 !rounded-lg group"
            title="Reîncarcă"
          >
            <RefreshCw
              size={15}
              className={`text-text-secondary group-hover:text-primary transition-colors ${isRefreshing ? "animate-spin" : ""}`}
            />
          </button>

          {/* Avatar + Dropdown */}
          {userEmail && (
            <>
              <div className="w-px h-5 bg-[rgba(255,255,255,0.08)]" />
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-violet flex items-center justify-center text-sm font-bold text-white hover:shadow-glow transition-shadow cursor-pointer"
                  title={userEmail}
                >
                  {initials}
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 top-12 w-56 rounded-xl border border-white/[0.08] bg-[#0d1117]/95 backdrop-blur-xl shadow-2xl py-1 z-[100]">
                    {/* User info */}
                    <div className="px-4 py-3 border-b border-white/[0.06]">
                      {userName && <p className="text-sm font-semibold text-white truncate">{userName}</p>}
                      <p className="text-xs text-text-muted truncate">{userEmail}</p>
                    </div>

                    {/* Menu items */}
                    <div className="py-1">
                      <button
                        onClick={() => {
                          setDropdownOpen(false);
                          router.push("/account");
                        }}
                        className="w-full px-4 py-2.5 text-sm text-text-secondary hover:text-white hover:bg-white/5 text-left flex items-center gap-3 transition"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                        Contul meu
                      </button>
                      <button
                        onClick={() => {
                          setDropdownOpen(false);
                          onUpgradePlan?.();
                        }}
                        className="w-full px-4 py-2.5 text-sm text-text-secondary hover:text-white hover:bg-white/5 text-left flex items-center gap-3 transition"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                        Upgrade plan
                      </button>
                      <button
                        onClick={() => {
                          setDropdownOpen(false);
                          router.push("/suport");
                        }}
                        className="w-full px-4 py-2.5 text-sm text-text-secondary hover:text-white hover:bg-white/5 text-left flex items-center gap-3 transition"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        Suport
                      </button>
                    </div>

                    {/* Sign out */}
                    <div className="border-t border-white/[0.06] py-1">
                      <button
                        onClick={() => {
                          setDropdownOpen(false);
                          onSignOut?.();
                        }}
                        className="w-full px-4 py-2.5 text-sm text-danger/80 hover:text-danger hover:bg-danger/5 text-left flex items-center gap-3 transition"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                          <polyline points="16 17 21 12 16 7" />
                          <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        Deconectare
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
