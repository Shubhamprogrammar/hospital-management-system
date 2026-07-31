import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess } from "../../core/utils/apiResponse.js";
import { writeAuditLog } from "../../core/utils/audit.js";
import {
  getDispensingQueue,
  createDispense,
  recordSubstitution,
  getDispenseDetail,
  processReturn,
  suggestBatches,
} from "./pharmacy.service.js";

export const getQueueHandler = catchAsync(async (_req: Request, res: Response) => {
  const queue = await getDispensingQueue();
  sendSuccess(res, queue);
});

export const createDispenseHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const dispense = await createDispense({ ...req.body, dispensedBy: actor?.id });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "DISPENSE_CREATED",
      module: "pharmacy",
      entityType: "PharmacyDispense",
      entityId: dispense.id,
      after: { prescriptionId: req.body.prescriptionId },
    },
    req,
  );
  sendSuccess(res, dispense, 201);
});

export const recordSubstitutionHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const item = await recordSubstitution(req.params.id, req.body);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "SUBSTITUTION_RECORDED",
      module: "pharmacy",
      entityType: "DispenseItem",
      entityId: item.id,
      after: { substitutedFromDrugId: req.body.substitutedFromDrugId, reason: req.body.reason },
    },
    req,
  );
  sendSuccess(res, item);
});

export const getDispenseHandler = catchAsync(async (req: Request, res: Response) => {
  const dispense = await getDispenseDetail(req.params.id);
  sendSuccess(res, dispense);
});

export const processReturnHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const ret = await processReturn({ ...req.body, processedBy: actor?.id });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "RETURN_PROCESSED",
      module: "pharmacy",
      entityType: "PharmacyReturn",
      entityId: ret.id,
      after: { quantityReturned: req.body.quantityReturned, reason: req.body.reason },
    },
    req,
  );
  sendSuccess(res, ret, 201);
});

export const suggestBatchesHandler = catchAsync(async (req: Request, res: Response) => {
  const { drugId, quantity } = req.query;
  const suggestion = await suggestBatches(drugId as string, Number(quantity ?? 1));
  sendSuccess(res, suggestion);
});
