import { prisma } from "../../config/prisma.js";
import type { AppointmentStatus } from "../../generated/prisma/client.js";
import { AppError } from "../../core/errors/AppError.js";
import { cacheDel } from "../../config/redis.js";
import { emitToRoom, emitToUser } from "../../core/utils/socket.js";
import { notifyUser } from "../../core/utils/notifications.js";
import { ROLES } from "../../config/auth.js";
import { resolvePatientByUser } from "../patients/patients.service.js";
import { getDoctorByUser } from "../doctors/doctors.service.js";

/** Statuses that belong on the live waiting list — patients yet to be seen. */
const QUEUE_STATUSES: AppointmentStatus[] = ["BOOKED", "CHECKED_IN"];

function slotKeyFor(doctorId: string, target: Date, slotStartTime: string): string {
  return `${doctorId}:${target.toISOString().split("T")[0]}:${slotStartTime}`;
}

function slotCacheKey(doctorId: string, target: Date): string {
  return `doctor:${doctorId}:slots:${target.toISOString().split("T")[0]}`;
}

/**
 * Bookings must be in the future (BR): date may not be before today, and a
 * same-day booking's slot must still be ahead of now.
 */
function assertFutureAppointment(target: Date, slotStartTime: string) {
  if (Number.isNaN(target.getTime())) {
    throw new AppError("A valid appointment date is required", 400, undefined, "VALIDATION_ERROR");
  }
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (target < today) {
    throw new AppError("Appointment date must be in the future", 400, undefined, "ERR_PAST_DATE");
  }
  if (target.getTime() === today.getTime()) {
    const [hours, minutes] = slotStartTime.split(":").map(Number);
    if (typeof hours !== "number" || typeof minutes !== "number" || Number.isNaN(hours) || Number.isNaN(minutes)) {
      throw new AppError("A valid slot start time is required", 400, undefined, "VALIDATION_ERROR");
    }
    const slotAt = new Date(target);
    slotAt.setHours(hours, minutes, 0, 0);
    if (slotAt <= now) {
      throw new AppError("Appointment slot must be in the future", 400, undefined, "ERR_PAST_SLOT");
    }
  }
}

async function assertDoctorAvailable(doctorId: string, target: Date) {
  const doctor = await prisma.doctor.findFirst({
    where: { id: doctorId, isActive: true, deletedAt: null },
    select: { id: true, userId: true },
  });
  if (!doctor) throw new AppError("Doctor not found or inactive", 404, undefined, "NOT_FOUND");

  const leave = await prisma.doctorLeave.findFirst({
    where: { doctorId, startDate: { lte: target }, endDate: { gte: target } },
  });
  if (leave) {
    throw new AppError("Doctor is on leave for this date", 409, undefined, "ERR_DOCTOR_UNAVAILABLE");
  }
  return doctor;
}

async function assertDepartmentActive(departmentId: string) {
  const department = await prisma.department.findFirst({
    where: { id: departmentId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!department) {
    throw new AppError("Department not found or inactive", 400, undefined, "ERR_DEPARTMENT_INACTIVE");
  }
  return department;
}

/**
 * Advisory slot check: any non-cancelled / non-rejected appointment for the
 * same doctor/date/slot blocks the request. Atomicity is still guaranteed by
 * the unique `slotKey` at write time.
 */
async function assertSlotAvailable(
  doctorId: string,
  target: Date,
  slotStartTime: string,
  excludeId?: string,
) {
  const existing = await prisma.appointment.findFirst({
    where: {
      doctorId,
      appointmentDate: target,
      slotStartTime,
      status: { notIn: ["CANCELLED", "REJECTED"] },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw new AppError("Slot already booked", 409, undefined, "ERR_SLOT_TAKEN");
  }
}

/** Resolve the requested slot end time from doctor availability (default 15 min). */
async function resolveSlotEndTime(doctorId: string, target: Date, slotStartTime: string, explicit?: string) {
  const availability = await prisma.doctorAvailability.findFirst({
    where: { doctorId, weekday: target.getDay() },
  });
  return explicit ?? addMinutes(slotStartTime, availability?.slotDurationMinutes ?? 15);
}

/** Notify every active user with the given role (used for receptionist alerts). */
async function notifyRole(role: string, templateKey: string, payload?: Record<string, unknown>) {
  const users = await prisma.user.findMany({
    where: { role, isActive: true, deletedAt: null },
    select: { id: true },
  });
  await Promise.allSettled(users.map((u) => notifyUser(u.id, templateKey, payload)));
}

/**
 * Create an appointment.
 *
 * Patients "apply" — their record is forced to their own linked Patient
 * profile and created as PENDING (no slot reserved; a receptionist approves).
 * Staff book directly — status BOOKED, slot reserved atomically.
 */
export async function bookAppointment(data: {
  patientId: string;
  doctorId: string;
  departmentId: string;
  date?: string;
  appointmentDate?: string;
  slotStartTime: string;
  slotEndTime?: string;
  reason?: string;
  mode?: "IN_PERSON" | "TELECONSULT";
  createdBy?: string;
  actorRole?: string;
  actorUserId?: string;
}) {
  const target = new Date(data.date ?? data.appointmentDate!);
  assertFutureAppointment(target, data.slotStartTime);
  const isRequest = data.actorRole === ROLES.PATIENT;

  // Patients can only book for themselves — the Patient record linked to
  // their account. Any client-supplied patientId is ignored for PATIENT.
  const patientId = isRequest ? (await resolvePatientByUser(data.actorUserId!)).id : data.patientId;

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!patient) throw new AppError("Patient not found or inactive", 404, undefined, "NOT_FOUND");

  const doctor = await assertDoctorAvailable(data.doctorId, target);
  await assertDepartmentActive(data.departmentId);
  await assertSlotAvailable(data.doctorId, target, data.slotStartTime);

  const slotEndTime = await resolveSlotEndTime(data.doctorId, target, data.slotStartTime, data.slotEndTime);
  const status = isRequest ? "PENDING" : "BOOKED";
  const slotKey = status === "BOOKED" ? slotKeyFor(data.doctorId, target, data.slotStartTime) : null;

  try {
    const appointment = await prisma.appointment.create({
      data: {
        patientId,
        doctorId: data.doctorId,
        departmentId: data.departmentId,
        appointmentDate: target,
        slotStartTime: data.slotStartTime,
        slotEndTime,
        mode: data.mode ?? "IN_PERSON",
        reason: data.reason,
        createdBy: data.createdBy,
        status,
        slotKey,
      },
      include: {
        patient: { select: { id: true, userId: true, name: true, uhid: true } },
        doctor: { select: { id: true, userId: true, user: { select: { name: true } } } },
      },
    });

    if (status === "BOOKED") {
      emitToRoom("admins", "appointments:booked", { id: appointment.id });
      if (doctor.userId) emitToUser(doctor.userId, "appointments:booked", { id: appointment.id });
      await cacheDel(slotCacheKey(data.doctorId, target));
    } else {
      emitToRoom("admins", "appointments:requested", { id: appointment.id });
      await notifyRole(ROLES.RECEPTIONIST, "appointment-requested", {
        appointmentId: appointment.id,
        patientName: appointment.patient?.name,
        date: target.toISOString().split("T")[0],
        slot: data.slotStartTime,
      });
    }

    return appointment;
  } catch (error: any) {
    if (error?.code === "P2002" && error?.meta?.target?.includes("slotKey")) {
      throw new AppError("Slot already booked", 409, undefined, "ERR_SLOT_TAKEN");
    }
    throw error;
  }
}

/**
 * Approve a PENDING request: re-verifies doctor/department availability and
 * the slot, then marks it BOOKED (slotKey reserved) and notifies patient +
 * doctor. Called by receptionist/admin.
 */
export async function approveAppointment(id: string, reviewerId: string, note?: string) {
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment) throw new AppError("Appointment not found", 404, undefined, "NOT_FOUND");
  if (appointment.status !== "PENDING") {
    throw new AppError("Only PENDING appointments can be approved", 409, undefined, "CONFLICT");
  }

  const target = appointment.appointmentDate;
  const doctor = await assertDoctorAvailable(appointment.doctorId, target);
  await assertDepartmentActive(appointment.departmentId);
  await assertSlotAvailable(appointment.doctorId, target, appointment.slotStartTime, appointment.id);

  const slotKey = slotKeyFor(appointment.doctorId, target, appointment.slotStartTime);

  let updated;
  try {
    updated = await prisma.appointment.update({
      where: { id },
      data: { status: "BOOKED", slotKey, reviewedById: reviewerId, decisionNote: note ?? null },
      include: {
        patient: { select: { id: true, userId: true, name: true, uhid: true } },
        doctor: { select: { id: true, userId: true, user: { select: { name: true } } } },
        department: { select: { id: true, name: true } },
      },
    });
  } catch (error: any) {
    if (error?.code === "P2002" && error?.meta?.target?.includes("slotKey")) {
      throw new AppError("Slot already booked", 409, undefined, "ERR_SLOT_TAKEN");
    }
    throw error;
  }

  const dateLabel = target.toISOString().split("T")[0];
  const payload = {
    appointmentId: id,
    date: dateLabel,
    slot: appointment.slotStartTime,
    doctorName: updated.doctor?.user?.name,
    note: note ?? undefined,
  };
  emitToRoom("admins", "appointments:booked", { id });
  if (doctor.userId) emitToUser(doctor.userId, "appointments:booked", { id });
  await cacheDel(slotCacheKey(appointment.doctorId, target));
  if (updated.patient?.userId) {
    await notifyUser(updated.patient.userId, "appointment-approved", payload);
  }
  if (doctor.userId) {
    await notifyUser(doctor.userId, "appointment-approved", {
      ...payload,
      patientName: updated.patient?.name,
      uhid: updated.patient?.uhid,
    });
  }

  return updated;
}

/** Reject a PENDING request with a reason; notifies the patient. */
export async function rejectAppointment(id: string, reviewerId: string, note?: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: { patient: { select: { userId: true, name: true } } },
  });
  if (!appointment) throw new AppError("Appointment not found", 404, undefined, "NOT_FOUND");
  if (appointment.status !== "PENDING") {
    throw new AppError("Only PENDING appointments can be rejected", 409, undefined, "CONFLICT");
  }

  const updated = await prisma.appointment.update({
    where: { id },
    data: { status: "REJECTED", slotKey: null, reviewedById: reviewerId, decisionNote: note ?? null },
  });

  emitToRoom("admins", "appointments:rejected", { id });
  if (appointment.patient?.userId) {
    await notifyUser(appointment.patient.userId, "appointment-rejected", {
      appointmentId: id,
      date: appointment.appointmentDate.toISOString().split("T")[0],
      slot: appointment.slotStartTime,
      reason: note ?? undefined,
    });
  }

  return updated;
}

export async function listAppointments(params: {
  patientId?: string;
  doctorId?: string;
  departmentId?: string;
  date?: string;
  status?: string;
  search?: string;
  page: number;
  limit: number;
}) {
  const where: Record<string, unknown> = {};
  if (params.patientId) where.patientId = params.patientId;
  if (params.doctorId) where.doctorId = params.doctorId;
  if (params.departmentId) where.departmentId = params.departmentId;
  if (params.date) {
    const d = new Date(params.date);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    where.appointmentDate = { gte: d, lt: next };
  }
  if (params.status) where.status = params.status;
  if (params.search) {
    where.OR = [
      { patient: { name: { contains: params.search, mode: "insensitive" } } },
      { patient: { uhid: { contains: params.search, mode: "insensitive" } } },
      { patient: { phone: { contains: params.search } } },
      { doctor: { user: { name: { contains: params.search, mode: "insensitive" } } } },
      { department: { name: { contains: params.search, mode: "insensitive" } } },
    ];
  }

  const [total, appointments] = await prisma.$transaction([
    prisma.appointment.count({ where }),
    prisma.appointment.findMany({
      where,
      include: {
        patient: { select: { id: true, uhid: true, name: true, phone: true } },
        doctor: { select: { id: true, specialization: true, user: { select: { name: true } } } },
        department: { select: { id: true, name: true, code: true } },
      },
      orderBy: { appointmentDate: "desc" },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
  ]);

  return { total, appointments };
}

export async function getAppointmentDetail(id: string, actor?: { id: string; role: string }) {
  const appointment = await prisma.appointment.findFirst({
    where: { id },
    include: {
      patient: { select: { id: true, uhid: true, name: true, phone: true, dob: true } },
      doctor: { select: { id: true, specialization: true, user: { select: { name: true, phone: true } } } },
      department: { select: { id: true, name: true, code: true } },
      opdVisit: { select: { id: true, tokenNumber: true, status: true } },
    },
  });
  if (!appointment) throw new AppError("Appointment not found", 404, undefined, "NOT_FOUND");

  if (actor?.role === ROLES.PATIENT) {
    const patient = await resolvePatientByUser(actor.id);
    if (appointment.patientId !== patient.id) {
      throw new AppError("Not authorized to view this appointment", 403, undefined, "FORBIDDEN");
    }
  }

  return appointment;
}

/**
 * Reschedule.
 * - Patients: only their own BOOKED appointment; it goes back to PENDING for
 *   a new approval round (the old slot is released immediately).
 * - Staff: books the new slot directly (status BOOKED) at the new date/slot.
 */
export async function rescheduleAppointment(
  id: string,
  data: { date?: string; appointmentDate?: string; slotStartTime: string },
  actor?: { id: string; role: string },
) {
  // Client sends `appointmentDate`, older callers send `date` — accept both.
  const newDate = new Date((data.date ?? data.appointmentDate) ?? "");
  assertFutureAppointment(newDate, data.slotStartTime);

  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: { patient: { select: { id: true, userId: true } } },
  });
  if (!appointment) throw new AppError("Appointment not found", 404, undefined, "NOT_FOUND");
  if (appointment.status !== "BOOKED") {
    throw new AppError("Only BOOKED appointments can be rescheduled", 409, undefined, "CONFLICT");
  }

  const isPatient = actor?.role === ROLES.PATIENT;
  if (isPatient) {
    const patient = await resolvePatientByUser(actor!.id);
    if (appointment.patientId !== patient.id) {
      throw new AppError("Not authorized to reschedule this appointment", 403, undefined, "FORBIDDEN");
    }
    await assertSlotAvailable(appointment.doctorId, newDate, data.slotStartTime, appointment.id);
    // Release the old slot and send the request back to the review queue.
    return prisma.appointment.update({
      where: { id },
      data: {
        status: "PENDING",
        slotKey: null,
        appointmentDate: newDate,
        slotStartTime: data.slotStartTime,
        slotEndTime: await resolveSlotEndTime(appointment.doctorId, newDate, data.slotStartTime),
        reviewedById: null,
        decisionNote: null,
      },
    });
  }

  // Staff reschedule: release the old slot, then book the new one directly.
  await prisma.appointment.update({
    where: { id },
    data: { status: "CANCELLED", slotKey: null },
  });

  return bookAppointment({
    patientId: appointment.patientId,
    doctorId: appointment.doctorId,
    departmentId: appointment.departmentId,
    date: newDate.toISOString(),
    slotStartTime: data.slotStartTime,
    reason: appointment.reason ?? undefined,
    mode: appointment.mode,
    createdBy: appointment.createdBy ?? undefined,
    actorRole: actor?.role,
    actorUserId: actor?.id,
  });
}

export async function cancelAppointment(id: string, reason?: string, actor?: { id: string; role: string }) {
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: { patient: { select: { id: true, userId: true } } },
  });
  if (!appointment) throw new AppError("Appointment not found", 404, undefined, "NOT_FOUND");

  if (actor?.role === ROLES.PATIENT) {
    const patient = await resolvePatientByUser(actor.id);
    if (appointment.patientId !== patient.id) {
      throw new AppError("Not authorized to cancel this appointment", 403, undefined, "FORBIDDEN");
    }
  }

  const updated = await prisma.appointment.update({
    where: { id },
    data: { status: "CANCELLED", slotKey: null, reason: reason ?? appointment.reason },
  });

  emitToRoom("admins", "appointments:cancelled", { id });
  return updated;
}

/**
 * Mark done: a BOOKED / CHECKED_IN appointment moves to COMPLETED. Staff may
 * complete any appointment; a DOCTOR may only complete their own.
 */
export async function completeAppointment(id: string, actor?: { id: string; role: string }) {
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: { patient: { select: { userId: true, name: true } } },
  });
  if (!appointment) throw new AppError("Appointment not found", 404, undefined, "NOT_FOUND");
  if (!["BOOKED", "CHECKED_IN"].includes(appointment.status)) {
    throw new AppError("Only BOOKED or CHECKED_IN appointments can be marked done", 409, undefined, "CONFLICT");
  }

  if (actor?.role === ROLES.DOCTOR) {
    const doctor = await getDoctorByUser(actor.id);
    if (!doctor || doctor.id !== appointment.doctorId) {
      throw new AppError("Not authorized to complete this appointment", 403, undefined, "FORBIDDEN");
    }
  }

  const updated = await prisma.appointment.update({
    where: { id },
    data: { status: "COMPLETED" },
  });

  emitToRoom("admins", "appointments:completed", { id });
  return updated;
}

/**
 * Check-in: converts a BOOKED appointment to OPD visit + issues queue token (FR 10.4-04).
 */
export async function checkInAppointment(id: string, tokenNumber: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: { department: true },
  });
  if (!appointment) throw new AppError("Appointment not found", 404, undefined, "NOT_FOUND");
  if (appointment.status !== "BOOKED") {
    throw new AppError("Only BOOKED appointments can be checked in", 409, undefined, "CONFLICT");
  }

  const existingVisit = await prisma.opdVisit.findUnique({
    where: { appointmentId: id },
  });
  if (existingVisit) {
    throw new AppError("This appointment is already checked in", 409, undefined, "CONFLICT");
  }

  const visit = await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id },
      data: { status: "CHECKED_IN" },
    });
    return tx.opdVisit.create({
      data: {
        appointmentId: id,
        patientId: appointment.patientId,
        doctorId: appointment.doctorId,
        departmentId: appointment.departmentId,
        tokenNumber,
      },
    });
  });

  emitToRoom(`dept-queue:${appointment.departmentId}`, "appointments:queue-updated", {
    doctorId: appointment.doctorId,
    date: appointment.appointmentDate.toISOString().split("T")[0],
  });

  return visit;
}

/** Live waiting list for a doctor's day (FR 10.7-07). Without a doctor, lists everyone waiting today across departments. */
export async function getDoctorQueue(doctorId: string | undefined, date: string) {
  const d = new Date(date);
  const next = new Date(d);
  next.setDate(next.getDate() + 1);

  const appointments = await prisma.appointment.findMany({
    where: {
      ...(doctorId ? { doctorId } : {}),
      appointmentDate: { gte: d, lt: next },
      status: { in: QUEUE_STATUSES },
    },
    include: {
      patient: { select: { id: true, name: true, uhid: true } },
      doctor: { select: { id: true, specialization: true, user: { select: { name: true } } } },
      department: { select: { id: true, name: true, code: true } },
      opdVisit: { select: { id: true, tokenNumber: true, status: true } },
    },
    orderBy: [
      { departmentId: "asc" },
      // Patients already checked in (have an OPD token) go ahead of booked ones.
      { opdVisit: { tokenNumber: "asc" } },
      { slotStartTime: "asc" },
      { createdAt: "asc" },
    ],
  });

  return appointments;
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + minutes;
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
