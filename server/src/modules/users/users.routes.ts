import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorize } from "../../core/middleware/authorize.js";
import {
  createUserHandler,
  listUsersHandler,
  getUserHandler,
  updateUserHandler,
  deactivateUserHandler,
  getMeHandler,
  updateMeHandler,
  uploadAvatarHandler,
  bulkImportUsersHandler,
} from "./users.controller.js";

const usersRoutes = Router();

usersRoutes.use(authMiddleware);

// Own profile (any authenticated user)
usersRoutes.get("/me", getMeHandler);
usersRoutes.patch("/me", updateMeHandler);

// Admin-only user management
usersRoutes.post(
  "/",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"),
  createUserHandler,
);
usersRoutes.get(
  "/",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"),
  listUsersHandler,
);
usersRoutes.get(
  "/:id",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"),
  getUserHandler,
);
usersRoutes.patch(
  "/:id",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"),
  updateUserHandler,
);
usersRoutes.delete(
  "/:id",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"),
  deactivateUserHandler,
);
usersRoutes.post(
  "/:id/avatar",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"),
  uploadAvatarHandler,
);
usersRoutes.post(
  "/bulk-import",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"),
  bulkImportUsersHandler,
);

export { usersRoutes };
