import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorizeExact } from "../../core/middleware/authorize.js";
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

// Reads remain authenticated, but doctors only see their own profile.
doctorsRoutes.get("/me", getMeHandler);
doctorsRoutes.get("/", listDoctorsHandler);
doctorsRoutes.get("/:id/slots", getSlotsHandler);
doctorsRoutes.get("/:id", getDoctorHandler);

// Self-service doctor profile management only.
doctorsRoutes.post("/", authorizeExact("DOCTOR"), createDoctorHandler);
doctorsRoutes.delete("/:id", authorizeExact("DOCTOR"), deactivateDoctorHandler);
doctorsRoutes.patch("/:id", authorizeExact("DOCTOR"), updateDoctorHandler);
doctorsRoutes.post("/:id/availability", authorizeExact("DOCTOR"), setAvailabilityHandler);
doctorsRoutes.post("/:id/leave", authorizeExact("DOCTOR"), markLeaveHandler);

export { doctorsRoutes };
