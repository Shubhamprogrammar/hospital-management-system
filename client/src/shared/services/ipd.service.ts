import { api } from "@/shared/services/api";
import type {
  Bed,
  DischargeSummary,
  IpdAdmission,
  IpdRound,
  IpdVital,
  Ward,
  WardCensus,
} from "@/shared/types/domain";
import type { PaginationParams } from "@/shared/types/api";

// ---------- IPD ----------

export interface AdmitPatientInput {
  patientId: string;
  admittingDoctorId: string;
  wardId: string;
  bedId: string;
  admissionType: "EMERGENCY" | "REFERRAL" | "DIRECT";
  referredFromVisitId?: string;
}

export function admitPatient(input: AdmitPatientInput) {
  return api.post<IpdAdmission>("/ipd/admissions", input);
}

export function listAdmissions(params: PaginationParams & { status?: string; wardId?: string; search?: string } = {}) {
  return api.list<IpdAdmission>("/ipd/admissions", params);
}

export function getAdmission(id: string) {
  return api.get<IpdAdmission>(`/ipd/admissions/${id}`);
}

export function addIpdRound(admissionId: string, input: { notes: string }) {
  return api.post<IpdRound>(`/ipd/admissions/${admissionId}/rounds`, input);
}

export function chartIpdVitals(admissionId: string, input: VitalsInput) {
  return api.post<IpdVital>(`/ipd/admissions/${admissionId}/vitals`, input);
}

export function transferAdmission(admissionId: string, input: { toBedId: string; reason?: string }) {
  return api.post<IpdAdmission>(`/ipd/admissions/${admissionId}/transfer`, input);
}

export function dischargePatient(admissionId: string, input: { diagnosis?: string; dischargeType?: string }) {
  return api.patch<IpdAdmission>(`/ipd/admissions/${admissionId}/discharge`, input);
}

export function getDischargeSummary(admissionId: string) {
  return api.get<DischargeSummary>(`/ipd/admissions/${admissionId}/discharge-summary`);
}

// ---------- Wards ----------

export interface CreateWardInput {
  name: string;
  wardType: "GENERAL" | "ICU" | "ICCU" | "PEDIATRIC" | "MATERNITY" | "ISOLATION";
  departmentId?: string;
  floor: string;
  nursePatientRatio?: string;
}

export function listWards(params: PaginationParams & { search?: string } = {}) {
  return api.list<Ward>("/wards", params);
}

export function getWard(id: string) {
  return api.get<Ward>(`/wards/${id}`);
}

export function createWard(input: CreateWardInput) {
  return api.post<Ward>("/wards", input);
}

export function updateWard(id: string, input: Partial<CreateWardInput>) {
  return api.patch<Ward>(`/wards/${id}`, input);
}

export function deactivateWard(id: string) {
  return api.delete<{ id: string }>(`/wards/${id}`);
}

export function getWardCensus(id: string) {
  return api.get<WardCensus>(`/wards/${id}/census`);
}

// ---------- Beds ----------

export interface CreateBedInput {
  wardId: string;
  bedNumber: string;
  bedType: "GENERAL" | "ICU" | "ISOLATION";
}

export function listBeds(params: PaginationParams & { wardId?: string; status?: string; search?: string } = {}) {
  return api.list<Bed>("/beds", params);
}

export function getBed(id: string) {
  return api.get<Bed>(`/beds/${id}`);
}

export function createBed(input: CreateBedInput) {
  return api.post<Bed>("/beds", input);
}

export function changeBedStatus(id: string, input: { status: "AVAILABLE" | "OCCUPIED" | "CLEANING" | "MAINTENANCE" | "RESERVED" }) {
  return api.patch<Bed>(`/beds/${id}/status`, input);
}

export function removeBed(id: string) {
  return api.delete<{ id: string }>(`/beds/${id}`);
}

// Shared vitals input shape
export interface VitalsInput {
  bpSystolic?: number;
  bpDiastolic?: number;
  pulse?: number;
  temperature?: number;
  spo2?: number;
  weight?: number;
  height?: number;
}
