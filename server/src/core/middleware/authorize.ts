import type { Request, Response, NextFunction } from "express";
import { ROLES, type Role } from "../../config/auth.js";
import { AppError } from "../errors/AppError.js";
import { catchAsync } from "../utils/catchAsync.js";

/**
 * Roles that can always access any endpoint (explicit override, not "top of a
 * shared numeric scale"). HOSPITAL_ADMIN is deliberately included alongside
 * SUPER_ADMIN to preserve the admin privileges that were previously granted by
 * the hierarchy floor logic.
 */
const ALWAYS_ALLOWED: Role[] = [ROLES.SUPER_ADMIN, ROLES.HOSPITAL_ADMIN];

/**
 * Authorization middleware factory.
 * Direct role set-membership check: the user's role must be listed in
 * `allowedRoles` (or be an always-allowed admin role). This deliberately does
 * NOT use numeric hierarchy floors — sharing a floor number between unrelated
 * department roles (e.g. LAB_TECHNICIAN/PHARMACIST/BILLING_STAFF all = 40)
 * previously let lateral roles reach each other's endpoints (RBAC audit #1).
 *
 * @example
 * ```ts
 * // Only PHARMACIST (plus admins) — NOT nurses/doctors/billing staff
 * authorize("PHARMACIST")
 *
 * // Any authenticated user can access
 * authorize()
 * ```
 */
export function authorize(...allowedRoles: Role[]) {
  return catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
    const user = (req as any).user;

    if (!user) {
      throw AppError.unauthorized("Authentication required");
    }

    // If no specific roles required, just check authentication
    if (allowedRoles.length === 0) {
      return next();
    }

    const userRole = user.role as Role;

    // Explicit admin override
    if (ALWAYS_ALLOWED.includes(userRole)) {
      return next();
    }

    // Direct set-membership — no hierarchy floors
    if (!allowedRoles.includes(userRole)) {
      throw AppError.forbidden(
        `Access denied. Required role(s): ${allowedRoles.join(", ")}`,
      );
    }

    next();
  });
}
