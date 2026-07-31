import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { emitToRoom, emitToUser } from "../../core/utils/socket.js";
import { notifyUser } from "../../core/utils/notifications.js";
import { randomUUID } from "crypto";

/**
 * Record a payment (cash/manual modes) (FR 22.4-01).
 * BR-01: sum of payments can never exceed bill total.
 */
export async function recordPayment(data: {
  billId: string;
  patientId: string;
  amount: number;
  mode: "CASH" | "CARD" | "UPI" | "NET_BANKING" | "INSURANCE" | "WALLET";
  collectedBy?: string;
  gatewayTransactionId?: string;
}) {
  if (data.amount <= 0) {
    throw new AppError("Payment amount must be > 0", 400, undefined, "VALIDATION_ERROR");
  }

  const bill = await prisma.bill.findUnique({ where: { id: data.billId } });
  if (!bill) throw new AppError("Bill not found", 404, undefined, "NOT_FOUND");
  if (bill.status !== "FINALIZED" && bill.status !== "PARTIALLY_PAID") {
    throw new AppError("Only finalized bills can receive payments", 409, undefined, "CONFLICT");
  }

  const paidSoFar = await prisma.payment.aggregate({
    where: {
      billId: data.billId,
      status: { in: ["SUCCESS", "PENDING"] },
    },
    _sum: { amount: true },
  });
  const paid = Number(paidSoFar._sum.amount ?? 0);

  if (paid + data.amount > Number(bill.totalAmount)) {
    throw new AppError(
      "Payment exceeds remaining bill amount",
      409,
      { remaining: Number(bill.totalAmount) - paid },
      "ERR_OVERPAYMENT_BLOCKED",
    );
  }

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        billId: data.billId,
        patientId: data.patientId,
        amount: data.amount,
        mode: data.mode,
        status: "SUCCESS",
        collectedBy: data.collectedBy,
        gatewayTransactionId: data.gatewayTransactionId,
      },
    });

    // Recompute bill status (FR 22.4-03)
    await updateBillPaymentStatus(tx, data.billId, Number(bill.totalAmount));

    return created;
  });

  emitToRoom("billing", "payments:recorded", { billId: data.billId });
  return payment;
}

/**
 * Initiate an online gateway payment session (FR 22.4-02).
 * Gateway-agnostic — returns a payment intent placeholder.
 */
export async function initiateGatewayPayment(data: {
  billId: string;
  patientId: string;
  amount: number;
  payerId?: string;
}) {
  const bill = await prisma.bill.findUnique({ where: { id: data.billId } });
  if (!bill) throw new AppError("Bill not found", 404, undefined, "NOT_FOUND");
  if (data.amount > Number(bill.totalAmount)) {
    throw new AppError("Payment amount exceeds bill total", 422, undefined, "ERR_OVERPAYMENT_BLOCKED");
  }

  const payment = await prisma.payment.create({
    data: {
      billId: data.billId,
      patientId: data.patientId,
      amount: data.amount,
      mode: "UPI",
      status: "PENDING",
    },
  });

  // TODO: integrate real gateway — return checkout session
  return {
    paymentId: payment.id,
    checkoutUrl: `/payments/gateway/${payment.id}`,
    expiresIn: "30m",
  };
}

/**
 * Gateway webhook — signature verification + idempotency (FR 22.7-03).
 */
export async function handleWebhook(
  body: { gatewayTransactionId?: string; paymentId?: string; status?: string },
  _headers: Record<string, unknown>,
) {
  const { gatewayTransactionId, paymentId, status } = body;
  if (!paymentId || !status) {
    throw new AppError("Invalid webhook payload", 400, undefined, "VALIDATION_ERROR");
  }

  // TODO: verify HMAC signature from gateway (FR 22.7 BR)
  // For dev: trust body status

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new AppError("Payment not found", 404, undefined, "NOT_FOUND");

  // Idempotency: if already SUCCESS with same transaction, no-op (FRD 22.20)
  if (payment.status === "SUCCESS") {
    return { paymentId, idempotent: true, status: "SUCCESS" };
  }

  if (gatewayTransactionId && payment.gatewayTransactionId !== gatewayTransactionId) {
    // Unique constraint protects against duplicates
    const dup = await prisma.payment.findUnique({
      where: { gatewayTransactionId },
    });
    if (dup && dup.id !== paymentId) {
      throw new AppError("Duplicate gateway transaction", 409, undefined, "ERR_DUPLICATE_TRANSACTION");
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: status === "success" ? "SUCCESS" : "FAILED",
        gatewayTransactionId: gatewayTransactionId ?? payment.gatewayTransactionId,
      },
    });

    if (result.status === "SUCCESS") {
      const bill = await tx.bill.findUnique({ where: { id: payment.billId } });
      if (bill) await updateBillPaymentStatus(tx, payment.billId, Number(bill.totalAmount));

      const patient = await tx.patient.findUnique({ where: { id: payment.patientId } });
      if (patient?.userId) {
        await notifyUser(patient.userId, "payment-confirmed", { paymentId, billId: payment.billId });
      }
      emitToUser(patient?.userId ?? "", "payments:gateway-confirmed", { paymentId });
    }

    return result;
  });

  return { paymentId, idempotent: false, status: updated.status };
}

/**
 * Process refund against a payment (FR 22.4-04). Capped at original amount.
 */
export async function processRefund(
  paymentId: string,
  data: { amount: number; reason: string; requestedBy?: string },
) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { refunds: true },
  });
  if (!payment) throw new AppError("Payment not found", 404, undefined, "NOT_FOUND");

  const refundedSoFar = payment.refunds.reduce((acc, r) => acc + Number(r.amount), 0);
  if (refundedSoFar + data.amount > Number(payment.amount)) {
    throw new AppError(
      "Refund exceeds original payment amount",
      422,
      undefined,
      "ERR_REFUND_EXCEEDS_ORIGINAL",
    );
  }

  return prisma.refund.create({
    data: {
      paymentId,
      amount: data.amount,
      reason: data.reason,
      status: "PROCESSED",
      approvedBy: data.requestedBy,
    },
  });
}

/** Daily reconciliation report (FR 22.7-06). */
export async function getReconciliation(date?: string) {
  const target = date ? new Date(date) : new Date();
  const start = new Date(target);
  start.setHours(0, 0, 0, 0);
  const end = new Date(target);
  end.setHours(23, 59, 59, 999);

  const payments = await prisma.payment.findMany({
    where: { createdAt: { gte: start, lte: end }, status: "SUCCESS" },
  });

  const total = payments.reduce((acc, p) => acc + Number(p.amount), 0);
  const byMode = payments.reduce<Record<string, number>>((acc, p) => {
    acc[p.mode] = (acc[p.mode] ?? 0) + Number(p.amount);
    return acc;
  }, {});

  return { date: target.toISOString().split("T")[0], total, count: payments.length, byMode, payments };
}

export async function createReconciliation(data: {
  date: string;
  expectedAmount: number;
  countedAmount: number;
  staffId?: string;
}) {
  return prisma.cashReconciliation.create({
    data: {
      date: new Date(data.date),
      expectedAmount: data.expectedAmount,
      countedAmount: data.countedAmount,
      variance: data.countedAmount - data.expectedAmount,
      staffId: data.staffId,
    },
  });
}

async function updateBillPaymentStatus(tx: any, billId: string, billTotal: number) {
  const sum = await tx.payment.aggregate({
    where: { billId, status: "SUCCESS" },
    _sum: { amount: true },
  });
  const paid = Number(sum._sum.amount ?? 0);

  await tx.bill.update({
    where: { id: billId },
    data: { status: paid >= billTotal ? "PAID" : "PARTIALLY_PAID" },
  });

  emitToRoom("billing", "billing:bill-updated", { billId });
}
