import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess, sendPaginated } from "../../core/utils/apiResponse.js";
import { parsePagination, buildPaginationMeta } from "../../core/utils/pagination.js";
import { writeAuditLog } from "../../core/utils/audit.js";
import {
  createBed,
  listBeds,
  getBedDetail,
  changeBedStatus,
  removeBed,
} from "./beds.service.js";

export const createBedHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const bed = await createBed(req.body);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "CREATE",
      module: "beds",
      entityType: "Bed",
      entityId: bed.id,
      after: { wardId: bed.wardId, bedNumber: bed.bedNumber },
    },
    req,
  );
  sendSuccess(res, bed, 201);
});

export const listBedsHandler = catchAsync(async (req: Request, res: Response) => {
  const pagination = parsePagination(req.query.page, req.query.limit);
  const result = await listBeds({
    ...pagination,
    wardId: req.query.wardId as string | undefined,
    status: req.query.status as string | undefined,
    bedType: req.query.bedType as string | undefined,
    search: req.query.search as string | undefined,
  });
  sendPaginated(res, result.beds, buildPaginationMeta(result.total, pagination));
});

export const getBedHandler = catchAsync(async (req: Request, res: Response) => {
  const bed = await getBedDetail(req.params.id);
  sendSuccess(res, bed);
});

export const changeBedStatusHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const bed = await changeBedStatus(req.params.id, req.body);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "STATUS_CHANGE",
      module: "beds",
      entityType: "Bed",
      entityId: req.params.id,
      after: { status: req.body.status, reason: req.body.reason },
    },
    req,
  );
  sendSuccess(res, bed);
});

export const removeBedHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const bed = await removeBed(req.params.id);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "DELETE",
      module: "beds",
      entityType: "Bed",
      entityId: req.params.id,
      after: { deleted: true },
    },
    req,
  );
  sendSuccess(res, { id: bed.id, deleted: true });
});
