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
aiPrescriptionsRoutes.post("/suggest", authorize("DOCTOR"), suggestHandler);
aiPrescriptionsRoutes.get("/:id", authorize("DOCTOR"), getSuggestionHandler);
aiPrescriptionsRoutes.post("/:id/accept", authorize("DOCTOR"), acceptSuggestionHandler);
aiPrescriptionsRoutes.patch("/:id/edit", authorize("DOCTOR"), editSuggestionHandler);
aiPrescriptionsRoutes.post("/:id/reject", authorize("DOCTOR"), rejectSuggestionHandler);

export { aiPrescriptionsRoutes };
