import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import {
  presignHandler,
  confirmUploadHandler,
  getDownloadUrlHandler,
  deleteUploadHandler,
} from "./uploads.controller.js";

const uploadsRoutes = Router();

uploadsRoutes.use(authMiddleware);

uploadsRoutes.post("/presign", presignHandler);
uploadsRoutes.post("/:id/confirm", confirmUploadHandler);
uploadsRoutes.get("/:id/download-url", getDownloadUrlHandler);
uploadsRoutes.delete("/:id", deleteUploadHandler);

export { uploadsRoutes };
