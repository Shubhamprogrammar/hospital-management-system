import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess } from "../../core/utils/apiResponse.js";
import { writeAuditLog } from "../../core/utils/audit.js";
import {
  recordPayment,
  initiateGatewayPayment,
  handleWebhook,
  processRefund,
  getReconciliation,
  createReconciliation,
} from "./payments.service.js";

export const recordPaymentHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const payment = await recordPayment({ ...req.body, collectedBy: actor?.id });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "PAYMENT_RECORDED",
      module: "payments",
      entityType: "Payment",
      entityId: payment.id,
      after: { billId: payment.billId, amount: payment.amount, mode: payment.mode },
    },
    req,
  );
  sendSuccess(res, payment, 201);
});

export const initiateGatewayHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const result = await initiateGatewayPayment({ ...req.body, payerId: actor?.id });
  sendSuccess(res, result);
});

export const webhookHandler = catchAsync(async (req: Request, res: Response) => {
  const result = await handleWebhook(req.body, req.headers);
  writeAuditLog(
    {
      action: "GATEWAY_CONFIRMED",
      module: "payments",
      entityType: "Payment",
      entityId: result.paymentId,
      after: { status: "SUCCESS" },
    },
    req,
  );
  sendSuccess(res, result);
});

export const processRefundHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const refund = await processRefund(req.params.id, { ...req.body, requestedBy: actor?.id });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "REFUND_PROCESSED",
      module: "payments",
      entityType: "Refund",
      entityId: refund.id,
      after: { amount: refund.amount, reason: refund.reason },
    },
    req,
  );
  sendSuccess(res, refund, 201);
});

export const reconciliationHandler = catchAsync(async (req: Request, res: Response) => {
  const result = await getReconciliation(req.query.date as string);
  sendSuccess(res, result);
});

export const createReconciliationHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const recon = await createReconciliation({ ...req.body, staffId: actor?.id });
  sendSuccess(res, recon, 201);
});
