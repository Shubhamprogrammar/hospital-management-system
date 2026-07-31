import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorize } from "../../core/middleware/authorize.js";
import {
  admitPatientHandler,
  listAdmissionsHandler,
  getAdmissionHandler,
  addRoundHandler,
  chartVitalsHandler,
  transferAdmissionHandler,
  dischargePatientHandler,
  getDischargeSummaryHandler,
} from "./ipd.controller.js";

const ipdRoutes = Router();

ipdRoutes.use(authMiddleware);

ipdRoutes.post(
  "/admissions",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "DOCTOR", "RECEPTIONIST"),
  admitPatientHandler,
);
ipdRoutes.get(
  "/admissions",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "DOCTOR", "NURSE", "RECEPTIONIST"),
  listAdmissionsHandler,
);
ipdRoutes.get(
  "/admissions/:id",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "DOCTOR", "NURSE", "RECEPTIONIST"),
  getAdmissionHandler,
);
ipdRoutes.post(
  "/admissions/:id/rounds",
  authorize("SUPER_ADMIN", "DOCTOR"),
  addRoundHandler,
);
ipdRoutes.post(
  "/admissions/:id/vitals",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "NURSE"),
  chartVitalsHandler,
);
ipdRoutes.post(
  "/admissions/:id/transfer",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "DOCTOR", "RECEPTIONIST"),
  transferAdmissionHandler,
);
ipdRoutes.patch(
  "/admissions/:id/discharge",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "DOCTOR"),
  dischargePatientHandler,
);
ipdRoutes.get(
  "/admissions/:id/discharge-summary",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "DOCTOR"),
  getDischargeSummaryHandler,
);

export { ipdRoutes };
