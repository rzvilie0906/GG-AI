import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/auth/session
 * Lightweight cookie refresh — sets the `token` cookie so middleware allows navigation.
 * Called when Firebase restores a session from IndexedDB (e.g., after browser restart).
 * No backend call needed — just ensures the gate cookie exists.
 */
export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const response = NextResponse.json({ status: "ok" });
  response.cookies.set("token", "authenticated", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}
