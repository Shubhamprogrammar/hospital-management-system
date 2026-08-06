import type { Server as HttpServer } from "http";
import { Server, type Socket } from "socket.io";
import { auth } from "../../config/auth.js";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { logger } from "./logger.js";

let io: Server | null = null;

/**
 * Resolves a user from a raw session token.
 *
 * better-auth's `auth.api.getSession()` only reads the *signed* session cookie
 * (`<token>.<hmac>`), so a bare bearer token always resolves to `null`. Socket
 * clients can't send the signed cookie (it's host-scoped to the app origin, and
 * the socket connects cross-origin), so look the token up directly in the
 * session store instead — the same row the signed cookie encodes.
 */
async function getSessionByToken(token: string) {
  const session = await prisma.session.findUnique({ where: { token } });
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return null;
  return { session, user };
}

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
    // Credentials (cookies) are used for auth, so the origin must be explicit
    // (a wildcard is rejected by browsers for credentialed requests).
    cors: { origin: env.clientUrls, credentials: true, methods: ["GET", "POST"] },
  });

  io.use(async (socket, next) => {
    try {
      // Prefer an explicit bearer token (auth: { token } in the handshake),
      // otherwise fall back to the session cookie — the same mechanism every
      // REST call uses. The client's Socket.IO connection only sends cookies
      // (credentials: include), so without this fallback no one can connect.
      const token = socket.handshake.auth?.token;
      const session = token
        ? await getSessionByToken(token)
        : await auth.api.getSession({
            headers: { cookie: socket.handshake.headers.cookie ?? "" },
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
