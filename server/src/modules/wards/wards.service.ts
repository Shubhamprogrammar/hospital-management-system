import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { cacheDel, cacheGet, cacheSet } from "../../config/redis.js";

export async function createWard(data: {
  name: string;
  wardType: string;
  departmentId?: string;
  floor: string;
  nursePatientRatio?: string;
}) {
  return prisma.ward.create({
    data: {
      name: data.name,
      wardType: data.wardType as any,
      departmentId: data.departmentId,
      floor: data.floor,
      nursePatientRatio: data.nursePatientRatio,
    },
  });
}

export async function listWards() {
  const wards = await prisma.ward.findMany({
    where: { deletedAt: null },
    include: {
      department: { select: { id: true, name: true, code: true } },
      _count: { select: { beds: { where: { deletedAt: null } } } },
    },
    orderBy: { name: "asc" },
  });

  // Live census per ward (FR 13.4-03)
  const census = await prisma.bed.groupBy({
    by: ["wardId", "status"],
    where: { deletedAt: null },
    _count: { _all: true },
  });

  return wards.map((ward) => {
    const wardCensus = census.filter((c) => c.wardId === ward.id);
    return {
      ...ward,
      census: {
        occupied: wardCensus.find((c) => c.status === "OCCUPIED")?._count._all ?? 0,
        available: wardCensus.find((c) => c.status === "AVAILABLE")?._count._all ?? 0,
        maintenance: wardCensus.find((c) => c.status === "MAINTENANCE")?._count._all ?? 0,
        cleaning: wardCensus.find((c) => c.status === "CLEANING")?._count._all ?? 0,
        reserved: wardCensus.find((c) => c.status === "RESERVED")?._count._all ?? 0,
      },
    };
  });
}

export async function getWardDetail(id: string) {
  const ward = await prisma.ward.findFirst({
    where: { id, deletedAt: null },
    include: {
      department: { select: { id: true, name: true } },
      beds: {
        where: { deletedAt: null },
        include: {
          currentAdmission: { select: { id: true, patient: { select: { name: true, uhid: true } } } },
        },
        orderBy: { bedNumber: "asc" },
      },
    },
  });
  if (!ward) throw new AppError("Ward not found", 404, undefined, "NOT_FOUND");
  return ward;
}

export async function updateWard(
  id: string,
  data: {
    name?: string;
    wardType?: string;
    departmentId?: string | null;
    floor?: string;
    nursePatientRatio?: string;
    isActive?: boolean;
  },
) {
  const existing = await prisma.ward.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError("Ward not found", 404, undefined, "NOT_FOUND");
  const ward = await prisma.ward.update({
    where: { id },
    data: { ...data, wardType: data.wardType as any },
  });
  await cacheDel(`ward:${id}:census`);
  return ward;
}

export async function deactivateWard(id: string) {
  const existing = await prisma.ward.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError("Ward not found", 404, undefined, "NOT_FOUND");

  // BR-01: ward with linked beds cannot be deleted — deactivate instead
  const bedCount = await prisma.bed.count({ where: { wardId: id, deletedAt: null } });
  if (bedCount > 0) {
    throw new AppError("Ward has linked beds — deactivate instead", 409, undefined, "ERR_WARD_HAS_BEDS");
  }

  const ward = await prisma.ward.update({
    where: { id },
    data: { isActive: false, deletedAt: new Date() },
  });
  await cacheDel(`ward:${id}:census`);
  return ward;
}

/** Real-time census (FR 13.7-06). */
export async function getWardCensus(id: string) {
  const cacheKey = `ward:${id}:census`;
  const cached = await cacheGet(cacheKey);
  if (cached) return JSON.parse(cached);

  const ward = await prisma.ward.findFirst({ where: { id, deletedAt: null } });
  if (!ward) throw new AppError("Ward not found", 404, undefined, "NOT_FOUND");

  const beds = await prisma.bed.findMany({
    where: { wardId: id, deletedAt: null },
    select: { status: true },
  });

  const admissions = await prisma.ipdAdmission.findMany({
    where: {
      wardId: id,
      status: { in: ["ADMITTED", "IN_TREATMENT", "DISCHARGE_PLANNED"] },
    },
    select: {
      id: true,
      admissionNo: true,
      admissionType: true,
      admittedAt: true,
      patient: { select: { id: true, name: true, uhid: true, phone: true } },
      bed: { select: { id: true, bedNumber: true, bedType: true } },
    },
    orderBy: { admittedAt: "desc" },
  });

  const result = {
    ward,
    totalBeds: beds.length,
    occupiedBeds: beds.filter((b) => b.status === "OCCUPIED").length,
    availableBeds: beds.filter((b) => b.status === "AVAILABLE").length,
    admissions,
  };
  await cacheSet(cacheKey, JSON.stringify(result), 60);
  return result;
}
