import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Minimal fetch Response-like object for stubbing `global.fetch`. */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
    text: async () => JSON.stringify(body),
    clone() {
      return this;
    },
  } as unknown as Response;
}

const fetchMock = vi.fn();

describe("auth client", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    // Must be stubbed BEFORE the auth-client module is imported: better-auth
    // captures the global `fetch` reference when it initializes the client.
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("does not throw at module load and requests an absolute same-origin base URL", async () => {
    // Regression: passing a relative `baseURL` (e.g. "/api/v1/auth") made
    // better-auth's client throw "Invalid base URL: ... Please provide a valid
    // base URL." at module evaluation. We now pass `basePath`, which is
    // resolved against window.location.origin, so requests must target an
    // absolute http(s) URL ending in the auth mount path.
    fetchMock.mockResolvedValueOnce(jsonResponse({ session: null, user: null }));

    const { authClient } = await import("@/shared/lib/auth-client");
    await authClient.getSession();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0];
    // Must hit the app's own origin (jsdom: http://localhost:3000) — not a
    // cross-origin API host, or session cookies would never be first-party.
    expect(String(url)).toMatch(/^https?:\/\/localhost:\d+\/api\/v1\/auth\/get-session$/);
  });
});
