import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess } from "../../core/utils/apiResponse.js";
import { writeAuditLog } from "../../core/utils/audit.js";
import {
  createRole,
  listRoles,
  getRoleDetail,
  updateRole,
  deleteRole,
  listPermissions,
} from "./roles.service.js";

export const listPermissionsHandler = catchAsync(async (_req: Request, res: Response) => {
  const permissions = await listPermissions();
  sendSuccess(res, permissions);
});

export const createRoleHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const role = await createRole(req.body);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "CREATE",
      module: "roles",
      entityType: "Role",
      entityId: role.id,
      after: { name: role.name },
    },
    req,
  );
  sendSuccess(res, role, 201);
});

export const listRolesHandler = catchAsync(async (_req: Request, res: Response) => {
  const roles = await listRoles();
  sendSuccess(res, roles);
});

export const getRoleHandler = catchAsync(async (req: Request, res: Response) => {
  const role = await getRoleDetail(req.params.id);
  sendSuccess(res, role);
});

export const updateRoleHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const before = await getRoleDetail(req.params.id);
  const role = await updateRole(req.params.id, req.body);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "UPDATE",
      module: "roles",
      entityType: "Role",
      entityId: req.params.id,
      before: { name: before.name, permissions: before.rolePermissions.map((rp) => rp.permission.key) },
      after: { name: role.name, permissionKeys: req.body.permissionKeys },
    },
    req,
  );
  sendSuccess(res, role);
});

export const deleteRoleHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const role = await deleteRole(req.params.id);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "DELETE",
      module: "roles",
      entityType: "Role",
      entityId: req.params.id,
      after: { name: role.name },
    },
    req,
  );
  sendSuccess(res, { id: role.id, deleted: true });
});
