import { api } from "@/shared/services/api";
import type {
  AuditAnomaly,
  AuditLog,
  BusinessRule,
  FeatureFlag,
  FileUpload,
  HospitalProfile,
  IntegrationCredential,
  IntegrationProvider,
  PresignResponse,
} from "@/shared/types/domain";
import type { PaginationParams } from "@/shared/types/api";

// ---------- Uploads ----------

export function presignUpload(input: { filename: string; mimeType: string; sizeBytes: number; context: string }) {
  return api.post<PresignResponse>("/uploads/presign", input);
}

export function confirmUpload(id: string) {
  return api.post<FileUpload>(`/uploads/${id}/confirm`);
}

export function getDownloadUrl(id: string) {
  return api.get<{ url: string }>(`/uploads/${id}/download-url`);
}

export function deleteUpload(id: string) {
  return api.delete<{ deleted: boolean }>(`/uploads/${id}`);
}

// ---------- Audit ----------

export function searchAuditLogs(params: PaginationParams & { action?: string; entityType?: string; search?: string } = {}) {
  return api.list<AuditLog>("/audit/logs", params);
}

export function getEntityHistory(entityType: string, entityId: string) {
  return api.get<AuditLog[]>(`/audit/logs/${entityType}/${entityId}`);
}

export function exportAuditLogs(input: { filters?: Record<string, unknown> }) {
  return api.post<{ jobId: string }>("/audit/export", input);
}

export function listAuditAnomalies(params: PaginationParams & { severity?: string } = {}) {
  return api.list<AuditAnomaly>("/audit/anomalies", params);
}

// ---------- Settings ----------

export function getHospitalProfile() {
  return api.get<HospitalProfile>("/settings/hospital-profile");
}

export function updateHospitalProfile(input: Partial<Omit<HospitalProfile, "id" | "createdAt" | "updatedAt">>) {
  return api.patch<HospitalProfile>("/settings/hospital-profile", input);
}

export function getBusinessRules() {
  return api.get<BusinessRule[]>("/settings/business-rules");
}

export function updateBusinessRule(key: string, input: { value: unknown }) {
  return api.patch<BusinessRule>(`/settings/business-rules/${key}`, input);
}

export function listFeatureFlags() {
  return api.get<FeatureFlag[]>("/settings/feature-flags");
}

export function toggleFeatureFlag(key: string, input: { isEnabled: boolean }) {
  return api.patch<FeatureFlag>(`/settings/feature-flags/${key}`, input);
}

export function getIntegrationCredentials() {
  return api.get<IntegrationCredential[]>("/settings/integrations");
}

export function setIntegrationCredential(provider: IntegrationProvider, input: { config: Record<string, string> }) {
  return api.put<IntegrationCredential>(`/settings/integrations/${provider}`, input);
}
