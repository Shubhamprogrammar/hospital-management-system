import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { emitToRoom } from "../../core/utils/socket.js";

/**
 * Drug interaction + allergy check (FR 16.4-02).
 */
export async function checkInteractions(
  drugIds: string[],
  patientId: string,
): Promise<{
  interactions: {
    drugA: string;
    drugB: string;
    severity: string;
    description?: string | null;
  }[];
  allergies: { drugId: string; allergy: string }[];
}> {
  const [patient, interactions] = await prisma.$transaction([
    prisma.patient.findUnique({ where: { id: patientId } }),
    prisma.drugInteraction.findMany({
      where: {
        OR: [
          { drugAId: { in: drugIds }, drugBId: { in: drugIds } },
          { drugBId: { in: drugIds }, drugAId: { in: drugIds } },
        ],
      },
      include: {
        drugA: { select: { id: true, name: true } },
        drugB: { select: { id: true, name: true } },
      },
    }),
  ]);

  const uniqueInteractions = interactions.filter((i) => i.drugAId !== i.drugBId);

  // Allergy check against patient's allergy list
  const allergies: { drugId: string; allergy: string }[] = [];
  if (patient?.allergies?.length) {
    const drugs = await prisma.drugMaster.findMany({
      where: { id: { in: drugIds } },
      select: { id: true, name: true, genericName: true, category: true },
    });
    for (const drug of drugs) {
      const allergyHit = patient.allergies.find(
        (a) =>
          a.toLowerCase() === drug.name.toLowerCase() ||
          a.toLowerCase() === drug.genericName?.toLowerCase() ||
          a.toLowerCase() === drug.category?.toLowerCase(),
      );
      if (allergyHit) allergies.push({ drugId: drug.id, allergy: allergyHit });
    }
  }

  return {
    interactions: uniqueInteractions.map((i) => ({
      drugA: i.drugA.name,
      drugB: i.drugB.name,
      severity: i.severity,
      description: i.description,
    })),
    allergies,
  };
}

/**
 * Create prescription with multi-drug line items (FR 16.4-01).
 * Requires acknowledgedWarnings when interactions/allergies are present.
 */
export async function createPrescription(data: {
  patientId: string;
  doctorId: string;
  opdVisitId?: string;
  ipdAdmissionId?: string;
  items: {
    drugId: string;
    dosage: string;
    frequency: string;
    durationDays: number;
    route?: string;
    instructions?: string;
  }[];
  notes?: string;
  acknowledgedWarnings?: boolean;
}) {
  if (!data.items.length) {
    throw new AppError("At least one line item is required", 400, undefined, "ERR_EMPTY_PRESCRIPTION");
  }
  for (const item of data.items) {
    if (item.durationDays <= 0) {
      throw new AppError("Duration must be > 0 days", 400, undefined, "VALIDATION_ERROR");
    }
  }

  // Validate drugs exist
  const drugIds = data.items.map((i) => i.drugId);
  const drugs = await prisma.drugMaster.findMany({
    where: { id: { in: drugIds } },
    select: { id: true, isControlled: true },
  });
  if (drugs.length !== drugIds.length) {
    throw new AppError("One or more drugs do not exist in the drug master", 400, undefined, "ERR_INVALID_DRUG");
  }

  // Interaction/allergy check (FR 16.4-02)
  const { interactions, allergies } = await checkInteractions(drugIds, data.patientId);
  const hasWarnings = interactions.length > 0 || allergies.length > 0;

  if (hasWarnings && !data.acknowledgedWarnings) {
    throw new AppError(
      "Drug interaction or allergy warnings detected — acknowledge to proceed",
      422,
      { interactions, allergies },
      "ERR_DRUG_INTERACTION_UNACKNOWLEDGED",
    );
  }

  const prescription = await prisma.$transaction(async (tx) => {
    const created = await tx.prescription.create({
      data: {
        patientId: data.patientId,
        doctorId: data.doctorId,
        opdVisitId: data.opdVisitId,
        ipdAdmissionId: data.ipdAdmissionId,
        notes: data.notes,
        items: {
          create: data.items.map((item) => ({
            drugId: item.drugId,
            dosage: item.dosage,
            frequency: item.frequency,
            durationDays: item.durationDays,
            route: (item.route as any) ?? "ORAL",
            instructions: item.instructions,
          })),
        },
      },
    });
    return created;
  });

  emitToRoom("pharmacy", "prescriptions:created", { id: prescription.id });
  return prescription;
}

export async function listPrescriptions(params: {
  patientId?: string;
  doctorId?: string;
  opdVisitId?: string;
  page: number;
  limit: number;
}) {
  const where: Record<string, unknown> = {};
  if (params.patientId) where.patientId = params.patientId;
  if (params.doctorId) where.doctorId = params.doctorId;
  if (params.opdVisitId) where.opdVisitId = params.opdVisitId;

  const [total, prescriptions] = await prisma.$transaction([
    prisma.prescription.count({ where }),
    prisma.prescription.findMany({
      where,
      include: {
        patient: { select: { id: true, uhid: true, name: true } },
        doctor: { select: { id: true, user: { select: { name: true } } } },
        items: { include: { drug: { select: { id: true, name: true, isControlled: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
  ]);

  return { total, prescriptions };
}

export async function getPrescriptionDetail(id: string) {
  const prescription = await prisma.prescription.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, uhid: true, name: true, dob: true, allergies: true } },
      doctor: { select: { id: true, user: { select: { name: true } } } },
      opdVisit: { select: { id: true, tokenNumber: true } },
      ipdAdmission: { select: { id: true, admissionNo: true } },
      supersedes: { select: { id: true, createdAt: true } },
      supersededBy: { select: { id: true, createdAt: true } },
      items: { include: { drug: { select: { id: true, name: true, genericName: true, isControlled: true, unit: true } } } },
      dispenses: { include: { items: true } },
    },
  });
  if (!prescription) throw new AppError("Prescription not found", 404, undefined, "NOT_FOUND");
  return prescription;
}

/**
 * Renew — creates a new versioned Rx referencing the original (BR-03).
 */
export async function renewPrescription(id: string, doctorId: string) {
  const original = await prisma.prescription.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!original) throw new AppError("Prescription not found", 404, undefined, "NOT_FOUND");

  const renewed = await prisma.$transaction(async (tx) => {
    const created = await tx.prescription.create({
      data: {
        patientId: original.patientId,
        doctorId,
        opdVisitId: original.opdVisitId,
        ipdAdmissionId: original.ipdAdmissionId,
        supersedesId: original.id,
        items: {
          create: original.items.map((item) => ({
            drugId: item.drugId,
            dosage: item.dosage,
            frequency: item.frequency,
            durationDays: item.durationDays,
            route: item.route,
            instructions: item.instructions,
          })),
        },
      },
    });
    await tx.prescription.update({
      where: { id: original.id },
      data: { status: "EXPIRED" },
    });
    return created;
  });

  return renewed;
}
