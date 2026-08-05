import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorize } from "../../core/middleware/authorize.js";
import {
  listBillsHandler,
  getBillHandler,
  createBillHandler,
  applyDiscountHandler,
  approveDiscountHandler,
  applyInsuranceHandler,
  finalizeBillHandler,
  issueCreditNoteHandler,
  createInsurancePolicyHandler,
} from "./billing.controller.js";

const billingRoutes = Router();

billingRoutes.use(authMiddleware);

billingRoutes.get(
  "/bills",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "BILLING_STAFF"),
  listBillsHandler,
);
billingRoutes.get(
  "/bills/:id",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "BILLING_STAFF", "PATIENT"),
  getBillHandler,
);
billingRoutes.post(
  "/bills",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "BILLING_STAFF"),
  createBillHandler,
);
billingRoutes.patch(
  "/bills/:id/discount",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "BILLING_STAFF"),
  applyDiscountHandler,
);
billingRoutes.post(
  "/bills/:id/discount/approve",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"),
  approveDiscountHandler,
);
billingRoutes.patch(
  "/bills/:id/insurance",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "BILLING_STAFF"),
  applyInsuranceHandler,
);
billingRoutes.patch(
  "/bills/:id/finalize",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "BILLING_STAFF"),
  finalizeBillHandler,
);
billingRoutes.post(
  "/bills/:id/credit-note",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "BILLING_STAFF"),
  issueCreditNoteHandler,
);
billingRoutes.post(
  "/insurance-policies",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "BILLING_STAFF"),
  createInsurancePolicyHandler,
);

export { billingRoutes };
