import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorize } from "../../core/middleware/authorize.js";
import {
  getInboxHandler,
  markReadHandler,
  markAllReadHandler,
  getPreferencesHandler,
  updatePreferencesHandler,
  listTemplatesHandler,
  createTemplateHandler,
} from "./notifications.controller.js";

const notificationsRoutes = Router();

notificationsRoutes.use(authMiddleware);

// Own inbox + preferences (all users)
notificationsRoutes.get("/", getInboxHandler);
notificationsRoutes.patch("/:id/read", markReadHandler);
notificationsRoutes.patch("/read-all", markAllReadHandler);
notificationsRoutes.get("/preferences", getPreferencesHandler);
notificationsRoutes.patch("/preferences", updatePreferencesHandler);

// Template management (admin)
notificationsRoutes.get("/templates", authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"), listTemplatesHandler);
notificationsRoutes.post("/templates", authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"), createTemplateHandler);

export { notificationsRoutes };
