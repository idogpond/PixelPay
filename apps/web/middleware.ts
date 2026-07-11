import { NextRequest, NextResponse } from 'next/server';

const PROTECTED_PATHS = ['/wallet', '/orders', '/profile', '/affiliate'];
const AUTH_PATHS = ['/login', '/register', '/forgot-password'];
const ADMIN_PATHS = ['/admin'];

// UX-level check only — the API's RolesGuard is the real enforcement.
function jwtRole(token: string): string | null {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)).role ?? null;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const token = req.cookies.get('pixelpay-token')?.value;
  const { pathname } = req.nextUrl;

  const isAuthPage = AUTH_PATHS.some((p) => pathname.startsWith(p));
  const isAdmin = ADMIN_PATHS.some((p) => pathname.startsWith(p));
  const isProtected = isAdmin || PROTECTED_PATHS.some((p) => pathname.startsWith(p));

  if (!token && isProtected) {
    const url = new URL('/login', req.url);
    url.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(url);
  }

  if (token && isAuthPage) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  if (token && isAdmin && jwtRole(token) !== 'ADMIN') {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  // `.*\\..*` skips public assets (logo.png etc.) — anything with a file extension
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
