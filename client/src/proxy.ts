import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1";

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
  "/ai-prescriptions",
  "/laboratory",
  "/pharmacy",
  "/inventory",
  "/billing",
  "/payments",
  "/ambulance",
  "/reports",
  "/chat",
  "/patient-chat",
  "/chatbot",
  "/notifications",
  "/users",
  "/roles",
  "/audit",
  "/settings",
];

/**
 * Validates the session cookie against the backend's get-session endpoint.
 * This is the real session check — cookie *presence* alone is not enough,
 * because a stale/expired cookie would otherwise cause a redirect loop
 * between /dashboard (portal guard) and /login (proxy bounce-back).
 */
async function hasValidSession(request: NextRequest): Promise<boolean> {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return false;
  try {
    const res = await fetch(`${API_URL}/auth/get-session`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    // 5xx = backend unreachable / broken, NOT an invalid session. Treat it the
    // same as the network-error catch below: keep the user logged in and let
    // the client decide, instead of logging them out during an outage.
    if (res.status >= 500) return true;
    if (!res.ok) return false;
    const body = await res.json();
    return Boolean(body?.session);
  } catch {
    // Backend unreachable — don't lock users out; let the client decide.
    return true;
  }
}

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", request.nextUrl.pathname);
  const response = NextResponse.redirect(url);
  for (const name of SESSION_COOKIE_NAMES) {
    response.cookies.set(name, "", { path: "/", maxAge: 0, expires: new Date(0) });
  }
  return response;
}

/**
 * Auth-aware proxy:
 * - Portal routes require a *valid* session; stale cookies are cleared and the
 *   user is sent to /login (no redirect loop).
 * - /login and /register allow signed-out users; signed-in users are bounced to
 *   /dashboard.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCookie = SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));
  const isPortal = PORTAL_ROUTES.some((route) => pathname.startsWith(route));
  const isPublicOnly = PUBLIC_ONLY_ROUTES.includes(pathname);

  if (isPortal) {
    if (!hasCookie) return redirectToLogin(request);
    const valid = await hasValidSession(request);
    if (!valid) return redirectToLogin(request);
    return NextResponse.next();
  }

  if (isPublicOnly) {
    if (!hasCookie) return NextResponse.next();
    const valid = await hasValidSession(request);
    if (!valid) {
      // Stale cookie on a public page — clear it and let the login page render.
      const response = NextResponse.next();
      for (const name of SESSION_COOKIE_NAMES) {
        response.cookies.set(name, "", { path: "/", maxAge: 0, expires: new Date(0) });
      }
      return response;
    }
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
    "/ai-prescriptions/:path*",
    "/laboratory/:path*",
    "/pharmacy/:path*",
    "/inventory/:path*",
    "/billing/:path*",
    "/payments/:path*",
    "/ambulance/:path*",
    "/reports/:path*",
    "/chat/:path*",
    "/patient-chat/:path*",
    "/chatbot/:path*",
    "/notifications/:path*",
    "/users/:path*",
    "/roles/:path*",
    "/audit/:path*",
    "/settings/:path*",
    "/login",
    "/register",
  ],
};
