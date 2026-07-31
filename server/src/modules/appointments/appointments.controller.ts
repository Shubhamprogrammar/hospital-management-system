import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess, sendPaginated } from "../../core/utils/apiResponse.js";
import { parsePagination, buildPaginationMeta } from "../../core/utils/pagination.js";
import { AppError } from "../../core/errors/AppError.js";
import { writeAuditLog } from "../../core/utils/audit.js";
import { generateTokenNumber } from "../../core/utils/uhid.js";
import { prisma } from "../../config/prisma.js";
import {
  bookAppointment,
  listAppointments,
  getAppointmentDetail,
  rescheduleAppointment,
  cancelAppointment,
  checkInAppointment,
  getDoctorQueue,
} from "./appointments.service.js";

export const bookAppointmentHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const appointment = await bookAppointment({ ...req.body, createdBy: actor?.id });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "CREATE",
      module: "appointments",
      entityType: "Appointment",
      entityId: appointment.id,
      after: {
        patientId: appointment.patientId,
        doctorId: appointment.doctorId,
        date: appointment.appointmentDate,
        slot: appointment.slotStartTime,
      },
    },
    req,
  );
  sendSuccess(res, { ...appointment, tokenPrefix: "OPD" }, 201);
});

export const listAppointmentsHandler = catchAsync(async (req: Request, res: Response) => {
  const pagination = parsePagination(req.query.page, req.query.limit);
  const result = await listAppointments({
    ...pagination,
    patientId: req.query.patientId as string | undefined,
    doctorId: req.query.doctorId as string | undefined,
    date: req.query.date as string | undefined,
    status: req.query.status as string | undefined,
  });
  sendPaginated(res, result.appointments, buildPaginationMeta(result.total, pagination));
});

export const getAppointmentHandler = catchAsync(async (req: Request, res: Response) => {
  const appointment = await getAppointmentDetail(req.params.id);
  sendSuccess(res, appointment);
});

export const rescheduleAppointmentHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const appointment = await rescheduleAppointment(req.params.id, req.body);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "RESCHEDULE",
      module: "appointments",
      entityType: "Appointment",
      entityId: req.params.id,
      after: { date: req.body.date, slot: req.body.slotStartTime },
    },
    req,
  );
  sendSuccess(res, appointment);
});

export const cancelAppointmentHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const appointment = await cancelAppointment(req.params.id, req.body.reason);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "CANCEL",
      module: "appointments",
      entityType: "Appointment",
      entityId: req.params.id,
      after: { status: "CANCELLED" },
    },
    req,
  );
  sendSuccess(res, appointment);
});

export const checkInAppointmentHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;

  // Generate token: {deptCode}-{seq} — daily sequence per department (FR 11.4-01)
  const appointment = await prisma.appointment.findUnique({
    where: { id: req.params.id },
    include: { department: true },
  });
  if (!appointment) throw new AppError("Appointment not found", 404, undefined, "NOT_FOUND");

  const seqDate = appointment.appointmentDate.toISOString().split("T")[0];
  const tokenCounter = await prisma.opdVisit.count({
    where: { departmentId: appointment.departmentId },
  });
  const tokenNumber = generateTokenNumber(appointment.department.code, tokenCounter + 1);

  const visit = await checkInAppointment(req.params.id, tokenNumber);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "CHECK_IN",
      module: "appointments",
      entityType: "Appointment",
      entityId: req.params.id,
      after: { visitId: visit.id, tokenNumber },
    },
    req,
  );
  sendSuccess(res, { visit, tokenNumber });
});

export const getQueueHandler = catchAsync(async (req: Request, res: Response) => {
  const { doctorId, date } = req.query;
  if (!doctorId || !date) {
    throw new AppError("doctorId and date query params are required", 400, undefined, "VALIDATION_ERROR");
  }
  const queue = await getDoctorQueue(doctorId as string, date as string);
  sendSuccess(res, queue);
});
