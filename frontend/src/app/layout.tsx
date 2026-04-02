import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

import { AuthProviderWrapper } from "@/components/AuthProviderWrapper";
import MaintenanceWarning from "@/components/MaintenanceWarning";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "GG-AI — Analizator AI de Pariuri Sportive",
  description: "AI-powered sports betting analysis. Daily value picks, smart tickets, and confidence scoring.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen antialiased font-ui">
        <MaintenanceWarning />
        <AuthProviderWrapper>{children}</AuthProviderWrapper>
      </body>
    </html>
  );
}
