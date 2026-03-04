import type { Metadata } from "next";
import "./globals.css";
import { AuthProviderWrapper } from "@/components/AuthProviderWrapper";

export const metadata: Metadata = {
  title: "GG-AI — Analizator AI de Pariuri Sportive",
  description: "AI-powered sports betting analysis. Daily value picks, smart tickets, and confidence scoring.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro" className="dark">
      <body className="min-h-screen antialiased font-ui">
        <AuthProviderWrapper>{children}</AuthProviderWrapper>
      </body>
    </html>
  );
}
