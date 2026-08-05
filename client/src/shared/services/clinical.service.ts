import { api } from "@/shared/services/api";
import type {
  AiPrescriptionSuggestion,
  InteractionsCheckResult,
  LabOrder,
  LabOrderStatus,
  LabTest,
  Prescription,
} from "@/shared/types/domain";
import type { PaginationParams } from "@/shared/types/api";

// ---------- Prescriptions ----------

export interface PrescriptionItemInput {
  drugId: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  route?: "ORAL" | "IV" | "IM" | "TOPICAL" | "OTHER";
  instructions?: string;
}

export interface CreatePrescriptionInput {
  patientId: string;
  doctorId: string;
  opdVisitId?: string;
  ipdAdmissionId?: string;
  notes?: string;
  items: PrescriptionItemInput[];
}

export function createPrescription(input: CreatePrescriptionInput) {
  return api.post<Prescription>("/prescriptions", input);
}

export function listPrescriptions(params: PaginationParams & { patientId?: string; status?: string } = {}) {
  return api.list<Prescription>("/prescriptions", params);
}

export function getPrescription(id: string) {
  return api.get<Prescription>(`/prescriptions/${id}`);
}

export function getPrescriptionPdf(id: string) {
  return api.get<{ url: string }>(`/prescriptions/${id}/pdf`);
}

export function renewPrescription(id: string, input?: { doctorId?: string; notes?: string }) {
  return api.post<Prescription>(`/prescriptions/${id}/renew`, input);
}

export function checkInteractions(input: { drugIds: string[] }) {
  return api.post<InteractionsCheckResult>("/prescriptions/interactions-check", input);
}

// NOTE: No public drug-master catalog endpoint exists in the backend yet.
// The prescription form therefore takes a free-text drug name and passes it as
// `drugId` — this is a known contract limitation until the backend exposes a
// catalog endpoint (see TODO in app/prescriptions/page.tsx).

// ---------- AI Prescriptions ----------

export interface SuggestInput {
  patientId: string;
  doctorId: string;
  opdVisitId?: string;
  diagnosisText: string;
  symptoms?: string[];
}

export interface AiSuggestedItem {
  drugId: string;
  drugName: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  confidence: number;
  rationale?: string;
}

/** Response shape of POST /ai-prescriptions/suggest (matches aiPrescriptions.service.ts). */
export interface AiSuggestionResult {
  id: string;
  suggestedItems: AiSuggestedItem[];
  overallConfidence: number;
  disclaimers: string[];
  context: {
    patientAllergies: string[];
    activePrescriptions: string[];
    interactionWarnings: unknown[];
    allergyWarnings: unknown[];
  };
}

export interface AiDisposalResult {
  suggestionId: string;
  prescriptionId?: string;
  status: string;
}

export function suggestAiPrescription(input: Omit<SuggestInput, "doctorId">) {
  // doctorId is resolved server-side from the session (resolveDoctorId).
  return api.post<AiSuggestionResult>("/ai-prescriptions/suggest", input);
}

export function getAiSuggestion(id: string) {
  return api.get<AiPrescriptionSuggestion>(`/ai-prescriptions/${id}`);
}

export function acceptAiSuggestion(id: string) {
  return api.post<AiDisposalResult>(`/ai-prescriptions/${id}/accept`);
}

export function editAiSuggestion(
  id: string,
  input: {
    items: Array<{
      drugId: string;
      dosage: string;
      frequency: string;
      durationDays: number;
      route?: string;
      instructions?: string;
    }>;
  },
) {
  return api.patch<AiDisposalResult>(`/ai-prescriptions/${id}/edit`, input);
}

export function rejectAiSuggestion(id: string, input?: { reason?: string }) {
  return api.post<AiDisposalResult>(`/ai-prescriptions/${id}/reject`, input);
}

// ---------- Laboratory ----------

export interface CreateLabOrderInput {
  patientId: string;
  doctorId: string;
  opdVisitId?: string;
  ipdAdmissionId?: string;
  testIds: string[];
}

export function listLabTests(params: PaginationParams & { search?: string; category?: string } = {}) {
  return api.list<LabTest>("/lab/tests", params);
}

export function createLabOrder(input: CreateLabOrderInput) {
  return api.post<LabOrder>("/lab/orders", input);
}

export function listLabOrders(params: PaginationParams & { status?: LabOrderStatus; patientId?: string } = {}) {
  return api.list<LabOrder>("/lab/orders", params);
}

export function collectSample(orderId: string) {
  return api.patch<LabOrder>(`/lab/orders/${orderId}/collect-sample`);
}

export function enterResults(orderId: string, input: { results: Array<{ testParameterId: string; value: string }> }) {
  return api.patch<LabOrder>(`/lab/orders/${orderId}/results`, input);
}

export function verifyLabResults(orderId: string) {
  return api.patch<LabOrder>(`/lab/orders/${orderId}/verify`);
}

export function releaseReport(orderId: string) {
  return api.post<LabOrder>(`/lab/orders/${orderId}/release`);
}
