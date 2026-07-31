import type { Request } from "express";
import { AuditLog } from "../../db/mongo/models/auditLog.model.js";
import { ActivityLog } from "../../db/mongo/models/activityLog.model.js";
import { logger } from "./logger.js";

export interface AuditEntry {
  actorId?: string;
  actorRole?: string;
  action: string;
  module: string;
  entityType: string;
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

/**
 * Writes an immutable audit log entry (FRD 3.5). Fire-and-forget —
 * failures are logged but never block the request (Mongo may be optional).
 */
export function writeAuditLog(entry: AuditEntry, req?: Request): void {
  const auditDoc = new AuditLog({
    actorId: entry.actorId,
    actorRole: entry.actorRole,
    action: entry.action,
    module: entry.module,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before,
    after: entry.after,
    ip: req?.ip,
    userAgent: req?.headers["user-agent"],
    requestId: (req as any)?.requestId,
    timestamp: new Date(),
  });

  auditDoc.save().catch((err: Error) => {
    logger.error("Failed to write audit log", { error: err.message, module: entry.module });
  });
}

/**
 * Writes a lighter-weight, user-facing activity log (FRD 3.6).
 */
export function writeActivityLog(
  actorId: string | undefined,
  module: string,
  message: string,
  entity?: { entityType?: string; entityId?: string; payload?: Record<string, unknown> },
): void {
  const activityDoc = new ActivityLog({
    actorId,
    module,
    entityType: entity?.entityType,
    entityId: entity?.entityId,
    message,
    payload: entity?.payload,
    timestamp: new Date(),
  });

  activityDoc.save().catch((err: Error) => {
    logger.error("Failed to write activity log", { error: err.message, module });
  });
}
