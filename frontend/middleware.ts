import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// List of protected routes (add more as needed)
const protectedPaths = ['/dashboard', '/account'];

export function middleware(request: NextRequest) {
  // Example: check for a cookie named "token" (adjust if you use a different cookie or session method)
  const token = request.cookies.get('token')?.value;

  // Check if the current path is protected
  if (protectedPaths.some((path) => request.nextUrl.pathname.startsWith(path))) {
    if (!token) {
      // Redirect to sign-in page if not authenticated
      const signInUrl = new URL('/auth/signin', request.url);
      return NextResponse.redirect(signInUrl);
    }
  }

  // Allow request to proceed
  return NextResponse.next();
}

// Specify which paths to run the middleware on
export const config = {
  matcher: ['/dashboard/:path*', '/account/:path*'],
};
