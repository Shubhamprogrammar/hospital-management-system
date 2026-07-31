import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorize } from "../../core/middleware/authorize.js";
import {
  searchLogsHandler,
  getEntityHistoryHandler,
  exportLogsHandler,
  listAnomaliesHandler,
} from "./audit.controller.js";

const auditRoutes = Router();

auditRoutes.use(authMiddleware);

// SUPER_ADMIN / HOSPITAL_ADMIN only (FRD 29.21)
auditRoutes.get("/logs", authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"), searchLogsHandler);
auditRoutes.get(
  "/logs/:entityType/:entityId",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"),
  getEntityHistoryHandler,
);
auditRoutes.post("/export", authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"), exportLogsHandler);
auditRoutes.get("/anomalies", authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"), listAnomaliesHandler);

export { auditRoutes };
