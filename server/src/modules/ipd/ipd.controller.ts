import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess, sendPaginated } from "../../core/utils/apiResponse.js";
import { parsePagination, buildPaginationMeta } from "../../core/utils/pagination.js";
import { AppError } from "../../core/errors/AppError.js";
import { writeAuditLog } from "../../core/utils/audit.js";
import { resolveDoctorId } from "../../core/utils/doctorRef.js";
import {
  admitPatient,
  listAdmissions,
  getAdmissionDetail,
  addRound,
  chartVitals,
  transferAdmission,
  dischargePatient,
  getDischargeSummary,
} from "./ipd.service.js";

export const admitPatientHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const admission = await admitPatient(req.body);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "ADMIT",
      module: "ipd",
      entityType: "IpdAdmission",
      entityId: admission.id,
      after: { admissionNo: admission.admissionNo, patientId: admission.patientId, bedId: admission.bedId },
    },
    req,
  );
  sendSuccess(res, admission, 201);
});

export const listAdmissionsHandler = catchAsync(async (req: Request, res: Response) => {
  const pagination = parsePagination(req.query.page, req.query.limit);
  const result = await listAdmissions({
    ...pagination,
    wardId: req.query.wardId as string | undefined,
    status: req.query.status as string | undefined,
    doctorId: req.query.doctorId as string | undefined,
  });
  sendPaginated(res, result.admissions, buildPaginationMeta(result.total, pagination));
});

export const getAdmissionHandler = catchAsync(async (req: Request, res: Response) => {
  const admission = await getAdmissionDetail(req.params.id);
  sendSuccess(res, admission);
});

export const addRoundHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const doctorId = await resolveDoctorId(actor?.id, req.body.doctorId, "adding a round");
  const round = await addRound(req.params.id, { notes: req.body.notes, doctorId });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "ROUND_ADDED",
      module: "ipd",
      entityType: "IpdRound",
      entityId: round.id,
    },
    req,
  );
  sendSuccess(res, round, 201);
});

export const chartVitalsHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const vital = await chartVitals(req.params.id, { ...req.body, recordedBy: actor?.id });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "VITALS_CHARTED",
      module: "ipd",
      entityType: "IpdVital",
      entityId: vital.id,
      after: req.body,
    },
    req,
  );
  sendSuccess(res, vital, 201);
});

export const transferAdmissionHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const admission = await transferAdmission(req.params.id, { ...req.body, transferredBy: actor?.id });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "TRANSFER",
      module: "ipd",
      entityType: "IpdAdmission",
      entityId: req.params.id,
      after: { toBedId: req.body.toBedId, reason: req.body.reason },
    },
    req,
  );
  sendSuccess(res, admission);
});

export const dischargePatientHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const admission = await dischargePatient(req.params.id, { ...req.body, signedBy: actor?.id });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "DISCHARGE",
      module: "ipd",
      entityType: "IpdAdmission",
      entityId: req.params.id,
      after: { status: "DISCHARGED" },
    },
    req,
  );
  sendSuccess(res, admission);
});

export const getDischargeSummaryHandler = catchAsync(async (req: Request, res: Response) => {
  const result = await getDischargeSummary(req.params.id);
  sendSuccess(res, result);
});
