import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { router } from "./routes/index.js";
import { errorHandler } from "./core/middleware/errorHandler.js";
import { requestLogger } from "./core/middleware/requestLogger.js";
import { env } from "./config/env.js";

const app = express();

// Trust proxy for correct protocol/host behind reverse proxies
app.set("trust proxy", true);

// Security headers
app.use(helmet());

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

// Global error handler (must be last)
app.use(errorHandler);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: "Route not found",
    },
  });
});

export { app };
