import type { Request, Response, NextFunction } from "express";
import { getSession, listUsers, createUser } from "./auth.service.js";
import { sendSuccess } from "../../core/utils/apiResponse.js";
import { AppError } from "../../core/utils/AppError.js";
import { ROLES } from "../../config/auth.js";
import type { Role } from "../../config/auth.js";

/**
 * GET /auth/me
 * Returns the current authenticated user's session.
 */
export async function getSessionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const session = await getSession(
      req.headers as Record<string, string>,
    );

    if (!session) {
      throw AppError.unauthorized("No active session");
    }

    sendSuccess(res, session);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /auth/users
 * Lists all users (admin only).
 */
export async function listUsersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 20;

    const result = await listUsers(
      req.headers as Record<string, string>,
      { page, limit },
    );

    sendSuccess(res, result.users, 200, {
      meta: { total: result.total, page, limit },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /auth/users
 * Creates a new user with a specific role (admin only).
 * Body: { name, email, password, role, phone? }
 */
export async function createUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { name, email, password, role, phone } = req.body;

    // Validate required fields
    if (!name || !email || !password || !role) {
      throw AppError.badRequest("name, email, password, and role are required");
    }

    // Validate role based on authenticated user's privileges
    const callerRole = (req as any).user?.role as Role;

    const adminRoles: Role[] = [ROLES.SUPER_ADMIN, ROLES.HOSPITAL_ADMIN];
    const staffRoles: Role[] = [
      ROLES.DOCTOR,
      ROLES.NURSE,
      ROLES.LAB_TECHNICIAN,
      ROLES.PHARMACIST,
      ROLES.ACCOUNTANT,
      ROLES.RECEPTIONIST,
    ];

    // SUPER_ADMIN can create any role; HOSPITAL_ADMIN can only create staff roles
    let allowedRoles: Role[];
    if (callerRole === ROLES.SUPER_ADMIN) {
      allowedRoles = [...adminRoles, ...staffRoles];
    } else {
      allowedRoles = staffRoles;
    }

    if (!allowedRoles.includes(role)) {
      throw AppError.forbidden(
        `You can only create users with roles: ${allowedRoles.join(", ")}`,
      );
    }

    const result = await createUser(
      req.headers as Record<string, string>,
      { name, email, password, role, phone },
    );

    sendSuccess(res, result.user, 201, {
      message: `User created with role: ${role}`,
    });
  } catch (error) {
    next(error);
  }
}
