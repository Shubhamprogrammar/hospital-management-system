import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess, sendPaginated } from "../../core/utils/apiResponse.js";
import { parsePagination, buildPaginationMeta } from "../../core/utils/pagination.js";
import { writeAuditLog } from "../../core/utils/audit.js";
import {
  listBills,
  getBillDetail,
  createBill,
  applyDiscount,
  approveDiscount,
  applyInsurance,
  finalizeBill,
  issueCreditNote,
  createInsurancePolicy,
} from "./billing.service.js";

export const listBillsHandler = catchAsync(async (req: Request, res: Response) => {
  const pagination = parsePagination(req.query.page, req.query.limit);
  const result = await listBills({
    ...pagination,
    patientId: req.query.patientId as string | undefined,
    status: req.query.status as string | undefined,
    date: req.query.date as string | undefined,
  });
  sendPaginated(res, result.bills, buildPaginationMeta(result.total, pagination));
});

export const getBillHandler = catchAsync(async (req: Request, res: Response) => {
  const bill = await getBillDetail(req.params.id);
  sendSuccess(res, bill);
});

export const createBillHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const bill = await createBill({ ...req.body, createdBy: actor?.id });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "BILL_CREATED",
      module: "billing",
      entityType: "Bill",
      entityId: bill.id,
      after: { patientId: bill.patientId, subtotal: bill.subtotal },
    },
    req,
  );
  sendSuccess(res, bill, 201);
});

export const applyDiscountHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const discount = await applyDiscount(req.params.id, { ...req.body, requestedBy: actor?.id });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "DISCOUNT_APPLIED",
      module: "billing",
      entityType: "BillDiscount",
      entityId: discount.id,
      after: { percentage: req.body.percentage, approvalRequired: discount.approvalRequired },
    },
    req,
  );
  sendSuccess(res, discount);
});

export const approveDiscountHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const discount = await approveDiscount(req.params.id, { ...req.body, approvedBy: actor?.id });
  sendSuccess(res, discount);
});

export const applyInsuranceHandler = catchAsync(async (req: Request, res: Response) => {
  const bill = await applyInsurance(req.params.id, req.body);
  sendSuccess(res, bill);
});

export const finalizeBillHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const bill = await finalizeBill(req.params.id);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "FINALIZED",
      module: "billing",
      entityType: "Bill",
      entityId: req.params.id,
      after: { status: "FINALIZED", invoiceNo: bill.invoiceNo },
    },
    req,
  );
  sendSuccess(res, bill);
});

export const issueCreditNoteHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const note = await issueCreditNote(req.params.id, { ...req.body, issuedBy: actor?.id });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "CREDIT_NOTE_ISSUED",
      module: "billing",
      entityType: "CreditNote",
      entityId: note.id,
      after: { billId: req.params.id, amount: note.amount },
    },
    req,
  );
  sendSuccess(res, note, 201);
});

export const createInsurancePolicyHandler = catchAsync(async (req: Request, res: Response) => {
  const policy = await createInsurancePolicy(req.body);
  sendSuccess(res, policy, 201);
});
