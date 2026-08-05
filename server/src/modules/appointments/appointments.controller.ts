import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess, sendPaginated } from "../../core/utils/apiResponse.js";
import { parsePagination, buildPaginationMeta } from "../../core/utils/pagination.js";
import { AppError } from "../../core/errors/AppError.js";
import { writeAuditLog } from "../../core/utils/audit.js";
import { generateTokenNumber } from "../../core/utils/uhid.js";
import { prisma } from "../../config/prisma.js";
import { ROLES } from "../../config/auth.js";
import {
  approveAppointment,
  bookAppointment,
  cancelAppointment,
  checkInAppointment,
  completeAppointment,
  getAppointmentDetail,
  getDoctorQueue,
  listAppointments,
  rejectAppointment,
  rescheduleAppointment,
} from "./appointments.service.js";
import { resolvePatientByUser } from "../patients/patients.service.js";
import { getDoctorByUser } from "../doctors/doctors.service.js";

/** Patients may never pick whose record they operate on — always their own. */
async function enforcePatientScope(actor: { id: string; role: string }) {
  if (actor.role !== ROLES.PATIENT) return undefined;
  const patient = await resolvePatientByUser(actor.id);
  return patient.id;
}

export const bookAppointmentHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const patientId = await enforcePatientScope(actor);

  const appointment = await bookAppointment({
    ...req.body,
    patientId: patientId ?? req.body.patientId,
    createdBy: actor?.id,
    actorRole: actor?.role,
    actorUserId: actor?.id,
  });

  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: appointment.status === "PENDING" ? "REQUEST" : "CREATE",
      module: "appointments",
      entityType: "Appointment",
      entityId: appointment.id,
      after: {
        patientId: appointment.patientId,
        doctorId: appointment.doctorId,
        date: appointment.appointmentDate,
        slot: appointment.slotStartTime,
        status: appointment.status,
      },
    },
    req,
  );
  sendSuccess(res, { ...appointment, tokenPrefix: "OPD" }, 201);
});

export const listAppointmentsHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const pagination = parsePagination(req.query.page, req.query.limit);

  // Patients only ever see their own appointments; doctors only theirs.
  let patientId = req.query.patientId as string | undefined;
  let doctorId = req.query.doctorId as string | undefined;
  if (actor?.role === ROLES.PATIENT) {
    patientId = await enforcePatientScope(actor);
    doctorId = undefined;
  } else if (actor?.role === ROLES.DOCTOR) {
    const doctor = await getDoctorByUser(actor.id);
    doctorId = doctor?.id;
    if (!doctorId) {
      sendPaginated(res, [], buildPaginationMeta(0, pagination));
      return;
    }
  }

  const result = await listAppointments({
    ...pagination,
    patientId,
    doctorId,
    departmentId: req.query.departmentId as string | undefined,
    date: req.query.date as string | undefined,
    status: req.query.status as string | undefined,
    search: req.query.search as string | undefined,
  });
  sendPaginated(res, result.appointments, buildPaginationMeta(result.total, pagination));
});

export const getAppointmentHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const appointment = await getAppointmentDetail(req.params.id, actor);
  sendSuccess(res, appointment);
});

export const approveAppointmentHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const appointment = await approveAppointment(req.params.id, actor.id, req.body?.decisionNote);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "APPROVE",
      module: "appointments",
      entityType: "Appointment",
      entityId: req.params.id,
      after: { status: "BOOKED", note: req.body?.decisionNote },
    },
    req,
  );
  sendSuccess(res, appointment);
});

export const rejectAppointmentHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const appointment = await rejectAppointment(req.params.id, actor.id, req.body?.decisionNote);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "REJECT",
      module: "appointments",
      entityType: "Appointment",
      entityId: req.params.id,
      after: { status: "REJECTED", note: req.body?.decisionNote },
    },
    req,
  );
  sendSuccess(res, appointment);
});

export const rescheduleAppointmentHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const appointment = await rescheduleAppointment(req.params.id, req.body, actor);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "RESCHEDULE",
      module: "appointments",
      entityType: "Appointment",
      entityId: req.params.id,
      after: { date: req.body.date, slot: req.body.slotStartTime, status: appointment.status },
    },
    req,
  );
  sendSuccess(res, appointment);
});

export const cancelAppointmentHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const appointment = await cancelAppointment(req.params.id, req.body.reason, actor);
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

export const completeAppointmentHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const appointment = await completeAppointment(req.params.id, actor);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "COMPLETE",
      module: "appointments",
      entityType: "Appointment",
      entityId: req.params.id,
      after: { status: "COMPLETED" },
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
  const doctorId = req.query.doctorId as string | undefined;
  const today = new Date().toISOString().split("T")[0] as string;
  const date = (req.query.date as string | undefined) ?? today;
  const queue = await getDoctorQueue(doctorId, date);
  sendSuccess(res, queue);
});
