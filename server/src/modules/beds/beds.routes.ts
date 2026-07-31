import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorize } from "../../core/middleware/authorize.js";
import {
  createBedHandler,
  listBedsHandler,
  getBedHandler,
  changeBedStatusHandler,
  removeBedHandler,
} from "./beds.controller.js";

const bedsRoutes = Router();

bedsRoutes.use(authMiddleware);

bedsRoutes.post("/", authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"), createBedHandler);
bedsRoutes.get("/", listBedsHandler);
bedsRoutes.get("/:id", getBedHandler);
bedsRoutes.patch(
  "/:id/status",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "NURSE"),
  changeBedStatusHandler,
);
bedsRoutes.delete("/:id", authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"), removeBedHandler);

export { bedsRoutes };
