import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorize } from "../../core/middleware/authorize.js";
import {
  registerPatientHandler,
  searchPatientsHandler,
  getPatientHandler,
  updatePatientHandler,
  addPatientDocumentHandler,
  removePatientDocumentHandler,
  mergePatientsHandler,
  getPatientTimelineHandler,
  getPatientMeHandler,
} from "./patients.controller.js";

const patientsRoutes = Router();

patientsRoutes.use(authMiddleware);

// Self-profile (portal)
patientsRoutes.get("/me", getPatientMeHandler);

// Registration: reception/admin create; patient self-register goes through auth
patientsRoutes.post(
  "/",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "RECEPTIONIST"),
  registerPatientHandler,
);

// Search/list
patientsRoutes.get(
  "/",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "RECEPTIONIST", "DOCTOR", "NURSE"),
  searchPatientsHandler,
);

// Merge (admin only)
patientsRoutes.post(
  "/merge",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"),
  mergePatientsHandler,
);

// Timeline
patientsRoutes.get("/:id/timeline", getPatientTimelineHandler);

// Patient detail: clinical staff read; medical history updates by doctor/nurse
patientsRoutes.get(
  "/:id",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "RECEPTIONIST", "DOCTOR", "NURSE"),
  getPatientHandler,
);
patientsRoutes.patch(
  "/:id",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "DOCTOR", "NURSE"),
  updatePatientHandler,
);
patientsRoutes.post(
  "/:id/documents",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "RECEPTIONIST", "DOCTOR"),
  addPatientDocumentHandler,
);
patientsRoutes.delete(
  "/:id/documents/:docId",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "RECEPTIONIST", "DOCTOR"),
  removePatientDocumentHandler,
);

export { patientsRoutes };
