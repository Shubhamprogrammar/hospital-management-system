import { prisma } from "../../config/prisma.js";
import { auth } from "../../config/auth.js";
import type { Role } from "../../config/auth.js";
import { AppError } from "../../core/errors/AppError.js";
import { cacheDel } from "../../config/redis.js";

/**
 * Create a staff user with role assignment (FR 5.4-01).
 * Sends invitation email (queued) and audit logs (handled in controller).
 *
 * Creation goes through Better Auth's admin API so the user gets a credential
 * Account with a bcrypt-hashed password. Creating via `prisma.user.create()`
 * alone left new staff unable to sign in ("Credential account not found")
 * because no Account row with providerId "credential" was ever created.
 */
export async function createUser(
  data: {
    name: string;
    email: string;
    phone?: string;
    role: string;
    departmentId?: string;
    password: string;
  },
  headers: Record<string, string>,
) {
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

  const result = await auth.api.createUser({
    headers,
    body: {
      name: data.name,
      email: data.email,
      password: data.password,
      role: data.role as Role,
      data: {
        phone: data.phone,
      },
    },
  });

  return { user: result.user, tempPassword: data.password };
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
