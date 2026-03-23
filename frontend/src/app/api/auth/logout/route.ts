import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

/**
 * POST /api/auth/logout
 * Invalidează token-ul de remember pe backend și șterge cookie-urile frontend.
 */
export async function POST(request: NextRequest) {
  try {
    // Transmitem cookie-urile către backend (pentru invalidare token)
    const rememberToken = request.cookies.get("remember_token")?.value;

    const headers: Record<string, string> = {};
    if (rememberToken) {
      headers["Cookie"] = `remember_token=${rememberToken}`;
    }

    await fetch(`${API_BASE}/api/auth/logout`, {
      method: "POST",
      headers,
    }).catch(() => {});

    const response = NextResponse.json({ status: "ok" });
    response.cookies.delete("remember_token");
    response.cookies.delete("token");
    return response;
  } catch {
    // Ștergem cookie-urile oricum
    const response = NextResponse.json({ status: "ok" });
    response.cookies.delete("remember_token");
    response.cookies.delete("token");
    return response;
  }
}
