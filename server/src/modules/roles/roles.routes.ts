import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorize } from "../../core/middleware/authorize.js";
import {
  createRoleHandler,
  listRolesHandler,
  getRoleHandler,
  updateRoleHandler,
  deleteRoleHandler,
  listPermissionsHandler,
} from "./roles.controller.js";

const rolesRoutes = Router();

rolesRoutes.use(authMiddleware);

rolesRoutes.get("/permissions", listPermissionsHandler);

rolesRoutes.post("/", authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"), createRoleHandler);
rolesRoutes.get("/", listRolesHandler);
rolesRoutes.get("/:id", getRoleHandler);
rolesRoutes.patch("/:id", authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"), updateRoleHandler);
rolesRoutes.delete("/:id", authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"), deleteRoleHandler);

export { rolesRoutes };
