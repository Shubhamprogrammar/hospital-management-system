import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess, sendPaginated } from "../../core/utils/apiResponse.js";
import { parsePagination, buildPaginationMeta } from "../../core/utils/pagination.js";
import { AppError } from "../../core/errors/AppError.js";
import { writeAuditLog } from "../../core/utils/audit.js";
import { emitToRoom } from "../../core/utils/socket.js";
import { ROLES } from "../../config/auth.js";
import {
  assertDoctorOwnsProfile,
  createDoctor,
  getDoctorByUserId,
  listDoctors,
  getDoctorDetail,
  updateDoctor,
  setAvailability,
  markLeave,
  getAvailableSlots,
  deactivateDoctor,
} from "./doctors.service.js";

export const createDoctorHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;

  // Self-registration: a DOCTOR can only create their own profile — the
  // userId in the body is ignored and pinned to the authenticated user.
  const body: Record<string, unknown> = { ...req.body };
  if (actor.role === ROLES.DOCTOR) {
    body.userId = actor.id;
  } else if (!body.userId) {
    throw new AppError("userId is required", 400, undefined, "VALIDATION_ERROR");
  }

  const doctor = await createDoctor(body as Parameters<typeof createDoctor>[0]);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "CREATE",
      module: "doctors",
      entityType: "Doctor",
      entityId: doctor.id,
      after: { registrationNo: doctor.registrationNo, specialization: doctor.specialization },
    },
    req,
  );
  sendSuccess(res, doctor, 201);
});

export const getMeHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const doctor = await getDoctorByUserId(actor.id);
  sendSuccess(res, doctor ?? null);
});

export const listDoctorsHandler = catchAsync(async (req: Request, res: Response) => {
  const pagination = parsePagination(req.query.page, req.query.limit);
  const result = await listDoctors({
    ...pagination,
    departmentId: req.query.departmentId as string | undefined,
    specialization: req.query.specialization as string | undefined,
    search: req.query.search as string | undefined,
    availableToday: req.query.availableToday === "true",
  });
  sendPaginated(res, result.doctors, buildPaginationMeta(result.total, pagination));
});

export const getDoctorHandler = catchAsync(async (req: Request, res: Response) => {
  const doctor = await getDoctorDetail(req.params.id);
  sendSuccess(res, doctor);
});

export const updateDoctorHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  await assertDoctorOwnsProfile(actor, req.params.id);

  // A doctor can edit their own professional details but cannot self-deactivate.
  const body: Record<string, unknown> = { ...req.body };
  if (actor.role === ROLES.DOCTOR) delete body.isActive;

  const doctor = await updateDoctor(req.params.id, body as Parameters<typeof updateDoctor>[1]);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "UPDATE",
      module: "doctors",
      entityType: "Doctor",
      entityId: req.params.id,
      after: body,
    },
    req,
  );
  sendSuccess(res, doctor);
});

export const setAvailabilityHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  await assertDoctorOwnsProfile(actor, req.params.id);
  const { slots } = req.body;
  if (!Array.isArray(slots) || slots.length === 0) {
    throw new AppError("slots array is required", 400, undefined, "VALIDATION_ERROR");
  }
  const doctor = await setAvailability(req.params.id, slots);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "AVAILABILITY_SET",
      module: "doctors",
      entityType: "Doctor",
      entityId: req.params.id,
      after: { slots },
    },
    req,
  );
  emitToRoom(`dept-queue:${doctor.departmentId}`, "doctors:availability-updated", { doctorId: req.params.id });
  sendSuccess(res, { doctorId: req.params.id, slots });
});

export const markLeaveHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  await assertDoctorOwnsProfile(actor, req.params.id);
  const leave = await markLeave(req.params.id, req.body);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "LEAVE_MARKED",
      module: "doctors",
      entityType: "Doctor",
      entityId: req.params.id,
      after: { startDate: req.body.startDate, endDate: req.body.endDate },
    },
    req,
  );
  sendSuccess(res, leave, 201);
});

export const getSlotsHandler = catchAsync(async (req: Request, res: Response) => {
  const date = req.query.date as string | undefined;
  if (!date) throw new AppError("date query param is required (YYYY-MM-DD)", 400, undefined, "VALIDATION_ERROR");
  const slots = await getAvailableSlots(req.params.id, date);
  sendSuccess(res, slots);
});

export const deactivateDoctorHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const doctor = await deactivateDoctor(req.params.id);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "UPDATE",
      module: "doctors",
      entityType: "Doctor",
      entityId: req.params.id,
      after: { isActive: false },
    },
    req,
  );
  sendSuccess(res, { id: doctor.id, isActive: false });
});
