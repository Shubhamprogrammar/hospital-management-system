import type { Request, Response } from "express";
import {
  listUsers,
  createUser,
  listSessions,
  revokeSession,
} from "./auth.service.js";
import { sendSuccess } from "../../core/utils/apiResponse.js";
import { AppError } from "../../core/errors/AppError.js";
import { ROLES } from "../../config/auth.js";
import type { Role } from "../../config/auth.js";
import { catchAsync } from "../../core/utils/catchAsync.js";

/**
 * GET /auth/me
 * Returns the current authenticated user's session.
 *
 * The session is attached by `authMiddleware` and reused here — calling
 * `auth.api.getSession()` again would double the session-validation DB queries
 * on every request.
 */
export const getSessionHandler = catchAsync(
  async (req: Request, res: Response) => {
    const session = (req as any).session;

    if (!session) {
      throw AppError.unauthorized("No active session");
    }

    sendSuccess(res, session);
  },
);

/**
 * GET /auth/users
 * Lists all users (admin only).
 */
export const listUsersHandler = catchAsync(
  async (req: Request, res: Response) => {
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 20;

    const result = await listUsers(
      req.headers as Record<string, string>,
      { page, limit },
    );

    sendSuccess(res, result.users, 200, {
      pagination: {
        page,
        limit,
        totalItems: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  },
);

/**
 * POST /auth/users
 * Creates a new user with a specific role (admin only).
 * Body: { name, email, password, role, phone? }
 */
export const createUserHandler = catchAsync(
  async (req: Request, res: Response) => {
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
      ROLES.WARD_BOY,
    ];

    // SUPER_ADMIN can create any role; HOSPITAL_ADMIN can only create staff roles
    const allowedRoles: Role[] =
      callerRole === ROLES.SUPER_ADMIN
        ? [...adminRoles, ...staffRoles]
        : staffRoles;

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
  },
);

/**
 * GET /auth/sessions
 * Lists all active sessions for the current user (FRD 4.7-09).
 */
export const listSessionsHandler = catchAsync(
  async (req: Request, res: Response) => {
    const sessions = await listSessions(
      req.headers as Record<string, string>,
    );
    sendSuccess(res, sessions);
  },
);

/**
 * DELETE /auth/sessions/:sessionId
 * Revokes a specific session (FRD 4.7-10).
 */
export const revokeSessionHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await revokeSession(
      req.headers as Record<string, string>,
      req.params.sessionId,
    );
    sendSuccess(res, { revoked: true, sessionId: req.params.sessionId });
  },
);
