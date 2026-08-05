import { api } from "@/shared/services/api";
import type { Patient, PatientDocument, PatientTimelineEntry } from "@/shared/types/domain";
import type { PaginationParams } from "@/shared/types/api";

export type PatientGender = "MALE" | "FEMALE" | "OTHER";
export type BloodGroup =
  | "A_POS" | "A_NEG" | "B_POS" | "B_NEG"
  | "AB_POS" | "AB_NEG" | "O_POS" | "O_NEG" | "UNKNOWN";

export interface RegisterPatientInput {
  name: string;
  dob: string;
  gender: PatientGender;
  phone: string;
  email?: string;
  bloodGroup?: BloodGroup;
  address?: unknown;
  emergencyContact?: unknown;
  allergies?: string[];
  chronicConditions?: string[];
  guardianPatientId?: string;
}

export function registerPatient(input: RegisterPatientInput) {
  return api.post<Patient>("/patients", input);
}

export function searchPatients(params: PaginationParams & { search?: string; phone?: string; uhid?: string }) {
  return api.list<Patient>("/patients", params);
}

export function getPatient(id: string) {
  return api.get<Patient>(`/patients/${id}`);
}

export function getPatientMe() {
  return api.get<Patient>("/patients/me");
}

export function updatePatient(
  id: string,
  input: Partial<Omit<RegisterPatientInput, "name" | "phone">> & { name?: string; phone?: string },
) {
  return api.patch<Patient>(`/patients/${id}`, input);
}

export function addPatientDocument(id: string, input: { docType: "ID_PROOF" | "INSURANCE" | "OTHER"; s3Key: string }) {
  return api.post<PatientDocument>(`/patients/${id}/documents`, input);
}

export function removePatientDocument(patientId: string, docId: string) {
  return api.delete<{ id: string; deleted: boolean }>(`/patients/${patientId}/documents/${docId}`);
}

export function mergePatients(input: { survivingPatientId: string; mergedPatientId: string; reason: string }) {
  return api.post<{ merged: boolean }>("/patients/merge", input);
}

export function getPatientTimeline(id: string) {
  return api.get<PatientTimelineEntry[]>(`/patients/${id}/timeline`);
}
