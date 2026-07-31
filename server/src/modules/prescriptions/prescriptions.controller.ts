import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess, sendPaginated } from "../../core/utils/apiResponse.js";
import { parsePagination, buildPaginationMeta } from "../../core/utils/pagination.js";
import { writeAuditLog } from "../../core/utils/audit.js";
import { AppError } from "../../core/errors/AppError.js";
import { resolveDoctorId } from "../../core/utils/doctorRef.js";
import {
  checkInteractions,
  createPrescription,
  listPrescriptions,
  getPrescriptionDetail,
  renewPrescription,
} from "./prescriptions.service.js";

export const createPrescriptionHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const doctorId = await resolveDoctorId(actor?.id, req.body.doctorId, "prescribing");
  const prescription = await createPrescription({ ...req.body, doctorId });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "CREATE",
      module: "prescriptions",
      entityType: "Prescription",
      entityId: prescription.id,
      after: { patientId: prescription.patientId, itemCount: req.body.items?.length },
    },
    req,
  );
  sendSuccess(res, prescription, 201);
});

export const listPrescriptionsHandler = catchAsync(async (req: Request, res: Response) => {
  const pagination = parsePagination(req.query.page, req.query.limit);
  const result = await listPrescriptions({
    ...pagination,
    patientId: req.query.patientId as string | undefined,
    doctorId: req.query.doctorId as string | undefined,
    opdVisitId: req.query.opdVisitId as string | undefined,
  });
  sendPaginated(res, result.prescriptions, buildPaginationMeta(result.total, pagination));
});

export const getPrescriptionHandler = catchAsync(async (req: Request, res: Response) => {
  const prescription = await getPrescriptionDetail(req.params.id);
  sendSuccess(res, prescription);
});

export const renewPrescriptionHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const doctorId = await resolveDoctorId(actor?.id, req.body.doctorId, "renewing a prescription");
  const renewed = await renewPrescription(req.params.id, doctorId);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "RENEW",
      module: "prescriptions",
      entityType: "Prescription",
      entityId: req.params.id,
      after: { renewedId: renewed.id },
    },
    req,
  );
  sendSuccess(res, renewed, 201);
});

export const interactionsCheckHandler = catchAsync(async (req: Request, res: Response) => {
  const { drugIds, patientId } = req.body;
  if (!Array.isArray(drugIds) || !drugIds.length || !patientId) {
    throw new AppError(
      "drugIds and patientId are required",
      400,
      undefined,
      "VALIDATION_ERROR",
    );
  }
  const result = await checkInteractions(drugIds, patientId);
  sendSuccess(res, result);
});
