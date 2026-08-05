import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { emitToRoom, emitToAll } from "../../core/utils/socket.js";

export async function addVehicle(data: {
  registrationNo: string;
  type: "BASIC" | "ICU" | "MORTUARY";
  driverId?: string;
}) {
  const existing = await prisma.ambulanceVehicle.findUnique({
    where: { registrationNo: data.registrationNo },
  });
  if (existing) {
    throw new AppError("Vehicle with this registration number already exists", 409, undefined, "CONFLICT");
  }
  return prisma.ambulanceVehicle.create({ data });
}

export async function listVehicles() {
  return prisma.ambulanceVehicle.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function raiseRequest(data: {
  patientId?: string;
  requestedBy?: string;
  pickupAddress: string;
  pickupLat?: number;
  pickupLng?: number;
  dropAddress?: string;
  urgency?: "EMERGENCY" | "URGENT" | "ROUTINE";
}) {
  const request = await prisma.ambulanceRequest.create({
    data: {
      patientId: data.patientId,
      requestedBy: data.requestedBy,
      pickupAddress: data.pickupAddress,
      pickupLat: data.pickupLat,
      pickupLng: data.pickupLng,
      dropAddress: data.dropAddress,
      urgency: data.urgency ?? "ROUTINE",
    },
  });
  emitToRoom("ambulance-dispatch", "ambulance:request-created", { id: request.id, urgency: request.urgency });
  return request;
}

export async function listRequests(status?: string) {
  return prisma.ambulanceRequest.findMany({
    where: status ? { status: status as any } : {},
    include: {
      patient: { select: { id: true, uhid: true, name: true, phone: true } },
      trip: { select: { id: true, status: true, vehicle: { select: { registrationNo: true } } } },
    },
    orderBy: [{ urgency: "desc" }, { createdAt: "asc" }],
  });
}

/**
 * Assign vehicle + driver (FR 15.4-02). One active trip per vehicle (BR-01).
 */
export async function assignVehicle(
  requestId: string,
  data: { vehicleId: string; driverId?: string },
) {
  const request = await prisma.ambulanceRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new AppError("Request not found", 404, undefined, "NOT_FOUND");
  if (request.status !== "PENDING") {
    throw new AppError("Only pending requests can be assigned", 409, undefined, "CONFLICT");
  }

  const vehicle = await prisma.ambulanceVehicle.findUnique({ where: { id: data.vehicleId } });
  if (!vehicle) throw new AppError("Vehicle not found", 404, undefined, "NOT_FOUND");
  if (vehicle.status === "ON_TRIP") {
    throw new AppError("Vehicle is already on an active trip", 409, undefined, "ERR_VEHICLE_ALREADY_ON_TRIP");
  }

  return prisma.$transaction(async (tx) => {
    await tx.ambulanceVehicle.update({
      where: { id: data.vehicleId },
      data: { status: "ON_TRIP", driverId: data.driverId },
    });

    const trip = await tx.ambulanceTrip.create({
      data: {
        requestId,
        vehicleId: data.vehicleId,
        driverId: data.driverId,
      },
    });

    await tx.ambulanceRequest.update({
      where: { id: requestId },
      data: { status: "ASSIGNED" },
    });

    emitToAll("ambulance:request-assigned", { requestId, tripId: trip.id, vehicleId: data.vehicleId });
    return trip;
  });
}

const TRIP_FLOW = [
  "EN_ROUTE_TO_PICKUP",
  "ARRIVED",
  "TRANSPORTING",
  "ARRIVED_HOSPITAL",
  "COMPLETED",
];

/**
 * Driver updates trip status (FR 15.4-03). Sequential state machine.
 */
export async function updateTripStatus(
  tripId: string,
  data: { status: string; lat?: number; lng?: number },
) {
  const trip = await prisma.ambulanceTrip.findUnique({ where: { id: tripId } });
  if (!trip) throw new AppError("Trip not found", 404, undefined, "NOT_FOUND");

  const currentIdx = TRIP_FLOW.indexOf(trip.status);
  const nextIdx = TRIP_FLOW.indexOf(data.status);
  if (currentIdx === -1 || nextIdx === -1 || nextIdx !== currentIdx + 1) {
    throw new AppError(
      `Invalid status transition: ${trip.status} → ${data.status}`,
      400,
      undefined,
      "ERR_INVALID_STATUS_TRANSITION",
    );
  }

  const updated = await prisma.ambulanceTrip.update({
    where: { id: tripId },
    data: {
      status: data.status as any,
      completedAt: data.status === "COMPLETED" ? new Date() : undefined,
    },
  });

  if (data.status === "COMPLETED") {
    // Free the vehicle (FR 15.4-04 → billable record)
    await prisma.ambulanceVehicle.update({
      where: { id: trip.vehicleId },
      data: { status: "AVAILABLE", driverId: null },
    });
    await prisma.ambulanceRequest.update({
      where: { id: trip.requestId },
      data: { status: "COMPLETED" },
    });
  }

  emitToAll("ambulance:trip-status-changed", { tripId, status: data.status });
  if (data.lat !== undefined && data.lng !== undefined) {
    emitToAll("ambulance:location-updated", { tripId, lat: data.lat, lng: data.lng });
  }

  return updated;
}

export async function trackTrip(tripId: string) {
  const trip = await prisma.ambulanceTrip.findUnique({
    where: { id: tripId },
    include: {
      request: {
        include: {
          patient: { select: { id: true, uhid: true, name: true } },
        },
      },
      vehicle: { select: { id: true, registrationNo: true, type: true } },
    },
  });
  if (!trip) throw new AppError("Trip not found", 404, undefined, "NOT_FOUND");
  return trip;
}
