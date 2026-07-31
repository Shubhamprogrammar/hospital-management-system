import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorize } from "../../core/middleware/authorize.js";
import {
  listTemplatesHandler,
  generateReportHandler,
  getJobStatusHandler,
  createScheduleHandler,
  listSchedulesHandler,
} from "./reports.controller.js";

const reportsRoutes = Router();

reportsRoutes.use(authMiddleware);

reportsRoutes.get("/templates", listTemplatesHandler);
reportsRoutes.post(
  "/generate",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "BILLING_STAFF", "INVENTORY_MANAGER", "DOCTOR"),
  generateReportHandler,
);
reportsRoutes.get("/jobs/:id", getJobStatusHandler);
reportsRoutes.post("/schedule", authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"), createScheduleHandler);
reportsRoutes.get("/schedule", authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"), listSchedulesHandler);

export { reportsRoutes };
