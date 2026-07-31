import { AuditLog } from "../../db/mongo/models/auditLog.model.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import type { Pagination } from "../../core/utils/pagination.js";

export async function searchLogs(params: {
  actorId?: string;
  module?: string;
  action?: string;
  entityType?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  limit: number;
} & Pagination) {
  const filter: Record<string, unknown> = {};
  if (params.actorId) filter.actorId = params.actorId;
  if (params.module) filter.module = params.module;
  if (params.action) filter.action = params.action;
  if (params.entityType) filter.entityType = params.entityType;
  if (params.dateFrom || params.dateTo) {
    filter.timestamp = {
      ...(params.dateFrom ? { $gte: new Date(params.dateFrom) } : {}),
      ...(params.dateTo ? { $lte: new Date(params.dateTo) } : {}),
    };
  }

  const [total, logs] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter)
      .sort({ timestamp: -1 })
      .skip(params.skip)
      .limit(params.limit)
      .lean(),
  ]);

  return { total, logs };
}

export async function getEntityHistory(entityType: string, entityId: string) {
  return AuditLog.find({ entityType, entityId })
    .sort({ timestamp: 1 })
    .lean();
}

export async function createExportJob(data: {
  dateFrom: string;
  dateTo: string;
  filters?: Record<string, unknown>;
  requestedBy?: string;
}) {
  const rangeDays = (new Date(data.dateTo).getTime() - new Date(data.dateFrom).getTime()) / 86400000;
  if (rangeDays > 365) {
    throw new AppError(
      "Export range too large — max 1 year per export",
      400,
      undefined,
      "ERR_EXPORT_RANGE_TOO_LARGE",
    );
  }

  return prisma.auditExportJob.create({
    data: {
      requestedBy: data.requestedBy,
      filters: (data.filters ?? {}) as any,
      status: "QUEUED",
    },
  });
}

export async function listAnomalyFlags() {
  // anomaly flags live in Mongo audit_anomaly_flags (FRD 29.10);
  // basic implementation over audit_logs
  return AuditLog.aggregate([
    {
      $group: {
        _id: { actorId: "$actorId", action: "$action", module: "$module" },
        count: { $sum: 1 },
        lastSeen: { $max: "$timestamp" },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 20 },
  ]).exec();
}
