import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE_NAMES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

const PUBLIC_ONLY_ROUTES = ["/login", "/register"];

// All portal routes from nav-items — keep in sync with NAV_GROUPS.
const PORTAL_ROUTES = [
  "/dashboard",
  "/patients",
  "/appointments",
  "/opd",
  "/doctors",
  "/departments",
  "/ipd",
  "/wards",
  "/beds",
  "/prescriptions",
  "/laboratory",
  "/pharmacy",
  "/inventory",
  "/billing",
  "/payments",
  "/ambulance",
  "/reports",
  "/chat",
  "/users",
  "/roles",
  "/audit",
  "/settings",
];

/**
 * Optimistic, cookie-presence-only redirect (can't verify the session without an API
 * round-trip from the edge). The real enforcement is the client-side guard in
 * app/(portal)/layout.tsx, which checks the actual session via useSession().
 */
export function proxy(request: NextRequest) {
  const hasSessionCookie = SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));
  const { pathname } = request.nextUrl;

  if (!hasSessionCookie && PORTAL_ROUTES.some((route) => pathname.startsWith(route))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (hasSessionCookie && PUBLIC_ONLY_ROUTES.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/patients/:path*",
    "/appointments/:path*",
    "/opd/:path*",
    "/doctors/:path*",
    "/departments/:path*",
    "/ipd/:path*",
    "/wards/:path*",
    "/beds/:path*",
    "/prescriptions/:path*",
    "/laboratory/:path*",
    "/pharmacy/:path*",
    "/inventory/:path*",
    "/billing/:path*",
    "/payments/:path*",
    "/ambulance/:path*",
    "/reports/:path*",
    "/chat/:path*",
    "/users/:path*",
    "/roles/:path*",
    "/audit/:path*",
    "/settings/:path*",
    "/login",
    "/register",
  ],
};
