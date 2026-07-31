import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorize } from "../../core/middleware/authorize.js";
import {
  createWardHandler,
  listWardsHandler,
  getWardHandler,
  getWardCensusHandler,
  updateWardHandler,
  deactivateWardHandler,
} from "./wards.controller.js";

const wardsRoutes = Router();

wardsRoutes.use(authMiddleware);

wardsRoutes.post("/", authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"), createWardHandler);
wardsRoutes.get("/", listWardsHandler);
wardsRoutes.get("/:id/census", getWardCensusHandler);
wardsRoutes.get("/:id", getWardHandler);
wardsRoutes.patch("/:id", authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"), updateWardHandler);
wardsRoutes.delete("/:id", authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"), deactivateWardHandler);

export { wardsRoutes };
