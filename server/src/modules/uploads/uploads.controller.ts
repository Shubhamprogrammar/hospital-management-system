import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess } from "../../core/utils/apiResponse.js";
import { writeAuditLog } from "../../core/utils/audit.js";
import {
  presignUpload,
  confirmUpload,
  getDownloadUrl,
  softDeleteUpload,
} from "./uploads.service.js";

export const presignHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const result = await presignUpload({ ...req.body, uploadedBy: actor?.id });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "UPLOAD_INITIATED",
      module: "uploads",
      entityType: "FileUpload",
      entityId: result.fileId,
      after: { uploadContext: req.body.uploadContext, filename: req.body.filename },
    },
    req,
  );
  sendSuccess(res, result, 201);
});

export const confirmUploadHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const file = await confirmUpload(req.params.id, req.body);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "UPLOAD_CONFIRMED",
      module: "uploads",
      entityType: "FileUpload",
      entityId: req.params.id,
    },
    req,
  );
  sendSuccess(res, file);
});

export const getDownloadUrlHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const result = await getDownloadUrl(req.params.id, actor.id, actor.role);
  sendSuccess(res, result);
});

export const deleteUploadHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const file = await softDeleteUpload(req.params.id, actor.id);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "FILE_DELETED",
      module: "uploads",
      entityType: "FileUpload",
      entityId: req.params.id,
    },
    req,
  );
  sendSuccess(res, { id: file.id, deleted: true });
});
