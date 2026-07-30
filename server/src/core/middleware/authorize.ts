import type { Request, Response, NextFunction } from "express";
import type { Role } from "../../config/auth.js";
import { ROLE_HIERARCHY } from "../../config/auth.js";
import { AppError } from "../utils/AppError.js";

/**
 * Authorization middleware factory.
 * Checks if the authenticated user has one of the specified roles.
 * Uses role hierarchy to allow higher-privilege roles to access lower-privilege endpoints.
 *
 * @example
 * ```ts
 * // Only SUPER_ADMIN and HOSPITAL_ADMIN can access
 * authorize("SUPER_ADMIN", "HOSPITAL_ADMIN")
 *
 * // Any authenticated user can access
 * authorize()
 * ```
 */
export function authorize(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const user = (req as any).user;

      if (!user) {
        throw AppError.unauthorized("Authentication required");
      }

      const userRole = user.role as Role;

      // If no specific roles required, just check authentication
      if (allowedRoles.length === 0) {
        next();
        return;
      }

      // Check if user has the required role (using hierarchy)
      const userLevel = ROLE_HIERARCHY[userRole];
      const hasAccess = allowedRoles.some((role) => {
        const requiredLevel = ROLE_HIERARCHY[role];
        return userLevel >= requiredLevel;
      });

      if (!hasAccess) {
        throw AppError.forbidden(
          `Access denied. Required role(s): ${allowedRoles.join(", ")}`,
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
