import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { generateInvoiceNo } from "../../core/utils/uhid.js";
import { emitToRoom } from "../../core/utils/socket.js";
import { notifyUser } from "../../core/utils/notifications.js";

export async function listBills(params: {
  patientId?: string;
  status?: string;
  date?: string;
  page: number;
  limit: number;
}) {
  const where: Record<string, unknown> = {};
  if (params.patientId) where.patientId = params.patientId;
  if (params.status) where.status = params.status;
  if (params.date) {
    const d = new Date(params.date);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    where.createdAt = { gte: d, lt: next };
  }

  const [total, bills] = await prisma.$transaction([
    prisma.bill.count({ where }),
    prisma.bill.findMany({
      where,
      include: {
        patient: { select: { id: true, uhid: true, name: true } },
        _count: { select: { items: true, payments: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
  ]);

  return { total, bills };
}

export async function getBillDetail(id: string) {
  const bill = await prisma.bill.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, uhid: true, name: true, phone: true } },
      opdVisit: { select: { id: true, tokenNumber: true } },
      ipdAdmission: { select: { id: true, admissionNo: true } },
      ambulanceTrip: { select: { id: true, status: true } },
      items: true,
      discounts: true,
      creditNotes: true,
      payments: { include: { refunds: true } },
    },
  });
  if (!bill) throw new AppError("Bill not found", 404, undefined, "NOT_FOUND");
  return bill;
}

/**
 * Create/consolidate a bill from pending line items (FR 21.4-02).
 */
export async function createBill(data: {
  patientId: string;
  opdVisitId?: string;
  ipdAdmissionId?: string;
  ambulanceTripId?: string;
  items: { sourceModule: string; description: string; quantity?: number; unitPrice?: number; sourceReferenceId?: string }[];
  createdBy?: string;
}) {
  if (!data.items.length) {
    throw new AppError("A bill cannot be created with zero line items", 400, undefined, "ERR_EMPTY_BILL");
  }

  return prisma.$transaction(async (tx) => {
    const subtotal = data.items.reduce(
      (acc, i) => acc + (i.unitPrice ?? 0) * (i.quantity ?? 1),
      0,
    );

    const bill = await tx.bill.create({
      data: {
        patientId: data.patientId,
        opdVisitId: data.opdVisitId,
        ipdAdmissionId: data.ipdAdmissionId,
        ambulanceTripId: data.ambulanceTripId,
        subtotal,
        totalAmount: subtotal,
        items: {
          create: data.items.map((i) => ({
            sourceModule: i.sourceModule as any,
            sourceReferenceId: i.sourceReferenceId,
            description: i.description,
            quantity: i.quantity ?? 1,
            unitPrice: i.unitPrice ?? 0,
            amount: (i.unitPrice ?? 0) * (i.quantity ?? 1),
          })),
        },
      },
    });

    emitToRoom("billing", "billing:bill-updated", { id: bill.id });
    return bill;
  });
}

/**
 * Apply discount with maker-checker for above-threshold discounts (FR 21.4/BR-01).
 */
export async function applyDiscount(
  billId: string,
  data: { percentage: number; reason?: string; requestedBy?: string },
) {
  if (data.percentage < 0 || data.percentage > 100) {
    throw new AppError("Discount percentage must be 0–100", 400, undefined, "VALIDATION_ERROR");
  }

  const bill = await prisma.bill.findUnique({ where: { id: billId } });
  if (!bill) throw new AppError("Bill not found", 404, undefined, "NOT_FOUND");
  if (bill.status === "FINALIZED" || bill.status === "PAID" || bill.status === "CANCELLED") {
    throw new AppError("Bill is already finalized", 409, undefined, "ERR_BILL_ALREADY_FINALIZED");
  }

  const DISCOUNT_APPROVAL_THRESHOLD = 10; // configurable via settings

  if (data.percentage > DISCOUNT_APPROVAL_THRESHOLD) {
    // Maker-checker: bill enters PENDING_APPROVAL
    const discount = await prisma.billDiscount.create({
      data: {
        billId,
        percentage: data.percentage,
        reason: data.reason,
        requestedBy: data.requestedBy,
        status: "PENDING",
      },
    });
    await prisma.bill.update({ where: { id: billId }, data: { status: "PENDING_APPROVAL" } });
    emitToRoom("billing", "billing:discount-approval-needed", { billId, discountId: discount.id });
    return { ...discount, approvalRequired: true };
  }

  // Within limit — apply directly
  const discountAmount = (Number(bill.subtotal) * data.percentage) / 100;
  const discount = await prisma.$transaction(async (tx) => {
    const created = await tx.billDiscount.create({
      data: {
        billId,
        percentage: data.percentage,
        reason: data.reason,
        requestedBy: data.requestedBy,
        status: "APPROVED",
        approvedBy: data.requestedBy,
      },
    });
    await tx.bill.update({
      where: { id: billId },
      data: {
        discountAmount,
        totalAmount: Number(bill.subtotal) - discountAmount,
      },
    });
    return created;
  });

  return { ...discount, approvalRequired: false };
}

export async function approveDiscount(billId: string, data: { approved: boolean; approvedBy?: string }) {
  const pending = await prisma.billDiscount.findFirst({
    where: { billId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (!pending) throw new AppError("No pending discount approval found", 404, undefined, "NOT_FOUND");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.billDiscount.update({
      where: { id: pending.id },
      data: {
        status: data.approved ? "APPROVED" : "REJECTED",
        approvedBy: data.approvedBy,
      },
    });

    if (data.approved) {
      const bill = await tx.bill.findUnique({ where: { id: billId } });
      if (!bill) throw new AppError("Bill not found", 404, undefined, "NOT_FOUND");
      const discountAmount = (Number(bill.subtotal) * Number(pending.percentage)) / 100;
      await tx.bill.update({
        where: { id: billId },
        data: {
          discountAmount,
          totalAmount: Number(bill.subtotal) - discountAmount,
          status: "DRAFT",
        },
      });
    } else {
      await tx.bill.update({ where: { id: billId }, data: { status: "DRAFT" } });
    }

    return updated;
  });
}

/**
 * Apply insurance coverage (BR-03: cannot exceed policy limit).
 */
export async function applyInsurance(
  billId: string,
  data: { insurancePolicyId: string; coverageAmount: number },
) {
  const [bill, policy] = await prisma.$transaction([
    prisma.bill.findUnique({ where: { id: billId } }),
    prisma.insurancePolicy.findUnique({ where: { id: data.insurancePolicyId } }),
  ]);
  if (!bill) throw new AppError("Bill not found", 404, undefined, "NOT_FOUND");
  if (!policy) throw new AppError("Insurance policy not found", 404, undefined, "NOT_FOUND");
  if (data.coverageAmount > Number(policy.coverageLimit)) {
    throw new AppError(
      "Insurance coverage exceeds policy limit",
      422,
      undefined,
      "ERR_INSURANCE_LIMIT_EXCEEDED",
    );
  }

  const updated = await prisma.bill.update({
    where: { id: billId },
    data: {
      insuranceCovered: data.coverageAmount,
      totalAmount: Number(bill.subtotal) - Number(bill.discountAmount) - data.coverageAmount,
    },
  });
  return updated;
}

/**
 * Finalize bill (FR 21.4-03). Immutable afterwards.
 */
export async function finalizeBill(billId: string) {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: {
      items: true,
      discounts: { where: { status: "PENDING" } },
    },
  });
  if (!bill) throw new AppError("Bill not found", 404, undefined, "NOT_FOUND");
  if (bill.status === "FINALIZED" || bill.status === "PAID" || bill.status === "CANCELLED") {
    throw new AppError("Bill is already finalized", 409, undefined, "ERR_BILL_ALREADY_FINALIZED");
  }
  if (bill.items.length === 0) {
    throw new AppError("Cannot finalize a bill with zero line items", 400, undefined, "ERR_EMPTY_BILL");
  }
  if (bill.discounts.length > 0) {
    throw new AppError(
      "Unresolved discount approvals — resolve before finalizing",
      409,
      undefined,
      "CONFLICT",
    );
  }

  const finalized = await prisma.$transaction(async (tx) => {
    const seq = await tx.bill.count({ where: { status: { in: ["FINALIZED", "PAID", "PARTIALLY_PAID"] } } });
    const totalAmount =
      Number(bill.subtotal) - Number(bill.discountAmount) - Number(bill.insuranceCovered);

    const updated = await tx.bill.update({
      where: { id: billId },
      data: {
        status: "FINALIZED",
        invoiceNo: generateInvoiceNo(seq + 1),
        totalAmount,
        finalizedAt: new Date(),
      },
    });

    const patient = await tx.patient.findUnique({ where: { id: bill.patientId } });
    if (patient?.userId) {
      await notifyUser(patient.userId, "bill-finalized", { billId, invoiceNo: updated.invoiceNo });
    }

    emitToRoom("billing", "billing:finalized", { billId, invoiceNo: updated.invoiceNo });
    return updated;
  });

  return finalized;
}

/**
 * Issue credit note against a finalized bill (FR 21.4-03).
 */
export async function issueCreditNote(
  billId: string,
  data: { amount: number; reason: string; issuedBy?: string },
) {
  const bill = await prisma.bill.findUnique({ where: { id: billId } });
  if (!bill) throw new AppError("Bill not found", 404, undefined, "NOT_FOUND");
  if (data.amount <= 0 || data.amount > Number(bill.totalAmount)) {
    throw new AppError("Credit note amount must be within the bill total", 422, undefined, "VALIDATION_ERROR");
  }

  return prisma.creditNote.create({
    data: {
      originalBillId: billId,
      amount: data.amount,
      reason: data.reason,
      issuedBy: data.issuedBy,
    },
  });
}

export async function listInsurancePolicies(patientId?: string) {
  return prisma.insurancePolicy.findMany({
    where: patientId ? { patientId } : {},
    include: { patient: { select: { id: true, name: true, uhid: true } } },
    orderBy: { validTill: "desc" },
    take: 100,
  });
}

export async function createInsurancePolicy(data: {
  patientId: string;
  providerName: string;
  policyNo: string;
  coverageLimit: number;
  validTill: string;
}) {
  return prisma.insurancePolicy.create({
    data: {
      patientId: data.patientId,
      providerName: data.providerName,
      policyNo: data.policyNo,
      coverageLimit: data.coverageLimit,
      validTill: new Date(data.validTill),
    },
  });
}
