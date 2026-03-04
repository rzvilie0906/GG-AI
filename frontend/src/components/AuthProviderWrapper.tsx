"use client";

import { AuthProvider } from "@/lib/AuthContext";

export function AuthProviderWrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
