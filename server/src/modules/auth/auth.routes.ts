import { Router } from "express";
import { listUsers } from "./auth.controller.js";

const authRoutes = Router();

authRoutes.get("/users", listUsers);

export { authRoutes };
