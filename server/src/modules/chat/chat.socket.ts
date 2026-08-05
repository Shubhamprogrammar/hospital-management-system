import type { Server as HttpServer } from "http";
import { Server } from "socket.io";

export function setupSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, { cors: { origin: "*" } });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("join", (conversationId: string) => {
      socket.join(conversationId);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  return io;
}
