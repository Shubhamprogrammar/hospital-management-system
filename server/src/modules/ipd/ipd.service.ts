import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { generateAdmissionNo } from "../../core/utils/uhid.js";
import { emitToRoom } from "../../core/utils/socket.js";

/**
 * Admit a patient with atomic bed reservation (FR 12.4-01).
 */
export async function admitPatient(data: {
  patientId: string;
  admittingDoctorId: string;
  wardId: string;
  bedId: string;
  admissionType?: "EMERGENCY" | "REFERRAL" | "DIRECT";
  referredFromVisitId?: string;
}) {
  // BR-01: one active admission per patient
  const active = await prisma.ipdAdmission.findFirst({
    where: {
      patientId: data.patientId,
      status: { in: ["ADMITTED", "IN_TREATMENT", "DISCHARGE_PLANNED"] },
    },
  });
  if (active) {
    throw new AppError(
      "Patient already has an active admission",
      409,
      { existingAdmissionId: active.id },
      "ERR_PATIENT_ALREADY_ADMITTED",
    );
  }

  // Atomic bed check + reservation in a transaction (FRD 12.11/14.5)
  const result = await prisma.$transaction(async (tx) => {
    const bed = await tx.bed.findUnique({ where: { id: data.bedId } });
    if (!bed || bed.status !== "AVAILABLE") {
      throw new AppError("Bed not available", 409, undefined, "ERR_BED_UNAVAILABLE");
    }

    // Verify bed belongs to the ward
    if (bed.wardId !== data.wardId) {
      throw new AppError("Bed does not belong to the specified ward", 400, undefined, "VALIDATION_ERROR");
    }

    const seq = await tx.ipdAdmission.count();
    const admission = await tx.ipdAdmission.create({
      data: {
        admissionNo: generateAdmissionNo(seq + 1),
        patientId: data.patientId,
        admittingDoctorId: data.admittingDoctorId,
        wardId: data.wardId,
        bedId: data.bedId,
        admissionType: data.admissionType ?? "REFERRAL",
        referredFromVisitId: data.referredFromVisitId,
      },
    });

    await tx.bed.update({
      where: { id: data.bedId },
      data: { status: "OCCUPIED", currentAdmissionId: admission.id },
    });

    return admission;
  });

  emitToRoom(`ward:${data.wardId}`, "ipd:admitted", { id: result.id });
  emitToRoom(`ward:${data.wardId}`, "ipd:bed-status-changed", { bedId: data.bedId, status: "OCCUPIED" });
  emitToRoom(`ward:${data.wardId}`, "ipd:census-updated", { wardId: data.wardId });

  return result;
}

export async function listAdmissions(params: {
  wardId?: string;
  status?: string;
  doctorId?: string;
  page: number;
  limit: number;
}) {
  const where: Record<string, unknown> = {};
  if (params.wardId) where.wardId = params.wardId;
  if (params.status) where.status = params.status;
  if (params.doctorId) where.admittingDoctorId = params.doctorId;

  const [total, admissions] = await prisma.$transaction([
    prisma.ipdAdmission.count({ where }),
    prisma.ipdAdmission.findMany({
      where,
      include: {
        patient: { select: { id: true, uhid: true, name: true } },
        ward: { select: { id: true, name: true, wardType: true } },
        bed: { select: { id: true, bedNumber: true } },
        admittingDoctor: { select: { id: true, user: { select: { name: true } } } },
      },
      orderBy: { admittedAt: "desc" },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
  ]);

  return { total, admissions };
}

export async function getAdmissionDetail(id: string) {
  const admission = await prisma.ipdAdmission.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, uhid: true, name: true, phone: true, dob: true, allergies: true } },
      admittingDoctor: { select: { id: true, specialization: true, user: { select: { name: true } } } },
      ward: { select: { id: true, name: true, wardType: true, floor: true } },
      bed: { select: { id: true, bedNumber: true, bedType: true } },
      referredFromVisit: { select: { id: true, tokenNumber: true } },
      rounds: { orderBy: { createdAt: "desc" }, include: { doctor: { select: { user: { select: { name: true } } } } } },
      vitals: { orderBy: { recordedAt: "desc" } },
      transfers: { orderBy: { createdAt: "desc" } },
      dischargeSummary: true,
      prescriptions: { select: { id: true, status: true, createdAt: true } },
      labOrders: { select: { id: true, status: true, createdAt: true } },
      bills: { select: { id: true, status: true, totalAmount: true } },
    },
  });
  if (!admission) throw new AppError("Admission not found", 404, undefined, "NOT_FOUND");
  return admission;
}

export async function addRound(
  admissionId: string,
  data: { notes: string; doctorId?: string },
) {
  const admission = await prisma.ipdAdmission.findUnique({ where: { id: admissionId } });
  if (!admission) throw new AppError("Admission not found", 404, undefined, "NOT_FOUND");

  return prisma.ipdRound.create({
    data: { admissionId, doctorId: data.doctorId ?? admission.admittingDoctorId, notes: data.notes },
  });
}

export async function chartVitals(
  admissionId: string,
  data: {
    bpSystolic?: number;
    bpDiastolic?: number;
    pulse?: number;
    temperature?: number;
    spo2?: number;
    recordedBy?: string;
  },
) {
  const admission = await prisma.ipdAdmission.findUnique({ where: { id: admissionId } });
  if (!admission) throw new AppError("Admission not found", 404, undefined, "NOT_FOUND");

  const vital = await prisma.ipdVital.create({
    data: {
      admissionId,
      bpSystolic: data.bpSystolic,
      bpDiastolic: data.bpDiastolic,
      pulse: data.pulse,
      temperature: data.temperature,
      spo2: data.spo2,
      recordedBy: data.recordedBy,
    },
  });

  if (admission.status === "ADMITTED") {
    await prisma.ipdAdmission.update({ where: { id: admissionId }, data: { status: "IN_TREATMENT" } });
  }

  emitToRoom(`ward:${admission.wardId}`, "ipd:vitals-charted", { admissionId });
  return vital;
}

/**
 * Ward-to-ward transfer — creates transfer record, does not close admission (BR-02).
 */
export async function transferAdmission(
  admissionId: string,
  data: { toBedId: string; reason?: string; transferredBy?: string },
) {
  const admission = await prisma.ipdAdmission.findUnique({
    where: { id: admissionId },
    include: { bed: true },
  });
  if (!admission) throw new AppError("Admission not found", 404, undefined, "NOT_FOUND");
  if (admission.status === "DISCHARGED") {
    throw new AppError("Cannot transfer a discharged admission", 409, undefined, "CONFLICT");
  }

  return prisma.$transaction(async (tx) => {
    const newBed = await tx.bed.findUnique({ where: { id: data.toBedId } });
    if (!newBed || newBed.status !== "AVAILABLE") {
      throw new AppError("Target bed not available", 409, undefined, "ERR_BED_UNAVAILABLE");
    }

    await tx.ipdTransfer.create({
      data: {
        admissionId,
        fromBedId: admission.bedId,
        toBedId: data.toBedId,
        reason: data.reason,
        transferredBy: data.transferredBy,
      },
    });

    // Free old bed, occupy new bed
    await tx.bed.update({
      where: { id: admission.bedId },
      data: { status: "CLEANING", currentAdmissionId: null },
    });
    await tx.bed.update({
      where: { id: data.toBedId },
      data: { status: "OCCUPIED", currentAdmissionId: admissionId },
    });

    const updated = await tx.ipdAdmission.update({
      where: { id: admissionId },
      data: { bedId: data.toBedId, wardId: newBed.wardId },
    });

    emitToRoom(`ward:${admission.wardId}`, "ipd:bed-status-changed", { bedId: admission.bedId, status: "CLEANING" });
    emitToRoom(`ward:${newBed.wardId}`, "ipd:bed-status-changed", { bedId: data.toBedId, status: "OCCUPIED" });

    return updated;
  });
}

/**
 * Discharge — blocked while billing is PENDING unless admin override (FR 12.4-05).
 */
export async function dischargePatient(
  admissionId: string,
  data: { adminOverride?: boolean; diagnosis?: string; treatmentSummary?: string; followUpInstructions?: string; signedBy?: string },
) {
  const admission = await prisma.ipdAdmission.findUnique({
    where: { id: admissionId },
    include: { bills: { where: { status: { in: ["DRAFT", "PENDING_APPROVAL", "FINALIZED", "PARTIALLY_PAID"] } } } },
  });
  if (!admission) throw new AppError("Admission not found", 404, undefined, "NOT_FOUND");

  if (admission.bills.length > 0 && !data.adminOverride) {
    throw new AppError(
      "Discharge blocked: pending bill requires clearance (or admin override)",
      409,
      undefined,
      "ERR_DISCHARGE_BLOCKED_BILLING",
    );
  }

  return prisma.$transaction(async (tx) => {
    const discharged = await tx.ipdAdmission.update({
      where: { id: admissionId },
      data: { status: "DISCHARGED", dischargedAt: new Date() },
    });

    // Bed → CLEANING (30-min delayed job would auto-transition to AVAILABLE)
    await tx.bed.update({
      where: { id: admission.bedId },
      data: { status: "CLEANING", currentAdmissionId: null },
    });

    // Optional discharge summary
    if (data.diagnosis || data.treatmentSummary) {
      await tx.dischargeSummary.create({
        data: {
          admissionId,
          diagnosis: data.diagnosis ?? "",
          treatmentSummary: data.treatmentSummary ?? "",
          followUpInstructions: data.followUpInstructions ?? "",
          signedBy: data.signedBy ?? admission.admittingDoctorId,
        },
      });
    }

    emitToRoom(`ward:${admission.wardId}`, "ipd:discharged", { id: admissionId });
    emitToRoom(`ward:${admission.wardId}`, "ipd:bed-status-changed", { bedId: admission.bedId, status: "CLEANING" });
    emitToRoom(`ward:${admission.wardId}`, "ipd:census-updated", { wardId: admission.wardId });

    return discharged;
  });
}

export async function getDischargeSummary(admissionId: string) {
  const summary = await prisma.dischargeSummary.findUnique({
    where: { admissionId },
    include: {
      admission: {
        select: { admissionNo: true, patient: { select: { uhid: true, name: true } } },
      },
    },
  });
  if (!summary) {
    // Generate on demand from admission data
    const admission = await prisma.ipdAdmission.findUnique({
      where: { id: admissionId },
      include: { patient: true },
    });
    if (!admission) throw new AppError("Admission not found", 404, undefined, "NOT_FOUND");
    return { summary: null, admission: { admissionNo: admission.admissionNo, patient: admission.patient } };
  }
  return { summary };
}
