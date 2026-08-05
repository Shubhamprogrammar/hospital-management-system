import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorize } from "../../core/middleware/authorize.js";
import {
  createDoctorHandler,
  listDoctorsHandler,
  getDoctorHandler,
  updateDoctorHandler,
  setAvailabilityHandler,
  markLeaveHandler,
  getSlotsHandler,
  deactivateDoctorHandler,
} from "./doctors.controller.js";

const doctorsRoutes = Router();

doctorsRoutes.use(authMiddleware);

// Public-ish reads (any authenticated role)
doctorsRoutes.get("/", listDoctorsHandler);
doctorsRoutes.get("/:id/slots", getSlotsHandler);
doctorsRoutes.get("/:id", getDoctorHandler);

// Admin creates/deactivates profiles
doctorsRoutes.post("/", authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"), createDoctorHandler);
doctorsRoutes.delete("/:id", authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"), deactivateDoctorHandler);

// Doctor (self) or admin manages availability/leaves; profile updates
doctorsRoutes.patch(
  "/:id",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "DOCTOR"),
  updateDoctorHandler,
);
doctorsRoutes.post(
  "/:id/availability",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "DOCTOR"),
  setAvailabilityHandler,
);
doctorsRoutes.post(
  "/:id/leave",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "DOCTOR"),
  markLeaveHandler,
);

export { doctorsRoutes };
