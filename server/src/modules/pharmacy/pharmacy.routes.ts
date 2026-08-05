import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorize } from "../../core/middleware/authorize.js";
import {
  getQueueHandler,
  createDispenseHandler,
  recordSubstitutionHandler,
  getDispenseHandler,
  processReturnHandler,
  suggestBatchesHandler,
  listDispensesHandler,
  listDrugsHandler,
} from "./pharmacy.controller.js";

const pharmacyRoutes = Router();

pharmacyRoutes.use(authMiddleware);

pharmacyRoutes.get("/queue", getQueueHandler);
pharmacyRoutes.get("/drugs", listDrugsHandler);
pharmacyRoutes.get("/dispenses", listDispensesHandler);
pharmacyRoutes.get("/batches/suggest", suggestBatchesHandler);
pharmacyRoutes.post("/dispenses", authorize("SUPER_ADMIN", "PHARMACIST"), createDispenseHandler);
pharmacyRoutes.get("/dispenses/:id", getDispenseHandler);
pharmacyRoutes.post(
  "/dispenses/:id/substitute",
  authorize("SUPER_ADMIN", "PHARMACIST"),
  recordSubstitutionHandler,
);
pharmacyRoutes.post("/returns", authorize("SUPER_ADMIN", "PHARMACIST"), processReturnHandler);

export { pharmacyRoutes };
