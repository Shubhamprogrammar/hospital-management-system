import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorize } from "../../core/middleware/authorize.js";
import {
  getHospitalProfileHandler,
  updateHospitalProfileHandler,
  getBusinessRulesHandler,
  updateBusinessRuleHandler,
  listFeatureFlagsHandler,
  toggleFeatureFlagHandler,
  setIntegrationCredentialHandler,
  getIntegrationCredentialsHandler,
} from "./settings.controller.js";

const settingsRoutes = Router();

settingsRoutes.use(authMiddleware);

// Read access for staff (feature flags / business rules are read-heavy)
settingsRoutes.get("/hospital-profile", getHospitalProfileHandler);
settingsRoutes.get("/business-rules", getBusinessRulesHandler);
settingsRoutes.get("/feature-flags", listFeatureFlagsHandler);
settingsRoutes.get("/integrations", getIntegrationCredentialsHandler);

// Write access: admin only
settingsRoutes.patch(
  "/hospital-profile",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"),
  updateHospitalProfileHandler,
);
settingsRoutes.patch(
  "/business-rules/:key",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"),
  updateBusinessRuleHandler,
);
settingsRoutes.patch(
  "/feature-flags/:key",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"),
  toggleFeatureFlagHandler,
);
settingsRoutes.put(
  "/integrations/:provider",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN"),
  setIntegrationCredentialHandler,
);

export { settingsRoutes };
