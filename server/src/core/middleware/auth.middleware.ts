import type { Request, Response, NextFunction } from "express";
import { auth } from "../../config/auth.js";
import { AppError } from "../errors/AppError.js";

/**
 * Express middleware that verifies the user's session using Better Auth.
 * Attaches the authenticated user and session to the request.
 *
 * Better Auth contract: getSession returns `null` when the session is genuinely
 * invalid/expired, and only throws when the underlying DB lookup fails. So:
 *  - null   -> 401 (user must log in again)
 *  - thrown -> 503 (DB problem, NOT a bad session — a 401 here would wrongly
 *              log out a still-valid user and mask an outage as a login issue)
 */
export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: req.headers as Record<string, string>,
    });

    if (!session) {
      next(AppError.unauthorized("Authentication required"));
      return;
    }

    // Attach session to request for downstream use
    (req as any).session = session;
    (req as any).user = session.user;

    next();
  } catch {
    next(AppError.serviceUnavailable("Session service unavailable"));
  }
}

/**
 * Express middleware that optionally attaches the user session if authenticated,
 * but does not reject unauthenticated requests.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: req.headers as Record<string, string>,
    });

    if (session) {
      (req as any).session = session;
      (req as any).user = session.user;
    }
  } catch {
    // Ignore errors - this is optional auth
  }

  next();
}
