import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { cacheGet, cacheSet, cacheDel } from "../../config/redis.js";
import { parsePagination } from "../../core/utils/pagination.js";

export async function getInbox(userId: string, pageRaw?: unknown, limitRaw?: unknown) {
  const pagination = parsePagination(pageRaw, limitRaw);
  const where = { userId };

  const [total, notifications] = await prisma.$transaction([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.limit,
    }),
  ]);

  // Unread count for badge
  const unread = await prisma.notification.count({ where: { userId, status: { not: "READ" } } });
  await cacheSet(`notifications:unread-count:${userId}`, String(unread));

  return { total, notifications, unread, pagination };
}

export async function markRead(userId: string, notificationId: string) {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
  });
  if (!notification) throw new AppError("Notification not found", 404, undefined, "NOT_FOUND");

  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: { status: "READ", readAt: new Date() },
  });

  await refreshUnread(userId);
  return updated;
}

export async function markAllRead(userId: string) {
  const result = await prisma.notification.updateMany({
    where: { userId, status: { not: "READ" } },
    data: { status: "READ", readAt: new Date() },
  });
  await refreshUnread(userId);
  return { updated: result.count };
}

export async function getPreferences(userId: string) {
  return prisma.notificationPreference.findMany({
    where: { userId },
  });
}

export async function updatePreferences(
  userId: string,
  prefs: { category: string; channel: string; isEnabled: boolean }[],
) {
  await prisma.$transaction(async (tx) => {
    for (const pref of prefs) {
      await tx.notificationPreference.upsert({
        where: {
          userId_category_channel: {
            userId,
            category: pref.category,
            channel: pref.channel as any,
          },
        },
        update: { isEnabled: pref.isEnabled },
        create: {
          userId,
          category: pref.category,
          channel: pref.channel as any,
          isEnabled: pref.isEnabled,
        },
      });
    }
  });
  return getPreferences(userId);
}

export async function listTemplates() {
  return prisma.notificationTemplate.findMany({ orderBy: { key: "asc" } });
}

export async function createTemplate(data: {
  key: string;
  channel: string;
  subject?: string;
  bodyTemplate: string;
  isCritical?: boolean;
}) {
  return prisma.notificationTemplate.create({
    data: {
      key: data.key,
      channel: data.channel as any,
      subject: data.subject,
      bodyTemplate: data.bodyTemplate,
      isCritical: data.isCritical ?? false,
    },
  });
}

async function refreshUnread(userId: string) {
  const unread = await prisma.notification.count({
    where: { userId, status: { not: "READ" } },
  });
  await cacheSet(`notifications:unread-count:${userId}`, String(unread));
  return unread;
}
