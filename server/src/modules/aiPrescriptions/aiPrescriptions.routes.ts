import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorize } from "../../core/middleware/authorize.js";
import {
  suggestHandler,
  getSuggestionHandler,
  acceptSuggestionHandler,
  editSuggestionHandler,
  rejectSuggestionHandler,
} from "./aiPrescriptions.controller.js";

const aiPrescriptionsRoutes = Router();

aiPrescriptionsRoutes.use(authMiddleware);

// Doctor-only clinical flow
aiPrescriptionsRoutes.post("/suggest", authorize("SUPER_ADMIN", "DOCTOR"), suggestHandler);
aiPrescriptionsRoutes.get("/:id", authorize("SUPER_ADMIN", "DOCTOR"), getSuggestionHandler);
aiPrescriptionsRoutes.post("/:id/accept", authorize("SUPER_ADMIN", "DOCTOR"), acceptSuggestionHandler);
aiPrescriptionsRoutes.patch("/:id/edit", authorize("SUPER_ADMIN", "DOCTOR"), editSuggestionHandler);
aiPrescriptionsRoutes.post("/:id/reject", authorize("SUPER_ADMIN", "DOCTOR"), rejectSuggestionHandler);

export { aiPrescriptionsRoutes };
