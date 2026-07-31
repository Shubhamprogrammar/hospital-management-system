import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess } from "../../core/utils/apiResponse.js";
import { writeAuditLog } from "../../core/utils/audit.js";
import { emitToRoom } from "../../core/utils/socket.js";
import {
  createWard,
  listWards,
  getWardDetail,
  updateWard,
  deactivateWard,
  getWardCensus,
} from "./wards.service.js";

export const createWardHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const ward = await createWard(req.body);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "CREATE",
      module: "wards",
      entityType: "Ward",
      entityId: ward.id,
      after: { name: ward.name, wardType: ward.wardType },
    },
    req,
  );
  sendSuccess(res, ward, 201);
});

export const listWardsHandler = catchAsync(async (_req: Request, res: Response) => {
  const wards = await listWards();
  sendSuccess(res, wards);
});

export const getWardHandler = catchAsync(async (req: Request, res: Response) => {
  const ward = await getWardDetail(req.params.id);
  sendSuccess(res, ward);
});

export const getWardCensusHandler = catchAsync(async (req: Request, res: Response) => {
  const census = await getWardCensus(req.params.id);
  sendSuccess(res, census);
});

export const updateWardHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const ward = await updateWard(req.params.id, req.body);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "UPDATE",
      module: "wards",
      entityType: "Ward",
      entityId: req.params.id,
      after: req.body,
    },
    req,
  );
  emitToRoom(`ward:${req.params.id}`, "wards:census-updated", await getWardCensus(req.params.id));
  sendSuccess(res, ward);
});

export const deactivateWardHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const ward = await deactivateWard(req.params.id);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "DEACTIVATE",
      module: "wards",
      entityType: "Ward",
      entityId: req.params.id,
      after: { isActive: false },
    },
    req,
  );
  sendSuccess(res, ward);
});
