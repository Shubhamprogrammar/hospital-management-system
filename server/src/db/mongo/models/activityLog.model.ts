import { Schema, model } from "mongoose";

/**
 * Activity Log — lightweight, user-facing "recent activity" feed (FRD 3.6).
 * Used for dashboards/timelines (e.g. patient timeline, doctor activity feed).
 * Retained 12 months.
 */
export interface IActivityLog {
  actorId?: string;
  module: string;
  entityType?: string;
  entityId?: string;
  message: string;
  payload?: Record<string, unknown>;
  timestamp: Date;
}

const activityLogSchema = new Schema<IActivityLog>(
  {
    actorId: { type: String, index: true },
    module: { type: String, required: true },
    entityType: String,
    entityId: { type: String, index: true },
    message: { type: String, required: true },
    payload: Schema.Types.Mixed,
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

activityLogSchema.index({ actorId: 1, timestamp: -1 });
activityLogSchema.index({ entityType: 1, entityId: 1, timestamp: -1 });

export const ActivityLog = model<IActivityLog>("ActivityLog", activityLogSchema);
