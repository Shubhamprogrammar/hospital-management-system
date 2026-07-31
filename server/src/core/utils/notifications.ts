import { prisma } from "../../config/prisma.js";
import { emitToUser } from "./socket.js";
import { cacheGet, cacheSet } from "../../config/redis.js";
import { logger } from "./logger.js";
import { Prisma } from "../../generated/prisma/client.js";

/**
 * Creates an in-app notification, bumps the unread counter in Redis
 * and emits a real-time socket event (FRD 24.14).
 */
export async function notifyUser(
  userId: string,
  templateKey: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId,
        templateKey,
        channel: "IN_APP",
        payload: (payload ?? {}) as Prisma.InputJsonValue,
        status: "SENT",
      },
    });

    // Bump unread counter
    const unreadKey = `notifications:unread-count:${userId}`;
    const current = Number((await cacheGet(unreadKey)) ?? "0");
    await cacheSet(unreadKey, String(current + 1));

    emitToUser(userId, "notifications:new", notification);
    emitToUser(userId, "notifications:unread-count-updated", { count: current + 1 });
  } catch (error) {
    logger.error("Failed to create notification", { error: (error as Error).message });
  }
}
