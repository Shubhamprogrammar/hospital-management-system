import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { emitToRoom } from "../../core/utils/socket.js";

/**
 * Record vitals for an OPD visit (FR 11.4-02).
 */
export async function recordVitals(
  visitId: string,
  data: {
    bpSystolic?: number;
    bpDiastolic?: number;
    pulse?: number;
    temperature?: number;
    spo2?: number;
    weight?: number;
    height?: number;
    recordedBy?: string;
  },
) {
  const visit = await prisma.opdVisit.findUnique({ where: { id: visitId } });
  if (!visit) throw new AppError("OPD visit not found", 404, undefined, "NOT_FOUND");
  if (visit.status === "COMPLETED" || visit.status === "REFERRED_IPD") {
    throw new AppError("Visit already closed", 409, undefined, "CONFLICT");
  }

  const vital = await prisma.opdVital.create({
    data: {
      visitId,
      bpSystolic: data.bpSystolic,
      bpDiastolic: data.bpDiastolic,
      pulse: data.pulse,
      temperature: data.temperature,
      spo2: data.spo2,
      weight: data.weight,
      height: data.height,
      recordedBy: data.recordedBy,
    },
  });

  // Status moves to VITALS_DONE if still WAITING (FR 11.5-01)
  if (visit.status === "WAITING") {
    await prisma.opdVisit.update({ where: { id: visitId }, data: { status: "VITALS_DONE" } });
  }

  return vital;
}

export async function getVisitDetail(id: string) {
  const visit = await prisma.opdVisit.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, uhid: true, name: true, phone: true, dob: true, allergies: true } },
      doctor: { select: { id: true, specialization: true, user: { select: { name: true } } } },
      department: { select: { id: true, name: true, code: true } },
      appointment: { select: { id: true, appointmentDate: true, slotStartTime: true, mode: true } },
      vitals: { orderBy: { recordedAt: "desc" } },
      diagnoses: true,
      prescriptions: { select: { id: true, status: true, createdAt: true } },
      labOrders: { select: { id: true, status: true, createdAt: true } },
    },
  });
  if (!visit) throw new AppError("OPD visit not found", 404, undefined, "NOT_FOUND");
  return visit;
}

/**
 * Doctor calls the token and starts consultation (FR 11.4-03).
 */
export async function startConsultation(visitId: string) {
  const visit = await prisma.opdVisit.findUnique({ where: { id: visitId } });
  if (!visit) throw new AppError("OPD visit not found", 404, undefined, "NOT_FOUND");

  if (visit.status === "WAITING") {
    throw new AppError("Vitals must be recorded before consultation starts", 409, undefined, "ERR_VITALS_REQUIRED");
  }

  const updated = await prisma.opdVisit.update({
    where: { id: visitId },
    data: { status: "IN_CONSULTATION", consultationStartedAt: new Date() },
  });

  emitToRoom(`dept-queue:${visit.departmentId}`, "opd:token-called", {
    visitId,
    tokenNumber: visit.tokenNumber,
  });

  return updated;
}

/**
 * Save diagnosis/notes (FR 11.4-03).
 */
export async function saveDiagnosis(
  visitId: string,
  data: {
    icd10Code: string;
    description?: string;
    notes?: string;
    diagnosedBy?: string;
    noDiagnosis?: boolean;
  },
) {
  const visit = await prisma.opdVisit.findUnique({ where: { id: visitId } });
  if (!visit) throw new AppError("OPD visit not found", 404, undefined, "NOT_FOUND");

  if (!data.noDiagnosis && !data.icd10Code) {
    throw new AppError(
      "Diagnosis code required (or set noDiagnosis=true for follow-up only)",
      400,
      undefined,
      "ERR_DIAGNOSIS_REQUIRED_TO_CLOSE",
    );
  }

  const diagnosis = await prisma.opdDiagnosis.create({
    data: {
      visitId,
      icd10Code: data.noDiagnosis ? "Z00.0" : data.icd10Code, // Z00.0 = general exam
      description: data.description,
      notes: data.notes,
      diagnosedBy: data.diagnosedBy,
    },
  });

  return diagnosis;
}

/**
 * Close visit (FR 11.4-05). Requires vitals + diagnosis or explicit waiver.
 */
export async function closeVisit(visitId: string) {
  const visit = await prisma.opdVisit.findUnique({
    where: { id: visitId },
    include: { vitals: true, diagnoses: true },
  });
  if (!visit) throw new AppError("OPD visit not found", 404, undefined, "NOT_FOUND");

  if (visit.vitals.length === 0) {
    throw new AppError("Vitals must be recorded before closing the visit", 409, undefined, "ERR_VITALS_REQUIRED");
  }
  if (visit.diagnoses.length === 0) {
    throw new AppError(
      "At least one diagnosis (or explicit no-diagnosis note) required to close",
      409,
      undefined,
      "ERR_DIAGNOSIS_REQUIRED_TO_CLOSE",
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const closed = await tx.opdVisit.update({
      where: { id: visitId },
      data: { status: "COMPLETED", closedAt: new Date() },
    });
    if (visit.appointmentId) {
      await tx.appointment.update({
        where: { id: visit.appointmentId },
        data: { status: "COMPLETED" },
      });
    }
    return closed;
  });

  emitToRoom(`dept-queue:${visit.departmentId}`, "opd:visit-closed", { visitId });
  return updated;
}

/** Live department queue (FR 11.7-06). */
export async function getDepartmentQueue(departmentId: string, date: string) {
  const d = new Date(date);
  const next = new Date(d);
  next.setDate(next.getDate() + 1);

  const visits = await prisma.opdVisit.findMany({
    where: {
      departmentId,
      checkedInAt: { gte: d, lt: next },
      status: { in: ["WAITING", "VITALS_DONE", "IN_CONSULTATION"] },
    },
    include: {
      patient: { select: { id: true, name: true, uhid: true } },
      doctor: { select: { id: true, user: { select: { name: true } } } },
    },
    orderBy: { checkedInAt: "asc" },
  });

  return visits.map((visit, position) => ({ visit, position: position + 1 }));
}

/**
 * Refer an OPD visit to IPD admission (FR 11.7-07).
 */
export async function referToIpd(visitId: string, data: { wardId: string; bedId: string }) {
  const visit = await prisma.opdVisit.findUnique({ where: { id: visitId } });
  if (!visit) throw new AppError("OPD visit not found", 404, undefined, "NOT_FOUND");

  const bed = await prisma.bed.findUnique({ where: { id: data.bedId } });
  if (!bed || bed.status !== "AVAILABLE") {
    throw new AppError("Bed not available", 409, undefined, "ERR_BED_UNAVAILABLE");
  }

  const updated = await prisma.opdVisit.update({
    where: { id: visitId },
    data: { status: "REFERRED_IPD" },
  });

  return { visit: updated, wardId: data.wardId, bedId: data.bedId, referral: "PENDING_ADMISSION" };
}
