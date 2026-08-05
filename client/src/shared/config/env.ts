const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:8080";

/**
 * All browser-side API calls target the app's own origin ("same-origin").
 * next.config.ts rewrites /api/v1/* to the real backend host
 * (NEXT_PUBLIC_API_URL), so:
 *  - session cookies from Better Auth are first-party on the app's domain, and
 *  - the auth proxy (src/proxy.ts) can see them when protecting routes.
 * This is what makes login survive a Vercel (frontend) + separate API host split.
 */
// NOTE: do NOT set NEXT_PUBLIC_BETTER_AUTH_URL / BETTER_AUTH_URL in the client
// build — better-auth prefers those env vars over window.location.origin, which
// would send auth requests back to a cross-origin host and reintroduce the
// login loop this same-origin setup fixes.
export const env = {
  API_URL: "/api/v1",
  /** Better Auth mount path — resolved against window.location.origin at runtime. */
  AUTH_PATH: "/api/v1/auth",
  SOCKET_URL,
};
