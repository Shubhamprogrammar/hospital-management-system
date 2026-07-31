import { Router } from "express";
import { auth } from "../../config/auth.js";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorize } from "../../core/middleware/authorize.js";
import { catchAsync } from "../../core/utils/catchAsync.js";
import {
  getSessionHandler,
  listUsersHandler,
  createUserHandler,
  listSessionsHandler,
  revokeSessionHandler,
} from "./auth.controller.js";

const authRoutes = Router();

/**
 * Better Auth handler adapter.
 * Converts Express requests to Web Fetch API Requests and vice versa.
 * Handles all Better Auth native routes (sign-in, sign-up, sign-out, session, etc.)
 *
 * Custom routes (/me, /users) are defined separately below and skip this handler.
 */
const BETTER_AUTH_SKIP_PATHS = ["/me", "/users"];

/**
 * Custom routes are defined after the Better Auth catch-all below.
 * Paths that start with these prefixes must fall through to the custom
 * Express handlers (e.g. GET /sessions, DELETE /sessions/:sessionId).
 */
function isCustomAuthPath(path: string): boolean {
  return (
    BETTER_AUTH_SKIP_PATHS.includes(path) ||
    path.startsWith("/sessions")
  );
}

authRoutes.all(
  "*",
  catchAsync(async (req, res, next) => {
    // Skip custom routes that we handle explicitly
    if (isCustomAuthPath(req.path)) {
      return next();
    }

    const protocol = req.protocol;
    const host = req.get("host") ?? "localhost";
    const baseUrl = `${protocol}://${host}`;

    // Convert Express request to Web Fetch API Request
    // Use req.originalUrl (full path) since Better Auth strips basePath internally
    const url = new URL(req.originalUrl, baseUrl);

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) {
        if (Array.isArray(value)) {
          for (const v of value) {
            headers.append(key, v);
          }
        } else if (typeof value === "string") {
          headers.set(key, value);
        }
      }
    }

    let body: BodyInit | null = null;
    if (req.body && Object.keys(req.body).length > 0) {
      body = JSON.stringify(req.body);
      headers.set("content-type", "application/json");
    }

    const webRequest = new Request(url.toString(), {
      method: req.method,
      headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? body : null,
    });

    // Call Better Auth handler (Web Fetch API style)
    const webResponse = await auth.handler(webRequest);

    // Convert Web Fetch API Response back to Express response
    res.status(webResponse.status);

    webResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const responseBody = await webResponse.text();
    if (responseBody) {
      res.send(responseBody);
    } else {
      res.end();
    }
  }),
);

// Custom routes extending Better Auth
authRoutes.get("/me", authMiddleware, getSessionHandler);

// Session management (FRD 4.7 — list & revoke active sessions)
authRoutes.get("/sessions", authMiddleware, listSessionsHandler);
authRoutes.delete("/sessions/:sessionId", authMiddleware, revokeSessionHandler);

// Admin-only routes
authRoutes.get("/users", authMiddleware, authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"), listUsersHandler);
authRoutes.post("/users", authMiddleware, authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"), createUserHandler);

export { authRoutes };
