import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess, sendPaginated } from "../../core/utils/apiResponse.js";
import { parsePagination, buildPaginationMeta } from "../../core/utils/pagination.js";
import { AppError } from "../../core/errors/AppError.js";
import { writeAuditLog } from "../../core/utils/audit.js";
import {
  searchLogs,
  getEntityHistory,
  createExportJob,
  listAnomalyFlags,
} from "./audit.service.js";

export const searchLogsHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const pagination = parsePagination(req.query.page, req.query.limit);
  const { total, logs } = await searchLogs({
    ...pagination,
    actorId: req.query.actorId as string | undefined,
    module: req.query.module as string | undefined,
    action: req.query.action as string | undefined,
    entityType: req.query.entityType as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
  });

  // Meta-audit (FRD 29.5 BR-02): viewing audit data is itself logged
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "AUDIT_VIEWED",
      module: "audit",
      entityType: "AuditLog",
    },
    req,
  );

  sendPaginated(res, logs, buildPaginationMeta(total, pagination));
});

export const getEntityHistoryHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const logs = await getEntityHistory(req.params.entityType, req.params.entityId);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "AUDIT_VIEWED",
      module: "audit",
      entityType: "AuditLog",
      entityId: `${req.params.entityType}:${req.params.entityId}`,
    },
    req,
  );
  sendSuccess(res, logs);
});

export const exportLogsHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  if (!req.body.dateFrom || !req.body.dateTo) {
    throw new AppError("Export requires dateFrom and dateTo", 400, undefined, "VALIDATION_ERROR");
  }
  const job = await createExportJob({ ...req.body, requestedBy: actor?.id });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "AUDIT_EXPORTED",
      module: "audit",
      entityType: "AuditExportJob",
      entityId: job.id,
    },
    req,
  );
  sendSuccess(res, job, 201);
});

export const listAnomaliesHandler = catchAsync(async (req: Request, res: Response) => {
  const flags = await listAnomalyFlags();
  sendSuccess(res, flags);
});
