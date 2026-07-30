import { Router } from "express";

const router = Router();

// Health check
router.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "Hospital Management System API is running",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Import module routes
import { authRoutes } from "../modules/auth/auth.routes.js";

// Versioned API routes under /api/v1
router.use("/v1/auth", authRoutes);

export { router };
