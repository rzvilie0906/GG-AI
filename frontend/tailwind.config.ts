import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        deep: "#07090f",
        surface: {
          DEFAULT: "#0d1117",
          card: "#131921",
          elevated: "#1a2233",
        },
        primary: {
          DEFAULT: "#6366f1",
          hover: "#818cf8",
          soft: "rgba(99, 102, 241, 0.12)",
        },
        accent: {
          DEFAULT: "#22d3ee",
          soft: "rgba(34, 211, 238, 0.12)",
        },
        violet: {
          DEFAULT: "#8b5cf6",
          soft: "rgba(139, 92, 246, 0.12)",
        },
        success: "#34d399",
        danger: "#f87171",
        warning: "#fbbf24",
        live: "#f43f5e",
        "text-main": "#e8edf5",
        "text-secondary": "#94a3b8",
        "text-muted": "#475569",
        border: {
          DEFAULT: "rgba(255, 255, 255, 0.06)",
          hover: "rgba(255, 255, 255, 0.12)",
          accent: "rgba(99, 102, 241, 0.25)",
        },
      },
      fontFamily: {
        ui: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "20px",
      },
      boxShadow: {
        sm: "0 1px 3px rgba(0,0,0,0.3)",
        md: "0 4px 14px rgba(0,0,0,0.4)",
        lg: "0 8px 32px rgba(0,0,0,0.5)",
        glow: "0 0 30px -8px rgba(99,102,241,0.25)",
        "glow-lg": "0 0 50px -10px rgba(99,102,241,0.35)",
      },
      animation: {
        shimmer: "shimmer 1.8s ease-in-out infinite",
        "spin-fast": "spin 0.7s linear infinite",
        "pulse-soft": "pulse-soft 1.5s ease-in-out infinite",
        "fade-in": "fade-in 0.3s ease-out forwards",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 8px rgba(99,102,241,0.2)" },
          "50%": { boxShadow: "0 0 20px rgba(99,102,241,0.4)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
