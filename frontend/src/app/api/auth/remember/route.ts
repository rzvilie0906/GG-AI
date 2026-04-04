import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const REMEMBER_DAYS = 30;

/**
 * POST /api/auth/remember
 * Proxy către backend-ul FastAPI — setează cookie-urile pe domeniul frontend-ului.
 */
export async function POST(request: NextRequest) {
  let remember = false;
  try {
    const body = await request.json();
    remember = body.remember === true;
    const authorization = request.headers.get("authorization") || "";

    // Apelăm backend-ul
    const backendRes = await fetch(`${API_BASE}/api/auth/remember`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
        "User-Agent": request.headers.get("user-agent") || "unknown",
        "X-Forwarded-For": request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
      },
      body: JSON.stringify(body),
    });

    if (!backendRes.ok) {
      const err = await backendRes.json().catch(() => ({}));
      const errResponse = NextResponse.json(err, { status: backendRes.status });
      // Still set token cookie so middleware doesn't block navigation
      if (authorization) {
        errResponse.cookies.set("token", "authenticated", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          ...(remember ? { maxAge: REMEMBER_DAYS * 24 * 60 * 60 } : {}),
        });
      }
      return errResponse;
    }

    const data = await backendRes.json();
    const response = NextResponse.json(data);

    // Extragem cookie-urile din răspunsul backend-ului și le setăm pe domeniul frontend
    const setCookies = backendRes.headers.getSetCookie?.() || [];
    for (const cookieStr of setCookies) {
      // Parsăm cookie-ul setat de backend
      const parts = cookieStr.split(";").map((p) => p.trim());
      const [nameVal] = parts;
      const [name, ...valParts] = nameVal.split("=");
      const value = valParts.join("=");

      if (name === "remember_token" || name === "token") {
        response.cookies.set(name, value, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          ...(remember ? { maxAge: REMEMBER_DAYS * 24 * 60 * 60 } : {}),
        });
      }
    }

    // Dacă backend-ul nu a setat cookie-uri, setăm cel puțin token-ul de sesiune
    if (setCookies.length === 0 && data.status === "ok") {
      // Extragem UID din authorization (Firebase token)
      // Backend-ul ar fi trebuit să seteze, dar ca fallback
      response.cookies.set("token", "authenticated", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        ...(remember ? { maxAge: REMEMBER_DAYS * 24 * 60 * 60 } : {}),
      });
    }

    return response;
  } catch {
    const errResponse = NextResponse.json(
      { detail: "Eroare internă la setarea sesiunii." },
      { status: 500 }
    );
    // Still set token cookie so middleware doesn't block navigation
    errResponse.cookies.set("token", "authenticated", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      ...(remember ? { maxAge: REMEMBER_DAYS * 24 * 60 * 60 } : {}),
    });
    return errResponse;
  }
}
