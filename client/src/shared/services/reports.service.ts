import { api } from "@/shared/services/api";
import { buildReportSections, formatValue } from "@/shared/lib/reportResult";
import type { ReportJob, ReportSchedule, ReportTemplate } from "@/shared/types/domain";
import type { PaginationParams } from "@/shared/types/api";

export function listReportTemplates(params: PaginationParams & { module?: string } = {}) {
  return api.list<ReportTemplate>("/reports/templates", params);
}

export function generateReport(input: {
  templateId: string;
  dateFrom: string;
  dateTo: string;
  params?: Record<string, unknown>;
}) {
  return api.post<ReportJob>("/reports/generate", input);
}

export function getReportJobStatus(jobId: string) {
  return api.get<ReportJob>(`/reports/jobs/${jobId}`);
}

export function listReportJobs(limit = 50) {
  return api.get<ReportJob[]>("/reports/jobs", { limit });
}

export function deleteReportJob(jobId: string) {
  return api.delete<{ deleted: boolean }>(`/reports/jobs/${jobId}`);
}

/**
 * Downloads the report data as a CSV file via the export endpoint and triggers
 * a browser download (filename comes from the server's Content-Disposition).
 */
export async function downloadReportCsv(jobId: string) {
  const res = await api.download(`/reports/jobs/${jobId}/export`);
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match?.[1] ?? `report-${jobId}.csv`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** jsPDF's built-in fonts are latin-1 only — map common unicode to ASCII. */
function pdfSafe(value: string): string {
  return value
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, "\"")
    .replace(/•/g, "-")
    .replace(/…/g, "...")
    .replace(/₹/g, "Rs.")
    .replace(/→/g, "->")
    .replace(/[^\x00-\x7F]/g, "");
}

/**
 * Builds a branded, tabular PDF of the job's persisted result (summary metrics
 * + detail tables) and triggers a browser download. jsPDF + autotable are
 * loaded lazily so they only ship to clients that actually export a PDF.
 */
export async function downloadReportPdf(job: ReportJob) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = 22;

  const title = job.template?.name ?? "Report";
  const subtitle = `${title} — ${new Date(job.completedAt ?? job.createdAt).toLocaleDateString()}`;
  const params = (job.params ?? {}) as Record<string, unknown>;

  // Header block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59);
  doc.text(pdfSafe(title).toUpperCase(), margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(100, 116, 139);
  doc.text(pdfSafe(subtitle), margin, y);
  y += 5;
  if (params.dateFrom && params.dateTo) {
    doc.text(`Report period: ${String(params.dateFrom)} to ${String(params.dateTo)}`, margin, y);
    y += 5;
  }
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y + 1, pageWidth - margin, y + 1);
  y += 8;
  doc.setTextColor(30, 41, 59);

  const tableStyles = {
    theme: "grid" as const,
    headStyles: { fillColor: [51, 65, 85] as [number, number, number], textColor: 255, fontStyle: "bold" as const },
    alternateRowStyles: { fillColor: [243, 244, 246] as [number, number, number] },
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    margin: { left: margin, right: margin },
  };

  const sections = buildReportSections(job.result);
  const hasData = sections.summary.length > 0 || sections.tables.length > 0;

  if (!hasData) {
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139);
    doc.text("No data was produced for this report.", margin, y);
  }

  if (sections.summary.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Summary", margin, y);
    y += 5;
    autoTable(doc, {
      ...tableStyles,
      startY: y,
      head: [["Metric", "Value"]],
      body: sections.summary.map((s) => [pdfSafe(s.label), pdfSafe(formatValue(s.value))]),
      columnStyles: { 0: { cellWidth: 60, fontStyle: "bold" } },
    });
    y = finalYAfterTable(doc, y);
  }

  for (const table of sections.tables) {
    if (y > pageHeight - 50) {
      doc.addPage();
      y = 22;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(pdfSafe(table.title), margin, y);
    y += 5;
    autoTable(doc, {
      ...tableStyles,
      startY: y,
      head: [table.columns.map((c) => pdfSafe(c.header))],
      body: table.rows.map((r) => table.columns.map((c) => pdfSafe(formatValue(r[c.dataKey])))),
    });
    y = finalYAfterTable(doc, y);
  }

  // Footer page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  }

  const safeName = (job.template?.name ?? "report").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
  const date = new Date(job.createdAt).toISOString().slice(0, 10);
  doc.save(`${safeName}-${date}.pdf`);
}

/** Advance the cursor past the last rendered autotable (defensive vs. no-output tables). */
function finalYAfterTable(doc: unknown, fallbackY: number): number {
  const finalY = (doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY;
  return Math.max(finalY ?? 0, fallbackY) + 10;
}

export function createReportSchedule(input: { templateId: string; cronExpression: string; recipients?: string[]; params?: Record<string, unknown> }) {
  return api.post<ReportSchedule>("/reports/schedule", input);
}

export function listReportSchedules() {
  return api.get<ReportSchedule[]>("/reports/schedule");
}
