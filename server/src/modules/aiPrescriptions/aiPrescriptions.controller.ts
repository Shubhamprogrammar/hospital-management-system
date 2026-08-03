import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess } from "../../core/utils/apiResponse.js";
import { writeAuditLog } from "../../core/utils/audit.js";
import { resolveDoctorId } from "../../core/utils/doctorRef.js";
import {
  suggestPrescription,
  getSuggestionDetail,
  acceptSuggestion,
  editSuggestion,
  rejectSuggestion,
} from "./aiPrescriptions.service.js";

export const suggestHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const doctorId = await resolveDoctorId(actor?.id, req.body.doctorId, "AI prescription suggestions");
  const suggestion = await suggestPrescription({ ...req.body, doctorId });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "AI_SUGGESTION_REQUESTED",
      module: "aiPrescriptions",
      entityType: "AiPrescriptionSuggestion",
      entityId: suggestion.id,
    },
    req,
  );
  sendSuccess(res, suggestion, 201);
});

export const getSuggestionHandler = catchAsync(async (req: Request, res: Response) => {
  const suggestion = await getSuggestionDetail(req.params.id);
  sendSuccess(res, suggestion);
});

export const acceptSuggestionHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const doctorId = await resolveDoctorId(actor?.id, req.body.doctorId, "accepting AI suggestions");
  const result = await acceptSuggestion(req.params.id, doctorId);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "AI_SUGGESTION_ACCEPTED",
      module: "aiPrescriptions",
      entityType: "AiPrescriptionSuggestion",
      entityId: req.params.id,
      after: { prescriptionId: result.prescriptionId },
    },
    req,
  );
  sendSuccess(res, result);
});

export const editSuggestionHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const doctorId = await resolveDoctorId(actor?.id, req.body.doctorId, "editing AI suggestions");
  const result = await editSuggestion(req.params.id, { ...req.body, doctorId });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "AI_SUGGESTION_EDITED",
      module: "aiPrescriptions",
      entityType: "AiPrescriptionSuggestion",
      entityId: req.params.id,
      after: { prescriptionId: result.prescriptionId },
    },
    req,
  );
  sendSuccess(res, result);
});

export const rejectSuggestionHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const doctorId = await resolveDoctorId(actor?.id, req.body.doctorId, "rejecting AI suggestions");
  const result = await rejectSuggestion(req.params.id, { ...req.body, doctorId });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "AI_SUGGESTION_REJECTED",
      module: "aiPrescriptions",
      entityType: "AiPrescriptionSuggestion",
      entityId: req.params.id,
      after: { rejectionReason: req.body.reason },
    },
    req,
  );
  sendSuccess(res, result);
});
