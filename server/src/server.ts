import "dotenv/config";
import { app } from "./app.js";
import { connectMongo } from "./config/mongoose.js";
import { env } from "./config/env.js";
import { logger } from "./core/utils/logger.js";

process.on("uncaughtException", (err) => {
  logger.error("UNCAUGHT EXCEPTION! Shutting down...", { error: err.message, stack: err.stack });
  process.exit(1);
});

async function main() {
  await connectMongo();

  const server = app.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT}`);
  });

  process.on("unhandledRejection", (err: unknown) => {
    logger.error("UNHANDLED REJECTION! Shutting down...", {
      error: err instanceof Error ? err.message : String(err),
    });
    server.close(() => process.exit(1));
  });
}

main().catch((err) => {
  logger.error("Failed to start server", { error: String(err) });
  process.exit(1);
});
