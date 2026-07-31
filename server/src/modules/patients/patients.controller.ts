import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess, sendPaginated } from "../../core/utils/apiResponse.js";
import { parsePagination, buildPaginationMeta } from "../../core/utils/pagination.js";
import { AppError } from "../../core/errors/AppError.js";
import { writeAuditLog, writeActivityLog } from "../../core/utils/audit.js";
import { emitToAll } from "../../core/utils/socket.js";
import {
  registerPatient,
  searchPatients,
  getPatientDetail,
  updatePatient,
  addPatientDocument,
  mergePatients,
  getPatientTimeline,
  getPatientByUser,
  linkPatientToUser,
} from "./patients.service.js";

export const registerPatientHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const patient = await registerPatient(req.body);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "CREATE",
      module: "patients",
      entityType: "Patient",
      entityId: patient.id,
      after: { uhid: patient.uhid, name: patient.name, phone: patient.phone },
    },
    req,
  );
  emitToAll("patients:registered", { id: patient.id, uhid: patient.uhid });
  sendSuccess(res, patient, 201);
});

export const searchPatientsHandler = catchAsync(async (req: Request, res: Response) => {
  const pagination = parsePagination(req.query.page, req.query.limit);
  const result = await searchPatients({
    ...pagination,
    search: req.query.search as string | undefined,
    uhid: req.query.uhid as string | undefined,
    phone: req.query.phone as string | undefined,
  });
  sendPaginated(res, result.patients, buildPaginationMeta(result.total, pagination));
});

export const getPatientHandler = catchAsync(async (req: Request, res: Response) => {
  const patient = await getPatientDetail(req.params.id);
  sendSuccess(res, patient);
});

export const updatePatientHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const patient = await updatePatient(req.params.id, req.body);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "UPDATE",
      module: "patients",
      entityType: "Patient",
      entityId: req.params.id,
      after: req.body,
    },
    req,
  );
  writeActivityLog(actor?.id, "patients", `Patient profile updated: ${patient.name}`, {
    entityType: "Patient",
    entityId: patient.id,
  });
  sendSuccess(res, patient);
});

export const addPatientDocumentHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const doc = await addPatientDocument(req.params.id, {
    ...req.body,
    uploadedBy: actor?.id,
  });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "DOCUMENT_UPLOAD",
      module: "patients",
      entityType: "PatientDocument",
      entityId: doc.id,
      after: { patientId: req.params.id, docType: doc.docType, s3Key: doc.s3Key },
    },
    req,
  );
  sendSuccess(res, doc, 201);
});

export const mergePatientsHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const result = await mergePatients({ ...req.body, performedBy: actor?.id });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "MERGE",
      module: "patients",
      entityType: "PatientMergeLog",
      entityId: result.survivingPatientId,
      before: { mergedPatientId: result.mergedPatientId },
      after: { survivingPatientId: result.survivingPatientId },
    },
    req,
  );
  emitToAll("patients:merged", result);
  sendSuccess(res, result);
});

export const getPatientTimelineHandler = catchAsync(async (req: Request, res: Response) => {
  const timeline = await getPatientTimeline(req.params.id);
  sendSuccess(res, timeline);
});

export const getPatientMeHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const patient = await getPatientByUser(actor.id);
  sendSuccess(res, patient);
});
