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

export async function listTemplates() {
  return REPORT_TEMPLATES;
}

/**
 * Resolve a real ReportTemplate row for a template key, creating it on first
 * use. ReportJob/ReportSchedule.templateId are FKs to ReportTemplate — the
 * old "static-" + key placeholder never referenced an existing row.
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
 * Generate a report (FR 23.4-01). Synchronous for small reports;
 * large ones enqueue a report_jobs row for async processing.
 */
export async function generateReport(data: {
  templateKey: string;
  requestedBy?: string;
  dateFrom: string;
  dateTo: string;
  departmentId?: string;
  doctorId?: string;
}) {
  const rangeDays = (new Date(data.dateTo).getTime() - new Date(data.dateFrom).getTime()) / 86400000;
  if (rangeDays > 365) {
    throw new AppError(
      "Date range exceeds 1 year — use the async/scheduled path",
      400,
      undefined,
      "ERR_DATE_RANGE_TOO_LARGE",
    );
  }

  const template = REPORT_TEMPLATES.find((t) => t.key === data.templateKey);
  if (!template) throw new AppError("Unknown report template", 400, undefined, "ERR_UNAUTHORIZED_REPORT_TYPE");

  // Create a job row (FR 23.7-02) against a real template record
  const dbTemplate = await ensureReportTemplate(template.key);
  const job = await prisma.reportJob.create({
    data: {
      templateId: dbTemplate.id,
      requestedBy: data.requestedBy,
      params: data as any,
      status: "PROCESSING",
    },
  });

  try {
    const result = await executeReport(template.key, data);
    emitToRoom("reports", "reports:job-completed", { jobId: job.id });
    await prisma.reportJob.update({ where: { id: job.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    return { jobId: job.id, data: result };
  } catch (error) {
    await prisma.reportJob.update({ where: { id: job.id }, data: { status: "FAILED" } });
    throw new AppError("Report generation failed", 500, undefined, "ERR_REPORT_GENERATION_FAILED");
  }
}

export async function getJobStatus(jobId: string) {
  const job = await prisma.reportJob.findUnique({ where: { id: jobId } });
  if (!job) throw new AppError("Report job not found", 404, undefined, "NOT_FOUND");
  return job;
}

export async function createSchedule(data: {
  templateKey: string;
  cronExpression: string;
  recipients: string[];
  createdBy?: string;
  params?: unknown;
}) {
  const dbTemplate = await ensureReportTemplate(data.templateKey);
  const schedule = await prisma.reportSchedule.create({
    data: {
      templateId: dbTemplate.id,
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
