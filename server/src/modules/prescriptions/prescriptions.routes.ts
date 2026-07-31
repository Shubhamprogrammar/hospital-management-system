import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorize } from "../../core/middleware/authorize.js";
import {
  createPrescriptionHandler,
  listPrescriptionsHandler,
  getPrescriptionHandler,
  renewPrescriptionHandler,
  interactionsCheckHandler,
} from "./prescriptions.controller.js";

const prescriptionsRoutes = Router();

prescriptionsRoutes.use(authMiddleware);

prescriptionsRoutes.post(
  "/interactions-check",
  authorize("SUPER_ADMIN", "DOCTOR"),
  interactionsCheckHandler,
);
prescriptionsRoutes.post("/", authorize("SUPER_ADMIN", "DOCTOR"), createPrescriptionHandler);
prescriptionsRoutes.get("/", listPrescriptionsHandler);
prescriptionsRoutes.get("/:id/pdf", getPrescriptionHandler);
prescriptionsRoutes.post("/:id/renew", authorize("SUPER_ADMIN", "DOCTOR"), renewPrescriptionHandler);
prescriptionsRoutes.get("/:id", getPrescriptionHandler);

export { prescriptionsRoutes };
