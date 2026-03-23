import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Rute protejate \u2014 necesit\u0103 autentificare
const protectedPaths = ['/dashboard', '/account'];

export function middleware(request: NextRequest) {
  // Verific\u0103m cookie-ul \"token\" setat de backend (HttpOnly, Secure)
  const token = request.cookies.get('token')?.value;

  if (protectedPaths.some((path) => request.nextUrl.pathname.startsWith(path))) {
    if (!token) {
      const signInUrl = new URL('/auth/signin', request.url);
      signInUrl.searchParams.set('redirect', request.nextUrl.pathname);
      return NextResponse.redirect(signInUrl);
    }
  }

  return NextResponse.next();
}

// Specific\u0103m ce c\u0103i s\u0103 fie procesate de middleware
export const config = {
  matcher: ['/dashboard/:path*', '/account/:path*'],
};
