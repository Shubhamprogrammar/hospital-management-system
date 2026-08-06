import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { emitToRoom } from "../../core/utils/socket.js";

const REPORT_TEMPLATES = [
  { key: "revenue", module: "billing", description: "Revenue by date range" },
  { key: "occupancy", module: "ipd", description: "Ward/bed occupancy" },
  { key: "doctor-productivity", module: "opd", description: "Visits per doctor" },
  { key: "lab-tat", module: "laboratory", description: "Lab turnaround times" },
  { key: "inventory-valuation", module: "inventory", description: "Stock valuation" },
];

/**
 * Upsert a real ReportTemplate row for a template key. ReportJob/
 * ReportSchedule.templateId are FKs to ReportTemplate — the old
 * "static-" + key placeholder never referenced an existing row.
 *
 * Uses an upsert on the unique name so concurrent first-time generations
 * for the same key can't create duplicate template rows.
 */
async function ensureReportTemplate(key: string) {
  const catalog = REPORT_TEMPLATES.find((t) => t.key === key);
  if (!catalog) {
    throw new AppError("Unknown report template", 400, undefined, "ERR_UNAUTHORIZED_REPORT_TYPE");
  }
  return prisma.reportTemplate.upsert({
    where: { name: catalog.key },
    update: {},
    create: { name: catalog.key, module: catalog.module, description: catalog.description },
  });
}

/**
 * Resolve a template row from either its DB id (what the client sends) or its
 * catalog key (what the Postman samples send). Returns the row and its key.
 */
async function resolveTemplate(idOrKey: string) {
  const row = await prisma.reportTemplate.findFirst({
    where: { OR: [{ id: idOrKey }, { name: idOrKey }] },
  });
  const catalog = row ? REPORT_TEMPLATES.find((t) => t.key === row.name) : undefined;
  if (!row || !catalog) {
    throw new AppError("Unknown report template", 400, undefined, "ERR_UNAUTHORIZED_REPORT_TYPE");
  }
  return { row, key: catalog.key };
}

/**
 * List report templates. Returns real ReportTemplate rows (with `id` and
 * `name`) so the client can reference templates by id when generating/scheduling.
 */
export async function listTemplates() {
  await Promise.all(REPORT_TEMPLATES.map((t) => ensureReportTemplate(t.key)));
  return prisma.reportTemplate.findMany({
    where: { name: { in: REPORT_TEMPLATES.map((t) => t.key) } },
    orderBy: { name: "asc" },
  });
}

/**
 * Generate a report (FR 23.4-01). Synchronous for small reports;
 * large ones enqueue a report_jobs row for async processing.
 */
export async function generateReport(data: {
  templateId?: string;
  templateKey?: string;
  requestedBy?: string;
  dateFrom: string;
  dateTo: string;
  departmentId?: string;
  doctorId?: string;
}) {
  const rangeDays = (new Date(data.dateTo).getTime() - new Date(data.dateFrom).getTime()) / 86400000;
  if (Number.isNaN(rangeDays) || rangeDays < 0) {
    throw new AppError("Invalid report date range", 400, undefined, "ERR_INVALID_DATE_RANGE");
  }
  if (rangeDays > 365) {
    throw new AppError(
      "Date range exceeds 1 year — use the async/scheduled path",
      400,
      undefined,
      "ERR_DATE_RANGE_TOO_LARGE",
    );
  }

  const idOrKey = data.templateId ?? data.templateKey;
  if (!idOrKey) throw new AppError("Unknown report template", 400, undefined, "ERR_UNAUTHORIZED_REPORT_TYPE");
  const { row, key } = await resolveTemplate(idOrKey);

  // Create a job row (FR 23.7-02) against a real template record
  const job = await prisma.reportJob.create({
    data: {
      templateId: row.id,
      requestedBy: data.requestedBy,
      params: data as any,
      status: "PROCESSING",
    },
  });

  try {
    // Persist the computed output on the job so the result can be viewed or
    // exported later — previously it was computed and immediately discarded.
    const result = await executeReport(key, data);
    await prisma.reportJob.update({
      where: { id: job.id },
      data: { status: "COMPLETED", completedAt: new Date(), result: result as object },
    });
    emitToRoom("reports", "reports:job-completed", { jobId: job.id });
    return getJobStatus(job.id);
  } catch (error) {
    await prisma.reportJob.update({ where: { id: job.id }, data: { status: "FAILED" } });
    throw new AppError("Report generation failed", 500, undefined, "ERR_REPORT_GENERATION_FAILED");
  }
}

/**
 * Recent report jobs (most recent first) so the UI can restore jobs after a
 * page reload, not just for the current session.
 */
export async function listJobs(limit = 50) {
  const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
  return prisma.reportJob.findMany({
    include: { template: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function getJobStatus(jobId: string) {
  const job = await prisma.reportJob.findUnique({
    where: { id: jobId },
    include: { template: { select: { id: true, name: true } } },
  });
  if (!job) throw new AppError("Report job not found", 404, undefined, "NOT_FOUND");
  return job;
}

/** Permanently removes a report job and its persisted result. */
export async function deleteReportJob(jobId: string) {
  // deleteMany is race-safe (a concurrent delete can't throw P2025) — the
  // same pattern used by the chat/uploads modules.
  const { count } = await prisma.reportJob.deleteMany({ where: { id: jobId } });
  if (count === 0) throw new AppError("Report job not found", 404, undefined, "NOT_FOUND");
  return { deleted: true };
}

/**
 * Build a downloadable CSV from a completed job's persisted result. Flattens
 * the nested aggregate shapes the templates produce (e.g. `_count._all`) into
 * tabular rows so the file opens cleanly in Excel/Sheets.
 */
export async function exportReportCsv(jobId: string): Promise<{ filename: string; csv: string }> {
  const job = await prisma.reportJob.findUnique({
    where: { id: jobId },
    include: { template: { select: { name: true } } },
  });
  if (!job) throw new AppError("Report job not found", 404, undefined, "NOT_FOUND");
  if (job.status !== "COMPLETED" || !job.result) {
    throw new AppError("Report has no generated data yet", 400, undefined, "ERR_REPORT_NOT_READY");
  }

  const safeName = job.template.name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
  const date = new Date(job.createdAt).toISOString().slice(0, 10);
  const csv = resultToCsv(job.result as Record<string, unknown>);
  return { filename: `${safeName}-${date}.csv`, csv };
}

/** Escape a value for a CSV cell (quotes + doubles embedded quotes). */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, "\"\"")}"` : s;
}

function rowsToCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((h) => csvCell(row[h])).join(","));
  return lines.join("\r\n");
}

/** Flatten a nested Prisma aggregate row (`_count: { _all: 3 }`) one level deep. */
function flattenAggregateRow(row: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const inner = value as Record<string, unknown>;
      const innerKeys = Object.keys(inner);
      if (innerKeys.length === 1) flat[key.replace(/^_/, "")] = Object.values(inner)[0];
      else for (const [innerKey, innerValue] of Object.entries(inner)) flat[`${key}.${innerKey}`] = innerValue;
    } else {
      flat[key] = value;
    }
  }
  return flat;
}

/**
 * Convert a report result object into CSV text. Scalar metrics become a
 * `Summary` section; array-valued fields (census/visits/stockSummary) become
 * their own detail sections — this stays generic across all templates.
 */
export function resultToCsv(result: Record<string, unknown>): string {
  const summary: Array<Record<string, unknown>> = [];
  const sections: string[] = [];

  for (const [key, value] of Object.entries(result)) {
    if (Array.isArray(value)) {
      const rows = value.map((item) =>
        item && typeof item === "object"
          ? flattenAggregateRow(item as Record<string, unknown>)
          : { value: item },
      );
      sections.push(`${key}\r\n${rowsToCsv(rows)}`);
    } else if (value !== null && typeof value === "object") {
      for (const [innerKey, innerValue] of Object.entries(value as Record<string, unknown>)) {
        summary.push({ Metric: `${key}.${innerKey}`, Value: innerValue });
      }
    } else {
      summary.push({ Metric: key, Value: value });
    }
  }

  if (summary.length > 0) sections.unshift(`Summary\r\n${rowsToCsv(summary)}`);
  return sections.join("\r\n\r\n");
}

export async function createSchedule(data: {
  templateId?: string;
  templateKey?: string;
  cronExpression: string;
  recipients: string[];
  createdBy?: string;
  params?: unknown;
}) {
  const idOrKey = data.templateId ?? data.templateKey;
  if (!idOrKey) throw new AppError("Unknown report template", 400, undefined, "ERR_UNAUTHORIZED_REPORT_TYPE");
  const { row } = await resolveTemplate(idOrKey);
  const schedule = await prisma.reportSchedule.create({
    data: {
      templateId: row.id,
      cronExpression: data.cronExpression,
      recipients: data.recipients,
      createdBy: data.createdBy,
      params: (data.params as any) ?? {},
    },
  });
  return schedule;
}

export async function listSchedules() {
  return prisma.reportSchedule.findMany({
    include: { template: true },
    orderBy: { createdAt: "desc" },
  });
}

async function executeReport(templateKey: string, params: { dateFrom: string; dateTo: string; departmentId?: string; doctorId?: string }) {
  const from = new Date(params.dateFrom);
  const to = new Date(params.dateTo);

  switch (templateKey) {
    case "revenue": {
      const bills = await prisma.bill.findMany({
        where: {
          finalizedAt: { gte: from, lte: to },
          status: { in: ["FINALIZED", "PAID", "PARTIALLY_PAID"] },
        },
        select: { totalAmount: true, finalizedAt: true },
      });
      return {
        totalRevenue: bills.reduce((acc, b) => acc + Number(b.totalAmount), 0),
        billCount: bills.length,
      };
    }
    case "occupancy": {
      const census = await prisma.bed.groupBy({
        by: ["wardId", "status"],
        _count: { _all: true },
      });
      return { census };
    }
    case "doctor-productivity": {
      const visits = await prisma.opdVisit.groupBy({
        by: ["doctorId"],
        where: { checkedInAt: { gte: from, lte: to } },
        _count: { _all: true },
      });
      return { visits };
    }
    case "lab-tat": {
      const orders = await prisma.labOrder.count({
        where: { createdAt: { gte: from, lte: to } },
      });
      return { totalOrders: orders };
    }
    case "inventory-valuation": {
      const ledger = await prisma.inventoryStockLedger.groupBy({
        by: ["itemId"],
        _sum: { quantityDelta: true },
      });
      return { stockSummary: ledger };
    }
    default:
      throw new AppError("Unsupported template", 400, undefined, "ERR_UNAUTHORIZED_REPORT_TYPE");
  }
}
