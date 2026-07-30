import type { Request, Response, NextFunction } from "express";
import { auth } from "../../config/auth.js";
import { AppError } from "../utils/AppError.js";

/**
 * Express middleware that verifies the user's session using Better Auth.
 * Attaches the authenticated user and session to the request.
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
      throw AppError.unauthorized("Authentication required");
    }

    // Attach session to request for downstream use
    (req as any).session = session;
    (req as any).user = session.user;

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      next(AppError.unauthorized("Invalid or expired session"));
    }
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
