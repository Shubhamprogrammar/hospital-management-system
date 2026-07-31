import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import compression from "compression";
import { router } from "./routes/index.js";
import { globalErrorHandler } from "./core/errors/errorHandler.js";
import { requestLogger } from "./core/middleware/requestLogger.js";
import { requestIdMiddleware } from "./core/middleware/requestId.js";
import { env } from "./config/env.js";

const app = express();

// Trust proxy for correct protocol/host behind reverse proxies
app.set("trust proxy", true);

// Request ID for tracing (FRD 3.2)
app.use(requestIdMiddleware);

// Security headers
app.use(helmet());

// Response compression
app.use(compression());

// CORS
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Set-Cookie"],
  }),
);

// Request parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser(env.BETTER_AUTH_SECRET));

// Request logging
app.use(requestLogger);

// API routes
app.use("/api", router);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `Route not found: ${req.originalUrl}`,
    },
    meta: { requestId: (req as any).requestId },
  });
});

// Global error handler (must be last)
app.use(globalErrorHandler);

export { app };
