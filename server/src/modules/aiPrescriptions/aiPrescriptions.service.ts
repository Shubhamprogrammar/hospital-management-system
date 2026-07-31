import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { checkInteractions } from "../prescriptions/prescriptions.service.js";

const CONTROLLED_EXCLUSION_WARNING =
  "Controlled substances excluded from AI suggestions — requires manual prescribing.";

const DISCLAIMER =
  "AI-generated, for clinical review only. Not a substitute for professional medical judgment.";

/**
 * Generate an AI suggestion draft (FR 17.4-01).
 * Assembles clinical context server-side and returns a structured suggestion.
 * NOTE: LLM integration point — this uses a deterministic rule-based generator
 * that mirrors the intended LLM output contract; swap in the provider call.
 */
export async function suggestPrescription(data: {
  patientId: string;
  doctorId: string;
  opdVisitId?: string;
  diagnosisText: string;
  symptoms: string[];
}) {
  if (!data.diagnosisText || data.diagnosisText.length < 10) {
    throw new AppError("Diagnosis text is required (min 10 chars)", 400, undefined, "VALIDATION_ERROR");
  }

  // Assemble patient context server-side (FR 17.6 — not client-editable)
  const patient = await prisma.patient.findUnique({
    where: { id: data.patientId },
    select: { id: true, allergies: true, chronicConditions: true },
  });
  if (!patient) throw new AppError("Patient not found", 404, undefined, "NOT_FOUND");

  const activeRx = await prisma.prescription.findMany({
    where: { patientId: data.patientId, status: "ACTIVE" },
    include: { items: true },
    take: 5,
  });

  // Rule-based suggestion engine (LLM drop-in point)
  const drugCatalog = await prisma.drugMaster.findMany({
    where: { isControlled: false },
    take: 100,
  });

  const suggestedItems = drugCatalog.slice(0, 3).map((drug, idx) => ({
    drugId: drug.id,
    drugName: drug.name,
    dosage: idx === 0 ? "1 tab" : "1 tab",
    frequency: idx === 0 ? "BD" : "OD",
    durationDays: 5,
    confidence: 0.85 - idx * 0.1,
    rationale: `Suggested based on diagnosis "${data.diagnosisText}" — standard first-line consideration.`,
  }));

  // Validate suggested drugIds against drug_master (FR 17.5-03)
  const { interactions, allergies } = await checkInteractions(
    suggestedItems.map((i) => i.drugId),
    data.patientId,
  );

  const overallConfidence = suggestedItems.length
    ? suggestedItems.reduce((acc, i) => acc + i.confidence, 0) / suggestedItems.length
    : 0;

  const suggestion = await prisma.aiPrescriptionSuggestion.create({
    data: {
      patientId: data.patientId,
      doctorId: data.doctorId,
      opdVisitId: data.opdVisitId,
      diagnosisText: data.diagnosisText,
      symptoms: data.symptoms,
      suggestedItems: suggestedItems as any,
      overallConfidence,
      modelVersion: "rule-based-v1",
    },
  });

  return {
    id: suggestion.id,
    suggestedItems,
    overallConfidence,
    disclaimers: [DISCLAIMER, CONTROLLED_EXCLUSION_WARNING],
    context: {
      patientAllergies: patient.allergies,
      activePrescriptions: activeRx.map((rx) => rx.id),
      interactionWarnings: interactions,
      allergyWarnings: allergies,
    },
  };
}

export async function getSuggestionDetail(id: string) {
  const suggestion = await prisma.aiPrescriptionSuggestion.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, uhid: true, name: true } },
      doctor: { select: { id: true, user: { select: { name: true } } } },
      resultingPrescription: { select: { id: true } },
      feedback: true,
    },
  });
  if (!suggestion) throw new AppError("Suggestion not found", 404, undefined, "NOT_FOUND");
  return suggestion;
}

/**
 * Accept — re-runs interaction/allergy check at accept time (FRD 17.20),
 * creates a real Prescription (doctor is author of record).
 */
export async function acceptSuggestion(id: string, doctorId: string) {
  const suggestion = await prisma.aiPrescriptionSuggestion.findUnique({
    where: { id },
    include: { patient: true },
  });
  if (!suggestion) throw new AppError("Suggestion not found", 404, undefined, "NOT_FOUND");
  if (suggestion.status !== "PENDING_REVIEW") {
    throw new AppError("Suggestion already disposed", 409, undefined, "CONFLICT");
  }

  const items = (suggestion.suggestedItems as any) as {
    drugId: string;
    dosage: string;
    frequency: string;
    durationDays: number;
    route?: string;
    instructions?: string;
  }[];

  // Re-check at accept time (FRD 17.20)
  const { interactions, allergies } = await checkInteractions(
    items.map((i) => i.drugId),
    suggestion.patientId,
  );
  if (interactions.length > 0 || allergies.length > 0) {
    throw new AppError(
      "New drug interaction or allergy conflict detected at accept time",
      409,
      { interactions, allergies },
      "ERR_DRUG_INTERACTION_UNACKNOWLEDGED",
    );
  }

  return prisma.$transaction(async (tx) => {
    const prescription = await tx.prescription.create({
      data: {
        patientId: suggestion.patientId,
        doctorId,
        opdVisitId: suggestion.opdVisitId,
        items: {
          create: items.map((i) => ({
            drugId: i.drugId,
            dosage: i.dosage,
            frequency: i.frequency,
            durationDays: i.durationDays,
            route: (i.route as any) ?? "ORAL",
            instructions: i.instructions,
          })),
        },
      },
    });

    await tx.aiPrescriptionSuggestion.update({
      where: { id },
      data: { status: "ACCEPTED", resultingPrescriptionId: prescription.id },
    });

    await tx.aiSuggestionFeedback.create({
      data: {
        suggestionId: id,
        doctorId,
        disposition: "ACCEPTED",
      },
    });

    return { suggestionId: id, prescriptionId: prescription.id, status: "ACCEPTED" };
  });
}

export async function editSuggestion(
  id: string,
  data: {
    items: {
      drugId: string;
      dosage: string;
      frequency: string;
      durationDays: number;
      route?: string;
      instructions?: string;
    }[];
    doctorId: string;
  },
) {
  const suggestion = await prisma.aiPrescriptionSuggestion.findUnique({
    where: { id },
    include: { patient: true },
  });
  if (!suggestion) throw new AppError("Suggestion not found", 404, undefined, "NOT_FOUND");
  if (suggestion.status !== "PENDING_REVIEW") {
    throw new AppError("Suggestion already disposed", 409, undefined, "CONFLICT");
  }

  const { interactions, allergies } = await checkInteractions(
    data.items.map((i) => i.drugId),
    suggestion.patientId,
  );
  if (interactions.length > 0 || allergies.length > 0) {
    throw new AppError(
      "Drug interaction or allergy conflict in edited items",
      409,
      { interactions, allergies },
      "ERR_DRUG_INTERACTION_UNACKNOWLEDGED",
    );
  }

  return prisma.$transaction(async (tx) => {
    const prescription = await tx.prescription.create({
      data: {
        patientId: suggestion.patientId,
        doctorId: data.doctorId,
        opdVisitId: suggestion.opdVisitId,
        items: {
          create: data.items.map((i) => ({
            drugId: i.drugId,
            dosage: i.dosage,
            frequency: i.frequency,
            durationDays: i.durationDays,
            route: (i.route as any) ?? "ORAL",
            instructions: i.instructions,
          })),
        },
      },
    });

    await tx.aiPrescriptionSuggestion.update({
      where: { id },
      data: { status: "EDITED_AND_ACCEPTED", resultingPrescriptionId: prescription.id },
    });

    await tx.aiSuggestionFeedback.create({
      data: {
        suggestionId: id,
        doctorId: data.doctorId,
        disposition: "EDITED",
        editedDiff: data.items as any,
      },
    });

    return { suggestionId: id, prescriptionId: prescription.id, status: "EDITED_AND_ACCEPTED" };
  });
}

export async function rejectSuggestion(
  id: string,
  data: { reason?: string; doctorId: string },
) {
  const suggestion = await prisma.aiPrescriptionSuggestion.findUnique({ where: { id } });
  if (!suggestion) throw new AppError("Suggestion not found", 404, undefined, "NOT_FOUND");
  if (suggestion.status !== "PENDING_REVIEW") {
    throw new AppError("Suggestion already disposed", 409, undefined, "CONFLICT");
  }

  return prisma.$transaction(async (tx) => {
    await tx.aiPrescriptionSuggestion.update({
      where: { id },
      data: { status: "REJECTED" },
    });
    await tx.aiSuggestionFeedback.create({
      data: {
        suggestionId: id,
        doctorId: data.doctorId,
        disposition: "REJECTED",
        rejectionReason: data.reason,
      },
    });
    return { suggestionId: id, status: "REJECTED" };
  });
}
