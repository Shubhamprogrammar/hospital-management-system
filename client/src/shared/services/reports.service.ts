import { api } from "@/shared/services/api";
import type { ReportJob, ReportSchedule, ReportTemplate } from "@/shared/types/domain";
import type { PaginationParams } from "@/shared/types/api";

export function listReportTemplates(params: PaginationParams & { module?: string } = {}) {
  return api.list<ReportTemplate>("/reports/templates", params);
}

export function generateReport(input: { templateId: string; params?: Record<string, unknown> }) {
  return api.post<ReportJob>("/reports/generate", input);
}

export function getReportJobStatus(jobId: string) {
  return api.get<ReportJob>(`/reports/jobs/${jobId}`);
}

export function createReportSchedule(input: { templateId: string; cronExpression: string; recipients?: string[]; params?: Record<string, unknown> }) {
  return api.post<ReportSchedule>("/reports/schedule", input);
}

export function listReportSchedules() {
  return api.get<ReportSchedule[]>("/reports/schedule");
}
