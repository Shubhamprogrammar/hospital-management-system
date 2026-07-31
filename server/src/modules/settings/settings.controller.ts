import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess } from "../../core/utils/apiResponse.js";
import { writeAuditLog } from "../../core/utils/audit.js";
import { emitToRoom } from "../../core/utils/socket.js";
import {
  getHospitalProfile,
  updateHospitalProfile,
  getBusinessRules,
  updateBusinessRule,
  listFeatureFlags,
  toggleFeatureFlag,
  setIntegrationCredential,
  getIntegrationCredentials,
} from "./settings.service.js";

export const getHospitalProfileHandler = catchAsync(async (_req: Request, res: Response) => {
  const profile = await getHospitalProfile();
  sendSuccess(res, profile);
});

export const updateHospitalProfileHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const profile = await updateHospitalProfile(req.body);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "PROFILE_UPDATED",
      module: "settings",
      entityType: "HospitalProfile",
      entityId: profile.id,
      after: req.body,
    },
    req,
  );
  emitToRoom("admins", "settings:updated", { key: "hospital-profile" });
  sendSuccess(res, profile);
});

export const getBusinessRulesHandler = catchAsync(async (_req: Request, res: Response) => {
  const rules = await getBusinessRules();
  sendSuccess(res, rules);
});

export const updateBusinessRuleHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const rule = await updateBusinessRule(req.params.key, req.body.value);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "BUSINESS_RULE_CHANGED",
      module: "settings",
      entityType: "BusinessRule",
      entityId: rule.id,
      after: { key: rule.key },
    },
    req,
  );
  emitToRoom("admins", "settings:updated", { key: `business-rule:${rule.key}` });
  sendSuccess(res, rule);
});

export const listFeatureFlagsHandler = catchAsync(async (_req: Request, res: Response) => {
  const flags = await listFeatureFlags();
  sendSuccess(res, flags);
});

export const toggleFeatureFlagHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const flag = await toggleFeatureFlag(req.params.key, req.body.isEnabled);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "FEATURE_FLAG_TOGGLED",
      module: "settings",
      entityType: "FeatureFlag",
      entityId: flag.id,
      after: { key: flag.key, isEnabled: flag.isEnabled },
    },
    req,
  );
  emitToRoom("admins", "settings:updated", { key: `feature-flag:${flag.key}` });
  sendSuccess(res, flag);
});

export const setIntegrationCredentialHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const credential = await setIntegrationCredential(req.params.provider, req.body);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "CREDENTIAL_UPDATED",
      module: "settings",
      entityType: "IntegrationCredential",
      entityId: credential.id,
      after: { provider: req.params.provider },
    },
    req,
  );
  // Never return the secret (FR 30.5 BR-01)
  sendSuccess(res, { provider: req.params.provider, updated: true, masked: true });
});

export const getIntegrationCredentialsHandler = catchAsync(async (_req: Request, res: Response) => {
  const credentials = await getIntegrationCredentials();
  sendSuccess(res, credentials);
});
