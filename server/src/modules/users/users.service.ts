import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { cacheDel } from "../../config/redis.js";

/**
 * Create a staff user with role assignment (FR 5.4-01).
 * Sends invitation email (queued) and audit logs (handled in controller).
 */
export async function createUser(data: {
  name: string;
  email: string;
  phone?: string;
  role: string;
  departmentId?: string;
}) {
  const existing = await prisma.user.findFirst({
    where: { email: data.email },
  });
  if (existing) {
    throw new AppError(
      "User with this email already exists",
      409,
      undefined,
      "ERR_DUPLICATE_EMAIL",
    );
  }

  // Create user with a random temp password — Better Auth's createUser
  // is used for hashing; here we create via Prisma with a pending state.
  const tempPassword = Math.random().toString(36).slice(-10);
  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      role: data.role,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      createdAt: true,
    },
  });

  // TODO: hash tempPassword with bcrypt and enqueue send-invitation-email job
  return { user, tempPassword };
}

export async function listUsers(params: {
  page: number;
  limit: number;
  search?: string;
  role?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  const where: Record<string, unknown> = { deletedAt: null };

  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: "insensitive" } },
      { email: { contains: params.search, mode: "insensitive" } },
      { phone: { contains: params.search, mode: "insensitive" } },
    ];
  }
  if (params.role) where.role = params.role;
  if (params.status === "ACTIVE") where.isActive = true;
  if (params.status === "INACTIVE") where.isActive = false;

  const [total, users] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { [params.sortBy ?? "createdAt"]: params.sortOrder ?? "desc" },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    }),
  ]);

  return { total, users };
}

export async function getUserDetail(id: string) {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      isLocked: true,
      lastLoginAt: true,
      createdAt: true,
      doctors: { select: { id: true, specialization: true, departmentId: true } },
      patients: { select: { id: true, uhid: true } },
    },
  });
  if (!user) throw new AppError("User not found", 404, undefined, "NOT_FOUND");
  return user;
}

export async function updateUser(
  id: string,
  data: { name?: string; phone?: string; role?: string; departmentId?: string; isActive?: boolean },
) {
  const existing = await prisma.user.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError("User not found", 404, undefined, "NOT_FOUND");

  const user = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
    },
  });

  // Invalidate RBAC permission cache on role change (FR 5.14)
  if (data.role) {
    await cacheDel(`user:${id}:permissions`);
  }

  return user;
}

export async function deactivateUser(id: string) {
  const existing = await prisma.user.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError("User not found", 404, undefined, "NOT_FOUND");

  return prisma.user.update({
    where: { id },
    data: { isActive: false, deletedAt: new Date() },
    select: { id: true, name: true, isActive: true },
  });
}

export async function updateOwnProfile(
  userId: string,
  data: { name?: string; phone?: string },
) {
  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, name: true, email: true, phone: true, role: true },
  });
  return user;
}
