import { Router } from "express";
import { authRoutes } from "../modules/auth/auth.routes.js";

const routes = Router();

routes.use("/auth", authRoutes);

export { routes };
