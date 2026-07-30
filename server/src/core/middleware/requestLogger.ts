import morgan from "morgan";
import type { IncomingMessage } from "http";
import { env } from "../../config/env.js";

/**
 * Request logger using Morgan.
 * In development: detailed 'dev' format.
 * In production: combined Apache-style format.
 */
export const requestLogger = morgan(
  env.NODE_ENV === "development" ? "dev" : "combined",
  {
    skip: (req: IncomingMessage) => {
      // Skip health check endpoints in production
      if (env.NODE_ENV === "production" && req.url === "/api/v1/health") {
        return true;
      }
      return false;
    },
  },
);
