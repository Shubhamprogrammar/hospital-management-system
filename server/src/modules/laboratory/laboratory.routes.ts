import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorize } from "../../core/middleware/authorize.js";
import {
  listCatalogHandler,
  createLabTestHandler,
  createLabOrderHandler,
  listLabOrdersHandler,
  collectSampleHandler,
  enterResultsHandler,
  verifyResultsHandler,
  releaseReportHandler,
} from "./laboratory.controller.js";

const laboratoryRoutes = Router();

laboratoryRoutes.use(authMiddleware);

laboratoryRoutes.get("/tests", listCatalogHandler);
laboratoryRoutes.post(
  "/tests",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "PATHOLOGIST"),
  createLabTestHandler,
);
laboratoryRoutes.post("/orders", authorize("SUPER_ADMIN", "DOCTOR"), createLabOrderHandler);
laboratoryRoutes.get("/orders", listLabOrdersHandler);
laboratoryRoutes.patch(
  "/orders/:id/collect-sample",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "LAB_TECHNICIAN"),
  collectSampleHandler,
);
laboratoryRoutes.patch(
  "/orders/:id/results",
  authorize("SUPER_ADMIN", "LAB_TECHNICIAN"),
  enterResultsHandler,
);
laboratoryRoutes.patch(
  "/orders/:id/verify",
  authorize("SUPER_ADMIN", "PATHOLOGIST"),
  verifyResultsHandler,
);
laboratoryRoutes.post(
  "/orders/:id/release",
  authorize("SUPER_ADMIN", "PATHOLOGIST", "LAB_TECHNICIAN"),
  releaseReportHandler,
);

export { laboratoryRoutes };
