import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorize, authorizeExact } from "../../core/middleware/authorize.js";
import {
  createDoctorHandler,
  listDoctorsHandler,
  getDoctorHandler,
  updateDoctorHandler,
  setAvailabilityHandler,
  markLeaveHandler,
  getSlotsHandler,
  deactivateDoctorHandler,
  getMeHandler,
} from "./doctors.controller.js";

const doctorsRoutes = Router();

doctorsRoutes.use(authMiddleware);

// Public-ish reads (any authenticated role)
doctorsRoutes.get("/me", getMeHandler);
doctorsRoutes.get("/", listDoctorsHandler);
doctorsRoutes.get("/:id/slots", getSlotsHandler);
doctorsRoutes.get("/:id", getDoctorHandler);

// Profile creation:
//  - HOSPITAL_ADMIN creates profiles for any DOCTOR-role user.
//  - A DOCTOR self-registers by creating their OWN profile (controller pins
//    userId to the authenticated user).
//  - SUPER_ADMIN is deliberately excluded (view-only, per product decision).
doctorsRoutes.post(
  "/",
  authorizeExact("HOSPITAL_ADMIN", "DOCTOR"),
  createDoctorHandler,
);
doctorsRoutes.delete("/:id", authorizeExact("HOSPITAL_ADMIN"), deactivateDoctorHandler);

// Doctor (self) or hospital admin manages availability/leaves; profile updates
// (controller enforces that DOCTOR role only touches their own profile).
doctorsRoutes.patch(
  "/:id",
  authorizeExact("HOSPITAL_ADMIN", "DOCTOR"),
  updateDoctorHandler,
);
doctorsRoutes.post(
  "/:id/availability",
  authorizeExact("HOSPITAL_ADMIN", "DOCTOR"),
  setAvailabilityHandler,
);
doctorsRoutes.post(
  "/:id/leave",
  authorizeExact("HOSPITAL_ADMIN", "DOCTOR"),
  markLeaveHandler,
);

export { doctorsRoutes };
