import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { generateNextUhid } from "../../core/utils/uhid.js";
import { destroyCloudinaryAsset } from "../../config/cloudinary.js";
import { cacheDel, cacheGet, cacheSet } from "../../config/redis.js";
import { destroyCloudinaryAsset } from "../../config/cloudinary.js";
import { ensurePatientProfile } from "../../core/utils/patientProfile.js";

/**
 * Register a new patient with UHID generation (FR 9.4-01).
 * UHID format: HMS-{YY}-{sequence}.
 */
export async function registerPatient(data: {
  name: string;
  dob: string;
  gender: "MALE" | "FEMALE" | "OTHER";
  phone: string;
  email?: string;
  bloodGroup?: string;
  address?: unknown;
  emergencyContact?: unknown;
  allergies?: string[];
  chronicConditions?: string[];
  guardianPatientId?: string;
}) {
  // Duplicate phone check (BR-02)
  const existing = await prisma.patient.findFirst({
    where: { phone: data.phone, isActive: true, deletedAt: null },
  });
  if (existing) {
    throw new AppError(
      "A patient with this phone number already exists",
      409,
      { existingUhid: existing.uhid },
      "ERR_DUPLICATE_PHONE",
    );
  }

  // Minors require a guardian (BR-03)
  const dob = new Date(data.dob);
  const age = ageInYears(dob);
  if (age < 18 && !data.guardianPatientId) {
    throw new AppError(
      "Minors (age < 18) require a linked guardian patient record",
      400,
      undefined,
      "ERR_INVALID_GUARDIAN",
    );
  }
  if (data.guardianPatientId) {
    const guardian = await prisma.patient.findFirst({
      where: { id: data.guardianPatientId, deletedAt: null },
    });
    if (!guardian) {
      throw new AppError("Guardian patient not found", 400, undefined, "ERR_INVALID_GUARDIAN");
    }
  }

  // Sequence per year: HMS-{YY}-{seq}
  const uhid = await generateNextUhid();

  return prisma.patient.create({
    data: {
      uhid,
      name: data.name,
      dob,
      gender: data.gender,
      phone: data.phone,
      email: data.email,
      bloodGroup: (data.bloodGroup as any) ?? "UNKNOWN",
      address: (data.address as any) ?? undefined,
      emergencyContact: (data.emergencyContact as any) ?? undefined,
      allergies: data.allergies ?? [],
      chronicConditions: data.chronicConditions ?? [],
      guardianPatientId: data.guardianPatientId,
    },
  });
}

export async function searchPatients(params: {
  search?: string;
  uhid?: string;
  phone?: string;
  page: number;
  limit: number;
}) {
  const where: Record<string, unknown> = { deletedAt: null };
  if (params.uhid) where.uhid = { contains: params.uhid, mode: "insensitive" };
  if (params.phone) where.phone = { contains: params.phone };
  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: "insensitive" } },
      { uhid: { contains: params.search, mode: "insensitive" } },
      { phone: { contains: params.search } },
    ];
  }

  const [total, patients] = await prisma.$transaction([
    prisma.patient.count({ where }),
    prisma.patient.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
  ]);

  return { total, patients };
}

export async function getPatientDetail(id: string) {
  const patient = await prisma.patient.findFirst({
    where: { id, deletedAt: null },
    include: {
      user: { select: { id: true, name: true, email: true } },
      guardian: { select: { id: true, uhid: true, name: true } },
      dependents: { select: { id: true, uhid: true, name: true } },
      documents: { orderBy: { createdAt: "desc" } },
      insurancePolicies: true,
      _count: {
        select: {
          appointments: true,
          opdVisits: true,
          ipdAdmissions: { where: { status: { in: ["ADMITTED", "IN_TREATMENT", "DISCHARGE_PLANNED"] } } },
          prescriptions: true,
          labOrders: true,
          bills: true,
        },
      },
    },
  });
  if (!patient) throw new AppError("Patient not found", 404, undefined, "NOT_FOUND");
  return patient;
}

export async function updatePatient(
  id: string,
  data: {
    name?: string;
    email?: string;
    bloodGroup?: string;
    address?: unknown;
    emergencyContact?: unknown;
    allergies?: string[];
    chronicConditions?: string[];
    isActive?: boolean;
  },
) {
  const existing = await prisma.patient.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError("Patient not found", 404, undefined, "NOT_FOUND");

  return prisma.patient.update({
    where: { id },
    data: {
      name: data.name,
      email: data.email,
      bloodGroup: data.bloodGroup as any,
      address: (data.address as any) ?? undefined,
      emergencyContact: (data.emergencyContact as any) ?? undefined,
      allergies: data.allergies,
      chronicConditions: data.chronicConditions,
      isActive: data.isActive,
    },
  });
}

export async function addPatientDocument(
  patientId: string,
  data: { docType: "ID_PROOF" | "INSURANCE" | "OTHER"; s3Key: string; uploadedBy?: string },
) {
  const patient = await prisma.patient.findFirst({ where: { id: patientId, deletedAt: null } });
  if (!patient) throw new AppError("Patient not found", 404, undefined, "NOT_FOUND");

  return prisma.patientDocument.create({
    data: {
      patientId,
      docType: data.docType,
      s3Key: data.s3Key,
      uploadedBy: data.uploadedBy,
    },
  });
}

/**
 * Remove a patient document and its backing file-upload record (if any).
 * Admins may remove any patient document; other roles can only remove
 * documents they uploaded themselves.
 */
export async function removePatientDocument(
  patientId: string,
  docId: string,
  actor: { id?: string; role?: string },
) {
  const doc = await prisma.patientDocument.findFirst({ where: { id: docId, patientId } });
  if (!doc) throw new AppError("Document not found", 404, undefined, "NOT_FOUND");

  const isAdmin = actor.role === "SUPER_ADMIN" || actor.role === "HOSPITAL_ADMIN";
  if (!isAdmin && doc.uploadedBy !== actor.id) {
    throw new AppError("You do not have access to this document", 403, undefined, "FORBIDDEN");
  }

  // Soft-delete the backing file-upload row if one exists (S3 tombstone).
  const file = await prisma.fileUpload.findFirst({ where: { s3Key: doc.s3Key } });
  if (file) {
    // Best-effort: delete the real asset from Cloudinary (no-op for stub rows).
    await destroyCloudinaryAsset(file.s3Key, file.resourceType);
    await prisma.fileUpload.update({
      where: { id: file.id },
      data: { status: "FAILED" },
    });
  }

  await prisma.patientDocument.delete({ where: { id: doc.id } });
  return { id: doc.id, deleted: true };
}

/**
 * Merge two duplicate patient records (FR 9.4-05). Audit-logged, irreversible.
 */
export async function mergePatients(data: {
  survivingPatientId: string;
  mergedPatientId: string;
  reason: string;
  performedBy?: string;
}) {
  if (data.survivingPatientId === data.mergedPatientId) {
    throw new AppError("Cannot merge a patient with itself", 400, undefined, "VALIDATION_ERROR");
  }

  const [surviving, merged] = await prisma.$transaction([
    prisma.patient.findFirst({ where: { id: data.survivingPatientId, deletedAt: null } }),
    prisma.patient.findFirst({ where: { id: data.mergedPatientId, deletedAt: null } }),
  ]);

  if (!surviving || !merged) {
    throw new AppError("One or both patient records not found", 404, undefined, "NOT_FOUND");
  }

  // Block merge if merged record has active IPD admission (FRD 9.20)
  const activeAdmission = await prisma.ipdAdmission.findFirst({
    where: {
      patientId: data.mergedPatientId,
      status: { in: ["ADMITTED", "IN_TREATMENT", "DISCHARGE_PLANNED"] },
    },
  });
  if (activeAdmission) {
    throw new AppError(
      "Merged patient has an active IPD admission — discharge/reassign first",
      409,
      undefined,
      "ERR_MERGE_CONFLICT",
    );
  }

  return prisma.$transaction(async (tx) => {
    // Re-point all clinical data to surviving record
    const updates = [
      tx.appointment.updateMany({ where: { patientId: merged.id }, data: { patientId: surviving.id } }),
      tx.opdVisit.updateMany({ where: { patientId: merged.id }, data: { patientId: surviving.id } }),
      tx.ipdAdmission.updateMany({ where: { patientId: merged.id }, data: { patientId: surviving.id } }),
      tx.prescription.updateMany({ where: { patientId: merged.id }, data: { patientId: surviving.id } }),
      tx.labOrder.updateMany({ where: { patientId: merged.id }, data: { patientId: surviving.id } }),
      tx.bill.updateMany({ where: { patientId: merged.id }, data: { patientId: surviving.id } }),
      tx.payment.updateMany({ where: { patientId: merged.id }, data: { patientId: surviving.id } }),
      tx.insurancePolicy.updateMany({ where: { patientId: merged.id }, data: { patientId: surviving.id } }),
      tx.patientDocument.updateMany({ where: { patientId: merged.id }, data: { patientId: surviving.id } }),
    ];
    await Promise.all(updates);

    await tx.patientMergeLog.create({
      data: {
        survivingPatientId: surviving.id,
        mergedPatientId: merged.id,
        performedBy: data.performedBy,
        reason: data.reason,
      },
    });

    await tx.patient.update({
      where: { id: merged.id },
      data: { isActive: false, deletedAt: new Date() },
    });

    return { survivingPatientId: surviving.id, mergedPatientId: merged.id };
  });
}

interface PatientTimelineEntry {
  type: string;
  referenceId: string;
  description: string;
  occurredAt: string;
}

/**
 * Aggregated patient timeline (FR 9.4-07): appointments, visits, labs,
 * prescriptions, admissions — flattened into a single reverse-chronological
 * list matching the client's `PatientTimelineEntry[]` contract.
 */
export async function getPatientTimeline(patientId: string) {
  const cacheKey = `patient:${patientId}:timeline`;
  const cached = await cacheGet(cacheKey);
  if (cached) return JSON.parse(cached);

  const [appointments, visits, labs, prescriptions, admissions] = await prisma.$transaction([
    prisma.appointment.findMany({
      where: { patientId },
      orderBy: { appointmentDate: "desc" },
      take: 50,
      select: { id: true, appointmentDate: true, status: true, mode: true, doctor: { select: { user: { select: { name: true } } } } },
    }),
    prisma.opdVisit.findMany({
      where: { patientId },
      orderBy: { checkedInAt: "desc" },
      take: 50,
      select: { id: true, tokenNumber: true, status: true, checkedInAt: true, department: { select: { name: true } } },
    }),
    prisma.labOrder.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, status: true, createdAt: true, orderTests: { include: { test: { select: { name: true } } } } },
    }),
    prisma.prescription.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, status: true, createdAt: true },
    }),
    prisma.ipdAdmission.findMany({
      where: { patientId },
      orderBy: { admittedAt: "desc" },
      take: 50,
      select: { id: true, admissionNo: true, status: true, admittedAt: true, dischargedAt: true },
    }),
  ]);

  const entries: PatientTimelineEntry[] = [
    ...appointments.map((a) => ({
      type: "APPOINTMENT",
      referenceId: a.id,
      description: `Appointment ${a.status.toLowerCase()}${a.doctor?.user?.name ? ` with ${a.doctor.user.name}` : ""}${a.mode === "TELECONSULT" ? " (teleconsult)" : ""}`,
      occurredAt: a.appointmentDate.toISOString(),
    })),
    ...visits.map((v) => ({
      type: "OPD_VISIT",
      referenceId: v.id,
      description: `OPD visit ${v.status.toLowerCase()}${v.department?.name ? ` - ${v.department.name}` : ""}${v.tokenNumber ? ` (token #${v.tokenNumber})` : ""}`,
      occurredAt: v.checkedInAt.toISOString(),
    })),
    ...labs.map((l) => ({
      type: "LAB_ORDER",
      referenceId: l.id,
      description: `Lab order ${l.status.toLowerCase()}${l.orderTests.length ? `: ${l.orderTests.map((t) => t.test?.name).filter(Boolean).join(", ")}` : ""}`,
      occurredAt: l.createdAt.toISOString(),
    })),
    ...prescriptions.map((p) => ({
      type: "PRESCRIPTION",
      referenceId: p.id,
      description: `Prescription ${p.status.toLowerCase()}`,
      occurredAt: p.createdAt.toISOString(),
    })),
    ...admissions.map((a) => ({
      type: "ADMISSION",
      referenceId: a.id,
      description: `Admission ${a.admissionNo} ${a.status.toLowerCase()}${a.dischargedAt ? " (discharged)" : ""}`,
      occurredAt: (a.dischargedAt ?? a.admittedAt).toISOString(),
    })),
  ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  await cacheSet(cacheKey, JSON.stringify(entries), 300); // 5 min TTL
  return entries;
}

export async function getPatientByUser(userId: string) {
  const patient = await prisma.patient.findFirst({
    where: { userId, deletedAt: null },
  });
  if (!patient) throw new AppError("Patient profile not found", 404, undefined, "NOT_FOUND");
  return patient;
}

/**
 * Patient self-service resolver: returns the caller's Patient profile, lazily
 * provisioning one when the account predates the signup hook or the hook failed
 * (link an existing reception-registered record by email/phone, or auto-create
 * from the account when every required field is present). Only throws when a
 * profile genuinely cannot be produced.
 */
export async function resolvePatientByUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("Patient profile not found", 404, undefined, "NOT_FOUND");

  const patient = await ensurePatientProfile({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    dateOfBirth: user.dateOfBirth,
    gender: user.gender,
  });

  if (!patient) {
    throw new AppError(
      "Patient profile not found. Complete your profile (date of birth and gender) before booking.",
      404,
      undefined,
      "NOT_FOUND",
    );
  }
  return patient;
}

export async function linkPatientToUser(patientId: string, userId: string) {
  return prisma.patient.update({
    where: { id: patientId },
    data: { userId },
  });
}

function ageInYears(dob: Date): number {
  const diff = Date.now() - dob.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}
