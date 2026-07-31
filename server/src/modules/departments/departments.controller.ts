import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess } from "../../core/utils/apiResponse.js";
import { writeAuditLog } from "../../core/utils/audit.js";
import { emitToRoom } from "../../core/utils/socket.js";
import {
  createDepartment,
  listDepartments,
  getDepartmentDetail,
  updateDepartment,
  deactivateDepartment,
  listDepartmentDoctors,
} from "./departments.service.js";

export const createDepartmentHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const department = await createDepartment(req.body);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "CREATE",
      module: "departments",
      entityType: "Department",
      entityId: department.id,
      after: { name: department.name, code: department.code },
    },
    req,
  );
  emitToRoom("admins", "departments:updated", { id: department.id });
  sendSuccess(res, department, 201);
});

export const listDepartmentsHandler = catchAsync(async (_req: Request, res: Response) => {
  const departments = await listDepartments();
  sendSuccess(res, departments);
});

export const getDepartmentHandler = catchAsync(async (req: Request, res: Response) => {
  const department = await getDepartmentDetail(req.params.id);
  sendSuccess(res, department);
});

export const updateDepartmentHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const department = await updateDepartment(req.params.id, req.body);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "UPDATE",
      module: "departments",
      entityType: "Department",
      entityId: req.params.id,
      after: req.body,
    },
    req,
  );
  emitToRoom("admins", "departments:updated", { id: department.id });
  sendSuccess(res, department);
});

export const deactivateDepartmentHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const department = await deactivateDepartment(req.params.id);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "DEACTIVATE",
      module: "departments",
      entityType: "Department",
      entityId: req.params.id,
      after: { isActive: false },
    },
    req,
  );
  emitToRoom("admins", "departments:updated", { id: department.id });
  sendSuccess(res, department);
});

export const listDepartmentDoctorsHandler = catchAsync(async (req: Request, res: Response) => {
  const doctors = await listDepartmentDoctors(req.params.id);
  sendSuccess(res, doctors);
});
