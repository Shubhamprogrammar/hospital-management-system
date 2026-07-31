import { Schema, model } from "mongoose";

/**
 * Audit Log — immutable compliance trail (FRD 3.5).
 * Written synchronously by every mutating API.
 */
export interface IAuditLog {
  actorId?: string;
  actorRole?: string;
  action: string; // CREATE | UPDATE | DELETE | STATUS_CHANGE | LOGIN | EXPORT ...
  module: string;
  entityType: string;
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  timestamp: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actorId: { type: String, index: true },
    actorRole: String,
    action: { type: String, required: true, index: true },
    module: { type: String, required: true, index: true },
    entityType: { type: String, required: true, index: true },
    entityId: { type: String, index: true },
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    ip: String,
    userAgent: String,
    requestId: String,
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

auditLogSchema.index({ module: 1, action: 1, timestamp: -1 });
auditLogSchema.index({ actorId: 1, timestamp: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, timestamp: -1 });

export const AuditLog = model<IAuditLog>("AuditLog", auditLogSchema);
