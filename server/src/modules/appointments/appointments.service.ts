import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { cacheDel } from "../../config/redis.js";
import { emitToRoom, emitToUser } from "../../core/utils/socket.js";

/**
 * Book an appointment against an available doctor slot (FR 10.4-01/02).
 * Slot booking is atomic — enforced by unique slotKey + advisory check.
 */
export async function bookAppointment(data: {
  patientId: string;
  doctorId: string;
  departmentId: string;
  date: string;
  slotStartTime: string;
  slotEndTime?: string;
  reason?: string;
  mode?: "IN_PERSON" | "TELECONSULT";
  createdBy?: string;
}) {
  const target = new Date(data.date);
  const [patient, doctor, department] = await prisma.$transaction([
    prisma.patient.findFirst({ where: { id: data.patientId, isActive: true, deletedAt: null } }),
    prisma.doctor.findFirst({ where: { id: data.doctorId, isActive: true, deletedAt: null } }),
    prisma.department.findFirst({ where: { id: data.departmentId, isActive: true, deletedAt: null } }),
  ]);

  if (!patient) throw new AppError("Patient not found or inactive", 404, undefined, "NOT_FOUND");
  if (!doctor) throw new AppError("Doctor not found or inactive", 404, undefined, "NOT_FOUND");
  if (!department) {
    throw new AppError("Department not found or inactive", 400, undefined, "ERR_DEPARTMENT_INACTIVE");
  }

  const doctorId = data.doctorId;
  const departmentId = data.departmentId;

  // Check doctor leave overlap
  const leave = await prisma.doctorLeave.findFirst({
    where: { doctorId, startDate: { lte: target }, endDate: { gte: target } },
  });
  if (leave) {
    throw new AppError("Doctor is on leave for this date", 409, undefined, "ERR_DOCTOR_UNAVAILABLE");
  }

  // Advisory slot check: existing non-cancelled appointment for same slot
  const existing = await prisma.appointment.findFirst({
    where: {
      doctorId,
      appointmentDate: target,
      slotStartTime: data.slotStartTime,
      status: { not: "CANCELLED" },
    },
  });
  if (existing) {
    throw new AppError("Slot already booked", 409, undefined, "ERR_SLOT_TAKEN");
  }

  // Determine slot end time from doctor availability (default 15 min)
  let slotEndTime = data.slotEndTime ?? addMinutes(data.slotStartTime, 15);
  const availability = await prisma.doctorAvailability.findFirst({
    where: { doctorId, weekday: target.getDay() },
  });
  if (availability) {
    slotEndTime = addMinutes(data.slotStartTime, availability.slotDurationMinutes);
  }

  const slotKey = `${doctorId}:${target.toISOString().split("T")[0]}:${data.slotStartTime}`;

  try {
    const appointment = await prisma.appointment.create({
      data: {
        patientId: data.patientId,
        doctorId,
        departmentId,
        appointmentDate: target,
        slotStartTime: data.slotStartTime,
        slotEndTime,
        mode: data.mode ?? "IN_PERSON",
        reason: data.reason,
        createdBy: data.createdBy,
        slotKey,
      },
    });

    // Emit socket + bust slot cache
    emitToRoom("admins", "appointments:booked", { id: appointment.id });
    emitToUser(doctor.userId, "appointments:booked", { id: appointment.id });
    await cacheDel(`doctor:${doctorId}:slots:${target.toISOString().split("T")[0]}`);

    return appointment;
  } catch (error: any) {
    if (error?.code === "P2002" && error?.meta?.target?.includes("slotKey")) {
      throw new AppError("Slot already booked", 409, undefined, "ERR_SLOT_TAKEN");
    }
    throw error;
  }
}

export async function listAppointments(params: {
  patientId?: string;
  doctorId?: string;
  date?: string;
  status?: string;
  page: number;
  limit: number;
}) {
  const where: Record<string, unknown> = {};
  if (params.patientId) where.patientId = params.patientId;
  if (params.doctorId) where.doctorId = params.doctorId;
  if (params.date) {
    const d = new Date(params.date);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    where.appointmentDate = { gte: d, lt: next };
  }
  if (params.status) where.status = params.status;

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

export async function getAppointmentDetail(id: string) {
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
  return appointment;
}

export async function rescheduleAppointment(
  id: string,
  data: { date: string; slotStartTime: string },
) {
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment) throw new AppError("Appointment not found", 404, undefined, "NOT_FOUND");
  if (appointment.status !== "CONFIRMED") {
    throw new AppError("Only CONFIRMED appointments can be rescheduled", 409, undefined, "CONFLICT");
  }

  // Release old slot, book new one
  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id },
      data: { slotKey: null, status: "CANCELLED" },
    });
  });

  return bookAppointment({
    patientId: appointment.patientId,
    doctorId: appointment.doctorId,
    departmentId: appointment.departmentId,
    date: data.date,
    slotStartTime: data.slotStartTime,
    reason: appointment.reason ?? undefined,
    mode: appointment.mode,
    createdBy: appointment.createdBy ?? undefined,
  });
}

export async function cancelAppointment(id: string, reason?: string) {
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment) throw new AppError("Appointment not found", 404, undefined, "NOT_FOUND");

  const updated = await prisma.appointment.update({
    where: { id },
    data: { status: "CANCELLED", slotKey: null, reason: reason ?? appointment.reason },
  });

  emitToRoom("admins", "appointments:cancelled", { id });
  return updated;
}

/**
 * Check-in: converts appointment to OPD visit + issues queue token (FR 10.4-04).
 */
export async function checkInAppointment(id: string, tokenNumber: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: { department: true },
  });
  if (!appointment) throw new AppError("Appointment not found", 404, undefined, "NOT_FOUND");
  if (appointment.status === "CANCELLED" || appointment.status === "COMPLETED") {
    throw new AppError("Cannot check in a cancelled/completed appointment", 409, undefined, "CONFLICT");
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

/** Live queue for a doctor's day (FR 10.7-07). */
export async function getDoctorQueue(doctorId: string, date: string) {
  const d = new Date(date);
  const next = new Date(d);
  next.setDate(next.getDate() + 1);

  const appointments = await prisma.appointment.findMany({
    where: {
      doctorId,
      appointmentDate: { gte: d, lt: next },
      status: { in: ["CONFIRMED", "CHECKED_IN", "COMPLETED", "NO_SHOW"] },
    },
    include: {
      patient: { select: { id: true, name: true, uhid: true } },
      opdVisit: { select: { id: true, tokenNumber: true, status: true } },
    },
    orderBy: { slotStartTime: "asc" },
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
