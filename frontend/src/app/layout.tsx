import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

import { AuthProviderWrapper } from "@/components/AuthProviderWrapper";
import MaintenanceWarning from "@/components/MaintenanceWarning";
import LazyCookieConsent from "@/components/LazyCookieConsent";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "GG-AI — Analize AI Zilnice pentru Pariuri Sportive | GGAI",
  description: "GG-AI (GGAI) — analize AI zilnice pentru pariuri sportive. 4 bilete zilnice din fotbal, baschet, hochei, tenis și baseball cu scoruri de încredere.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "name": "GG-AI",
        "alternateName": "GGAI",
        "url": "https://ggai.bet",
        "logo": "https://ggai.bet/logo.png",
        "description": "Analize AI zilnice pentru pariuri sportive — fotbal, baschet, hochei, tenis și baseball.",
        "sameAs": [],
      },
      {
        "@type": "WebSite",
        "name": "GG-AI",
        "alternateName": "GGAI",
        "url": "https://ggai.bet",
      },
      {
        "@type": "WebPage",
        "@id": "https://ggai.bet/#webpage",
        "url": "https://ggai.bet",
        "name": "GG-AI — Analize AI Zilnice pentru Pariuri Sportive",
        "description": "GG-AI (GGAI) — analize AI zilnice pentru pariuri sportive. 4 bilete zilnice din fotbal, baschet, hochei, tenis și baseball cu scoruri de încredere.",
        "isPartOf": { "@id": "https://ggai.bet/#website" },
        "inLanguage": "ro",
      },
    ],
  };

  return (
    <html lang="ro" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen antialiased font-ui">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <MaintenanceWarning />
        <AuthProviderWrapper>{children}</AuthProviderWrapper>
        <LazyCookieConsent />
      </body>
    </html>
  );
}
