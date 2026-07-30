import "dotenv/config";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./core/utils/logger.js";
import { connectMongo } from "./config/mongoose.js";

process.on("uncaughtException", (err) => {
  logger.error("UNCAUGHT EXCEPTION! Shutting down...", {
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

async function main() {
  // Connect to MongoDB (for chat & chatbot features)
  try {
    await connectMongo();
  } catch (error) {
    console.warn(
      "⚠️  MongoDB connection failed (chat features may be unavailable):",
      (error as Error).message,
    );
  }

  // Connect to Redis (for caching, if configured)
  try {
    const { connectRedis } = await import("./config/redis.js");
    await connectRedis();
  } catch {
    // Redis is optional
  }

  // Start HTTP server
  const server = app.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT}`);
    console.log(`
🚀 Hospital Management System API
   • Environment: ${env.NODE_ENV}
   • Port: ${env.PORT}
   • Base URL: http://localhost:${env.PORT}/api/v1
   • Health: http://localhost:${env.PORT}/api/health
    `);
  });

  process.on("unhandledRejection", (err: unknown) => {
    logger.error("UNHANDLED REJECTION! Shutting down...", {
      error: err instanceof Error ? err.message : String(err),
    });
    server.close(() => process.exit(1));
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n📥 Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
      console.log("✅ Server closed");
      process.exit(0);
    });

    // Force shutdown after 10s
    setTimeout(() => {
      console.error("❌ Forced shutdown after timeout");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  console.error("❌ Failed to start server:", error);
  process.exit(1);
});
