import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { cacheDel, cacheGet, cacheSet } from "../../config/redis.js";

const DEPT_LIST_CACHE_KEY = "departments:list";

export async function createDepartment(data: {
  name: string;
  code: string;
  description?: string;
  hodUserId?: string;
}) {
  // Validate HOD is a doctor (FR 7.6)
  if (data.hodUserId) {
    const doctor = await prisma.doctor.findFirst({
      where: { userId: data.hodUserId, deletedAt: null },
    });
    if (!doctor) {
      throw new AppError("HOD must be a user with role DOCTOR", 400, undefined, "VALIDATION_ERROR");
    }
  }

  return prisma.$transaction(async (tx) => {
    const department = await tx.department.create({
      data: {
        name: data.name,
        code: data.code,
        description: data.description,
        hodUserId: data.hodUserId,
      },
    });
    await cacheDel(DEPT_LIST_CACHE_KEY);
    return department;
  });
}

export async function listDepartments() {
  const cached = await cacheGet(DEPT_LIST_CACHE_KEY);
  if (cached) return JSON.parse(cached);

  const departments = await prisma.department.findMany({
    where: { deletedAt: null },
    include: {
      _count: { select: { doctors: { where: { isActive: true } }, wards: { where: { isActive: true } } } },
    },
    orderBy: { name: "asc" },
  });

  await cacheSet(DEPT_LIST_CACHE_KEY, JSON.stringify(departments), 600); // 10 min TTL
  return departments;
}

export async function getDepartmentDetail(id: string) {
  const department = await prisma.department.findFirst({
    where: { id, deletedAt: null },
    include: {
      hod: { select: { id: true, name: true, email: true } },
      _count: {
        select: {
          doctors: { where: { isActive: true } },
          wards: { where: { isActive: true } },
          appointments: true,
        },
      },
    },
  });
  if (!department) throw new AppError("Department not found", 404, undefined, "NOT_FOUND");
  return department;
}

export async function updateDepartment(
  id: string,
  data: { name?: string; code?: string; description?: string; hodUserId?: string | null; isActive?: boolean },
) {
  const existing = await prisma.department.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError("Department not found", 404, undefined, "NOT_FOUND");

  if (data.hodUserId) {
    const doctor = await prisma.doctor.findFirst({
      where: { userId: data.hodUserId, deletedAt: null },
    });
    if (!doctor) {
      throw new AppError("HOD must be a user with role DOCTOR", 400, undefined, "VALIDATION_ERROR");
    }
  }

  const department = await prisma.department.update({ where: { id }, data });
  await cacheDel(DEPT_LIST_CACHE_KEY);
  return department;
}

export async function deactivateDepartment(id: string) {
  const existing = await prisma.department.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError("Department not found", 404, undefined, "NOT_FOUND");

  const department = await prisma.department.update({
    where: { id },
    data: { isActive: false, deletedAt: new Date() },
  });
  await cacheDel(DEPT_LIST_CACHE_KEY);
  return department;
}

export async function listDepartmentDoctors(id: string) {
  const doctors = await prisma.doctor.findMany({
    where: { departmentId: id, isActive: true, deletedAt: null },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return doctors;
}
