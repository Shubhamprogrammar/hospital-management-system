import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { cacheDel } from "../../config/redis.js";
import { emitToRoom } from "../../core/utils/socket.js";

const LEGAL_TRANSITIONS: Record<string, string[]> = {
  AVAILABLE: ["OCCUPIED", "MAINTENANCE", "RESERVED"],
  OCCUPIED: ["CLEANING"],
  CLEANING: ["AVAILABLE", "MAINTENANCE"],
  MAINTENANCE: ["AVAILABLE"],
  RESERVED: ["OCCUPIED", "AVAILABLE"],
};

export async function createBed(data: { wardId: string; bedNumber: string; bedType?: string }) {
  const ward = await prisma.ward.findFirst({ where: { id: data.wardId, deletedAt: null } });
  if (!ward) throw new AppError("Ward not found", 404, undefined, "NOT_FOUND");

  const existing = await prisma.bed.findFirst({
    where: { wardId: data.wardId, bedNumber: data.bedNumber, deletedAt: null },
  });
  if (existing) {
    throw new AppError("Bed number already exists in this ward", 409, undefined, "CONFLICT");
  }

  return prisma.bed.create({
    data: {
      wardId: data.wardId,
      bedNumber: data.bedNumber,
      bedType: (data.bedType as any) ?? "GENERAL",
    },
  });
}

export async function listBeds(params: {
  wardId?: string;
  status?: string;
  bedType?: string;
  search?: string;
  page: number;
  limit: number;
}) {
  const where: Prisma.BedWhereInput = { deletedAt: null };
  if (params.wardId) where.wardId = params.wardId;
  if (params.status) where.status = params.status as any;
  if (params.bedType) where.bedType = params.bedType as any;
  if (params.search) {
    where.OR = [
      { bedNumber: { contains: params.search, mode: "insensitive" } },
      { ward: { name: { contains: params.search, mode: "insensitive" } } },
    ];
  }

  const [total, beds] = await prisma.$transaction([
    prisma.bed.count({ where }),
    prisma.bed.findMany({
      where,
      include: {
        ward: { select: { id: true, name: true, wardType: true } },
        currentAdmission: {
          select: { id: true, admissionNo: true, patient: { select: { name: true, uhid: true } } },
        },
      },
      orderBy: [{ wardId: "asc" }, { bedNumber: "asc" }],
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
  ]);

  return { total, beds };
}

export async function getBedDetail(id: string) {
  const bed = await prisma.bed.findFirst({
    where: { id, deletedAt: null },
    include: {
      ward: { select: { id: true, name: true, wardType: true, floor: true } },
      currentAdmission: {
        select: { id: true, admissionNo: true, patient: { select: { id: true, uhid: true, name: true } } },
      },
    },
  });
  if (!bed) throw new AppError("Bed not found", 404, undefined, "NOT_FOUND");
  return bed;
}

/**
 * Manual status change with legal-transition validation (FR 14.4-03).
 */
export async function changeBedStatus(
  id: string,
  data: { status: "AVAILABLE" | "MAINTENANCE" | "CLEANING"; reason?: string },
) {
  const bed = await prisma.bed.findFirst({ where: { id, deletedAt: null } });
  if (!bed) throw new AppError("Bed not found", 404, undefined, "NOT_FOUND");

  const allowed = LEGAL_TRANSITIONS[bed.status] ?? [];
  if (!allowed.includes(data.status)) {
    throw new AppError(
      `Invalid status transition: ${bed.status} → ${data.status}`,
      400,
      undefined,
      "ERR_INVALID_STATUS_TRANSITION",
    );
  }

  const updated = await prisma.bed.update({ where: { id }, data: { status: data.status } });
  await cacheDel(`ward:${bed.wardId}:census`);
  emitToRoom(`ward:${bed.wardId}`, "beds:status-changed", { bedId: id, status: data.status });
  emitToRoom(`ward:${bed.wardId}`, "wards:census-updated", { wardId: bed.wardId });
  return updated;
}

export async function removeBed(id: string) {
  const bed = await prisma.bed.findFirst({ where: { id, deletedAt: null } });
  if (!bed) throw new AppError("Bed not found", 404, undefined, "NOT_FOUND");
  if (bed.status === "OCCUPIED") {
    throw new AppError("Cannot remove an occupied bed", 409, undefined, "ERR_BED_HAS_OCCUPANT");
  }

  const updated = await prisma.bed.update({
    where: { id },
    data: { deletedAt: new Date(), status: "MAINTENANCE" },
  });
  await cacheDel(`ward:${bed.wardId}:census`);
  return updated;
}
