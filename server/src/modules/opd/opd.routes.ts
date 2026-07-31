import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorize } from "../../core/middleware/authorize.js";
import {
  recordVitalsHandler,
  getVisitHandler,
  startConsultationHandler,
  saveDiagnosisHandler,
  closeVisitHandler,
  getQueueHandler,
  referToIpdHandler,
} from "./opd.controller.js";

const opdRoutes = Router();

opdRoutes.use(authMiddleware);

opdRoutes.get("/queue", getQueueHandler);

// Vitals: nurse or doctor (FR 11.21)
opdRoutes.post(
  "/visits/:appointmentId/vitals",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "NURSE", "DOCTOR"),
  recordVitalsHandler,
);

// Consultation flow: doctor only
opdRoutes.get(
  "/visits/:id",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "NURSE", "DOCTOR", "RECEPTIONIST"),
  getVisitHandler,
);
opdRoutes.patch(
  "/visits/:id/start-consultation",
  authorize("SUPER_ADMIN", "DOCTOR"),
  startConsultationHandler,
);
opdRoutes.patch(
  "/visits/:id/diagnosis",
  authorize("SUPER_ADMIN", "DOCTOR"),
  saveDiagnosisHandler,
);
opdRoutes.patch(
  "/visits/:id/close",
  authorize("SUPER_ADMIN", "DOCTOR"),
  closeVisitHandler,
);
opdRoutes.post(
  "/visits/:id/refer-ipd",
  authorize("SUPER_ADMIN", "DOCTOR"),
  referToIpdHandler,
);

export { opdRoutes };
