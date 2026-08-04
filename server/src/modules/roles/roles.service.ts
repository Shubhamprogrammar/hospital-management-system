import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { cacheDel } from "../../config/redis.js";

export async function listPermissions() {
  return prisma.permission.findMany({ orderBy: { module: "asc" } });
}

export async function createRole(data: { name: string; description?: string; permissionKeys?: string[] }) {
  const existing = await prisma.role.findUnique({ where: { name: data.name } });
  if (existing) throw new AppError("Role name already exists", 409, undefined, "CONFLICT");

  return prisma.$transaction(async (tx) => {
    const role = await tx.role.create({
      data: { name: data.name, description: data.description, isSystem: false },
    });

    if (data.permissionKeys?.length) {
      // Drop nullish/empty entries so Prisma never emits `IN (NULL)`, but still
      // reject the payload if any entry was invalid (matches the old behavior).
      const permissionKeys = data.permissionKeys.filter((k): k is string => typeof k === "string" && k.length > 0);
      if (permissionKeys.length !== data.permissionKeys.length) {
        throw new AppError("One or more permission keys do not exist", 400, undefined, "ERR_INVALID_PERMISSION");
      }
      const permissions = await tx.permission.findMany({
        where: { key: { in: permissionKeys } },
        select: { id: true },
      });
      if (permissions.length !== permissionKeys.length) {
        throw new AppError("One or more permission keys do not exist", 400, undefined, "ERR_INVALID_PERMISSION");
      }
      await tx.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      });
    }

    return role;
  });
}

export async function listRoles() {
  const roles = await prisma.role.findMany({
    where: { deletedAt: null },
    include: {
      rolePermissions: {
        include: { permission: { select: { id: true, key: true, module: true } } },
      },
      _count: { select: { rolePermissions: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return roles;
}

export async function getRoleDetail(id: string) {
  const role = await prisma.role.findFirst({
    where: { id, deletedAt: null },
    include: {
      rolePermissions: {
        include: { permission: { select: { id: true, key: true, module: true, description: true } } },
      },
    },
  });
  if (!role) throw new AppError("Role not found", 404, undefined, "NOT_FOUND");
  return role;
}

export async function updateRole(
  id: string,
  data: { name?: string; description?: string; permissionKeys?: string[] },
) {
  const role = await prisma.role.findFirst({ where: { id, deletedAt: null } });
  if (!role) throw new AppError("Role not found", 404, undefined, "NOT_FOUND");
  if (role.isSystem && data.name && data.name !== role.name) {
    throw new AppError("System roles cannot be renamed", 403, undefined, "ERR_SYSTEM_ROLE_IMMUTABLE");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.role.update({
      where: { id },
      data: { name: data.name, description: data.description },
    });

    if (data.permissionKeys) {
      // Diff old vs new permissions
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      // Drop nullish/empty entries so Prisma never emits `IN (NULL)`.
      const permissionKeys = data.permissionKeys.filter((k): k is string => typeof k === "string" && k.length > 0);
      const permissions = permissionKeys.length
        ? await tx.permission.findMany({
            where: { key: { in: permissionKeys } },
            select: { id: true },
          })
        : [];
      if (permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({ roleId: id, permissionId: p.id })),
        });
      }
    }

    // Invalidate permission cache (FR 6.4-03)
    await cacheDel(`permissions:role:${id}`);

    return updated;
  });
}

export async function deleteRole(id: string) {
  const role = await prisma.role.findFirst({ where: { id, deletedAt: null } });
  if (!role) throw new AppError("Role not found", 404, undefined, "NOT_FOUND");
  if (role.isSystem) {
    throw new AppError("System roles are immutable and cannot be deleted", 403, undefined, "ERR_SYSTEM_ROLE_IMMUTABLE");
  }

  // BR-02: role in use cannot be deleted
  const inUse = await prisma.user.count({ where: { role: role.name, deletedAt: null } });
  if (inUse > 0) {
    throw new AppError("Role is assigned to users — reassign before deleting", 409, undefined, "ERR_ROLE_IN_USE");
  }

  return prisma.role.update({ where: { id }, data: { deletedAt: new Date() } });
}
