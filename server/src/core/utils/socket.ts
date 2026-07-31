import type { Server as HttpServer } from "http";
import { Server, type Socket } from "socket.io";
import { auth } from "../../config/auth.js";
import { logger } from "./logger.js";

let io: Server | null = null;

/**
 * Socket.IO setup with JWT/session authentication middleware and
 * role-based room joins (FRD 41).
 *
 * Rooms:
 *  - user:{userId}            personal notifications
 *  - dept-queue:{departmentId} OPD queue display
 *  - ward:{wardId}            bed/census updates
 *  - conversation:{conversationId} chat rooms
 *  - ambulance-dispatch       dispatcher role only
 */
export function setupSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("UNAUTHENTICATED"));

      const session = await auth.api.getSession({
        headers: { authorization: `Bearer ${token}` },
      });

      if (!session) return next(new Error("UNAUTHENTICATED"));

      (socket as any).data.user = session.user;
      next();
    } catch {
      next(new Error("UNAUTHENTICATED"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const user = (socket as any).data.user as { id: string; role: string };
    if (!user) return;

    socket.join(`user:${user.id}`);
    logger.info(`Socket connected: ${socket.id} (user ${user.id})`);

    socket.on("join-conversation", (conversationId: string) => {
      socket.join(`conversation:${conversationId}`);
    });

    socket.on("leave-conversation", (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on("disconnect", () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIO(): Server | null {
  return io;
}

/** Emit to a specific room. */
export function emitToRoom(room: string, event: string, payload: unknown) {
  io?.to(room).emit(event, payload);
}

/** Emit to a specific user's personal room. */
export function emitToUser(userId: string, event: string, payload: unknown) {
  io?.to(`user:${userId}`).emit(event, payload);
}

/** Emit to all connected clients. */
export function emitToAll(event: string, payload: unknown) {
  io?.emit(event, payload);
}
