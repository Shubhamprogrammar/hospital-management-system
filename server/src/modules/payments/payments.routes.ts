import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorize } from "../../core/middleware/authorize.js";
import {
  recordPaymentHandler,
  initiateGatewayHandler,
  webhookHandler,
  processRefundHandler,
  reconciliationHandler,
  createReconciliationHandler,
} from "./payments.controller.js";

const paymentsRoutes = Router();

// Gateway webhook is unauthenticated (HMAC signature verified in handler)
paymentsRoutes.post("/webhook", webhookHandler);

paymentsRoutes.use(authMiddleware);

paymentsRoutes.post("/", authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "BILLING_STAFF"), recordPaymentHandler);
paymentsRoutes.post(
  "/initiate-gateway",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "PATIENT"),
  initiateGatewayHandler,
);
paymentsRoutes.post(
  "/:id/refund",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "BILLING_STAFF"),
  processRefundHandler,
);
paymentsRoutes.get(
  "/reconciliation",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"),
  reconciliationHandler,
);
paymentsRoutes.post(
  "/reconciliation",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"),
  createReconciliationHandler,
);

export { paymentsRoutes };
