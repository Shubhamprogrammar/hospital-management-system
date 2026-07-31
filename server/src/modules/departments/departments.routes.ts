import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorize } from "../../core/middleware/authorize.js";
import {
  createDepartmentHandler,
  listDepartmentsHandler,
  getDepartmentHandler,
  updateDepartmentHandler,
  deactivateDepartmentHandler,
  listDepartmentDoctorsHandler,
} from "./departments.controller.js";

const departmentsRoutes = Router();

departmentsRoutes.use(authMiddleware);

departmentsRoutes.post("/", authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"), createDepartmentHandler);
departmentsRoutes.get("/", listDepartmentsHandler);
departmentsRoutes.get("/:id/doctors", listDepartmentDoctorsHandler);
departmentsRoutes.get("/:id", getDepartmentHandler);
departmentsRoutes.patch("/:id", authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"), updateDepartmentHandler);
departmentsRoutes.delete("/:id", authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"), deactivateDepartmentHandler);

export { departmentsRoutes };
