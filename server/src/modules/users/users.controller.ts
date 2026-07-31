import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess, sendPaginated } from "../../core/utils/apiResponse.js";
import { parsePagination, buildPaginationMeta } from "../../core/utils/pagination.js";
import { AppError } from "../../core/errors/AppError.js";
import { writeAuditLog } from "../../core/utils/audit.js";
import {
  createUser,
  listUsers,
  getUserDetail,
  updateUser,
  deactivateUser,
  updateOwnProfile,
} from "./users.service.js";

export const createUserHandler = catchAsync(async (req: Request, res: Response) => {
  const { name, email, phone, role, departmentId } = req.body;
  if (!name || !email || !role) {
    throw new AppError("name, email, and role are required", 400, undefined, "VALIDATION_ERROR");
  }

  const actor = (req as any).user;
  const result = await createUser({ name, email, phone, role, departmentId });

  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "CREATE",
      module: "users",
      entityType: "User",
      entityId: result.user.id,
      after: { name, email, role },
    },
    req,
  );

  sendSuccess(res, { ...result.user, status: "PENDING_ACTIVATION" }, 201);
});

export const listUsersHandler = catchAsync(async (req: Request, res: Response) => {
  const pagination = parsePagination(req.query.page, req.query.limit);
  const result = await listUsers({
    ...pagination,
    search: req.query.search as string | undefined,
    role: req.query.role as string | undefined,
    status: req.query.status as string | undefined,
    sortBy: req.query.sortBy as string | undefined,
    sortOrder: (req.query.sortOrder as "asc" | "desc" | undefined) ?? "desc",
  });

  sendPaginated(res, result.users, buildPaginationMeta(result.total, pagination));
});

export const getUserHandler = catchAsync(async (req: Request, res: Response) => {
  const user = await getUserDetail(req.params.id);
  sendSuccess(res, user);
});

export const updateUserHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const before = await getUserDetail(req.params.id);
  const user = await updateUser(req.params.id, req.body);

  if (before.role !== user.role) {
    writeAuditLog(
      {
        actorId: actor?.id,
        actorRole: actor?.role,
        action: "ROLE_CHANGE",
        module: "users",
        entityType: "User",
        entityId: req.params.id,
        before: { role: before.role },
        after: { role: user.role },
      },
      req,
    );
  }

  sendSuccess(res, user);
});

export const deactivateUserHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  if (actor?.id === req.params.id) {
    throw new AppError(
      "You cannot deactivate yourself",
      400,
      undefined,
      "ERR_CANNOT_DEACTIVATE_SELF",
    );
  }

  const user = await deactivateUser(req.params.id);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "DEACTIVATE",
      module: "users",
      entityType: "User",
      entityId: req.params.id,
      after: { isActive: false },
    },
    req,
  );
  sendSuccess(res, user);
});

export const getMeHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const me = await getUserDetail(actor.id);
  sendSuccess(res, me);
});

export const updateMeHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const { name, phone } = req.body;
  if (req.body.role) {
    throw new AppError("You cannot change your own role", 400, undefined, "FORBIDDEN");
  }
  const user = await updateOwnProfile(actor.id, { name, phone });
  sendSuccess(res, user);
});

export const uploadAvatarHandler = catchAsync(async (req: Request, res: Response) => {
  // FR 5.7-06 — avatar upload to S3; delegates to uploads module
  throw new AppError(
    "Avatar upload requires S3 configuration — use POST /api/v1/uploads/presign with context AVATAR",
    501,
    undefined,
    "DEPENDENCY_FAILURE",
  );
});

export const bulkImportUsersHandler = catchAsync(async (req: Request, res: Response) => {
  // FR 5.7-07 — CSV bulk import; processed asynchronously via process-bulk-import job
  throw new AppError(
    "Bulk import requires a CSV file upload endpoint (S3-backed) — wiring the process-bulk-import job",
    501,
    undefined,
    "DEPENDENCY_FAILURE",
  );
});
