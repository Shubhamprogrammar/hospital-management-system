import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess } from "../../core/utils/apiResponse.js";
import { AppError } from "../../core/errors/AppError.js";
import { writeAuditLog } from "../../core/utils/audit.js";
import {
  recordVitals,
  getVisitDetail,
  startConsultation,
  saveDiagnosis,
  closeVisit,
  getDepartmentQueue,
  referToIpd,
} from "./opd.service.js";

export const recordVitalsHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const vital = await recordVitals(req.params.appointmentId ?? req.params.visitId, {
    ...req.body,
    recordedBy: actor?.id,
  });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "VITALS_RECORDED",
      module: "opd",
      entityType: "OpdVital",
      entityId: vital.id,
      after: req.body,
    },
    req,
  );
  sendSuccess(res, vital, 201);
});

export const getVisitHandler = catchAsync(async (req: Request, res: Response) => {
  const visit = await getVisitDetail(req.params.id);
  sendSuccess(res, visit);
});

export const startConsultationHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const visit = await startConsultation(req.params.id);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "CONSULTATION_STARTED",
      module: "opd",
      entityType: "OpdVisit",
      entityId: req.params.id,
    },
    req,
  );
  sendSuccess(res, visit);
});

export const saveDiagnosisHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const diagnosis = await saveDiagnosis(req.params.id, {
    ...req.body,
    diagnosedBy: actor?.id,
  });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "DIAGNOSIS_SAVED",
      module: "opd",
      entityType: "OpdDiagnosis",
      entityId: diagnosis.id,
      after: { icd10Code: diagnosis.icd10Code },
    },
    req,
  );
  sendSuccess(res, diagnosis, 201);
});

export const closeVisitHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const visit = await closeVisit(req.params.id);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "VISIT_CLOSED",
      module: "opd",
      entityType: "OpdVisit",
      entityId: req.params.id,
    },
    req,
  );
  sendSuccess(res, visit);
});

export const getQueueHandler = catchAsync(async (req: Request, res: Response) => {
  const { departmentId, date } = req.query;
  if (!departmentId || !date) {
    throw new AppError("departmentId and date query params are required", 400, undefined, "VALIDATION_ERROR");
  }
  const queue = await getDepartmentQueue(departmentId as string, date as string);
  sendSuccess(res, queue);
});

export const referToIpdHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const result = await referToIpd(req.params.id, req.body);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "REFERRED_IPD",
      module: "opd",
      entityType: "OpdVisit",
      entityId: req.params.id,
      after: { wardId: req.body.wardId, bedId: req.body.bedId },
    },
    req,
  );
  sendSuccess(res, result);
});
