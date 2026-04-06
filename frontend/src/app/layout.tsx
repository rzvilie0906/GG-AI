import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

import Script from "next/script";

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
  metadataBase: new URL("https://ggai.bet"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "ro_RO",
    url: "https://ggai.bet",
    siteName: "GG-AI",
    title: "GG-AI — Analize AI Zilnice pentru Pariuri Sportive",
    description: "GG-AI (GGAI) — analize AI zilnice pentru pariuri sportive. 4 bilete zilnice din fotbal, baschet, hochei, tenis și baseball cu scoruri de încredere.",
    images: [
      {
        url: "/logo.png",
        width: 778,
        height: 622,
        alt: "GG-AI Logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "GG-AI — Analize AI Zilnice pentru Pariuri Sportive",
    description: "GG-AI (GGAI) — analize AI zilnice pentru pariuri sportive. 4 bilete zilnice din fotbal, baschet, hochei, tenis și baseball.",
    images: ["/logo.png"],
  },
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
      <head>
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        <link rel="preconnect" href="https://www.googletagmanager.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen antialiased font-ui">
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-VQCCBP2FPG"
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-VQCCBP2FPG');
          `}
        </Script>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <MaintenanceWarning />
        <AuthProviderWrapper>{children}</AuthProviderWrapper>
        <LazyCookieConsent />
        <noscript>
          <div style={{ padding: "40px 20px", maxWidth: 800, margin: "0 auto", color: "#e2e8f0" }}>
            <h1>GG-AI — Analize AI Zilnice pentru Pariuri Sportive</h1>
            <p>GG-AI (GGAI) este o platformă de analize AI zilnice pentru pariuri sportive. Primești zilnic 4 bilete cu valoare din fotbal, baschet, hochei, tenis și baseball — cu scoruri de încredere și sfaturi AI.</p>
            <h2>De ce să alegi GG-AI?</h2>
            <p>Analiză AI Avansată cu GPT-4o — analizăm fiecare meci cu date live: formă, H2H, accidentări, cote. 4 bilete zilnice generate automat: mixt, fotbal, baschet și hochei. Cote calculate matematic, analizor de risc bilet, actualizări zilnice la 09:00 și acoperire pe 5 sporturi.</p>
            <h2>Cum Funcționează</h2>
            <p>Zilnic la 09:00 motorul nostru AI preia meciurile și cotele. La 10:00 primești 4 bilete zilnice cu meciuri selectate. Construiești biletul tău personal cu scor de încredere AI.</p>
            <h2>Prețuri și Planuri</h2>
            <p>Alege planul potrivit pentru tine. Plăți securizate prin Stripe, PCI DSS Level 1. Anulare instant, fără penalități.</p>
            <p>Pariurile implică risc financiar. Pariază responsabil. 18+.</p>
            <p><a href="https://ggai.bet/pricing">Vezi Planurile</a> · <a href="https://ggai.bet/suport">Suport</a> · <a href="https://ggai.bet/confidentialitate">Confidențialitate</a> · <a href="https://ggai.bet/termeni">Termeni</a> · <a href="https://ggai.bet/joc-responsabil">Joc Responsabil</a></p>
          </div>
        </noscript>
      </body>
    </html>
  );
}
