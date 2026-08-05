import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess } from "../../core/utils/apiResponse.js";
import { writeAuditLog } from "../../core/utils/audit.js";
import {
  addVehicle,
  listVehicles,
  raiseRequest,
  listRequests,
  assignVehicle,
  updateTripStatus,
  trackTrip,
} from "./ambulance.service.js";

export const addVehicleHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const vehicle = await addVehicle(req.body);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "CREATE",
      module: "ambulance",
      entityType: "AmbulanceVehicle",
      entityId: vehicle.id,
      after: { registrationNo: vehicle.registrationNo, type: vehicle.type },
    },
    req,
  );
  sendSuccess(res, vehicle, 201);
});

export const listVehiclesHandler = catchAsync(async (_req: Request, res: Response) => {
  const vehicles = await listVehicles();
  sendSuccess(res, vehicles);
});

export const raiseRequestHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const request = await raiseRequest({ ...req.body, requestedBy: actor?.id });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "REQUEST_CREATED",
      module: "ambulance",
      entityType: "AmbulanceRequest",
      entityId: request.id,
      after: { urgency: request.urgency },
    },
    req,
  );
  sendSuccess(res, request, 201);
});

export const listRequestsHandler = catchAsync(async (req: Request, res: Response) => {
  const requests = await listRequests(req.query.status as string | undefined);
  sendSuccess(res, requests);
});

export const assignVehicleHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const trip = await assignVehicle(req.params.id, req.body);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "ASSIGNED",
      module: "ambulance",
      entityType: "AmbulanceTrip",
      entityId: trip.id,
      after: { vehicleId: req.body.vehicleId },
    },
    req,
  );
  sendSuccess(res, trip);
});

export const updateTripStatusHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const trip = await updateTripStatus(req.params.id, req.body);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "STATUS_CHANGE",
      module: "ambulance",
      entityType: "AmbulanceTrip",
      entityId: req.params.id,
      after: { status: req.body.status },
    },
    req,
  );
  sendSuccess(res, trip);
});

export const trackTripHandler = catchAsync(async (req: Request, res: Response) => {
  const trip = await trackTrip(req.params.id);
  sendSuccess(res, trip);
});
