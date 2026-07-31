import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { cacheDel, cacheGet, cacheSet } from "../../config/redis.js";
import { createCipheriv, randomBytes } from "crypto";

const RULES_CACHE_KEY = "settings:business-rules";
const FLAGS_CACHE_KEY = "settings:feature-flags";
const ENC_KEY = process.env.CREDENTIALS_ENCRYPTION_KEY ?? "hms-default-encryption-key-change-me-32b!!";

export async function getHospitalProfile() {
  const profile = await prisma.hospitalProfile.findFirst();
  if (!profile) {
    return prisma.hospitalProfile.create({ data: { name: "My Hospital" } });
  }
  return profile;
}

export async function updateHospitalProfile(data: {
  name?: string;
  address?: unknown;
  registrationNo?: string;
  logoUrl?: string;
  taxId?: string;
}) {
  const profile = await getHospitalProfile();
  return prisma.hospitalProfile.update({
    where: { id: profile.id },
    data: {
      name: data.name,
      address: (data.address as any) ?? undefined,
      registrationNo: data.registrationNo,
      logoUrl: data.logoUrl,
      taxId: data.taxId,
    },
  });
}

export async function getBusinessRules() {
  const cached = await cacheGet(RULES_CACHE_KEY);
  if (cached) return JSON.parse(cached);

  const rules = await prisma.businessRule.findMany({ orderBy: { key: "asc" } });
  await cacheSet(RULES_CACHE_KEY, JSON.stringify(rules), 60);
  return rules;
}

export async function updateBusinessRule(key: string, value: unknown) {
  const rule = await prisma.businessRule.upsert({
    where: { key },
    update: { value: value as any },
    create: { key, value: value as any },
  });
  await cacheDel(RULES_CACHE_KEY);
  return rule;
}

export async function listFeatureFlags() {
  const cached = await cacheGet(FLAGS_CACHE_KEY);
  if (cached) return JSON.parse(cached);

  const flags = await prisma.featureFlag.findMany({ orderBy: { key: "asc" } });
  await cacheSet(FLAGS_CACHE_KEY, JSON.stringify(flags), 60);
  return flags;
}

export async function toggleFeatureFlag(key: string, isEnabled: boolean) {
  const flag = await prisma.featureFlag.upsert({
    where: { key },
    update: { isEnabled },
    create: { key, isEnabled, description: `Feature flag: ${key}` },
  });
  await cacheDel(FLAGS_CACHE_KEY);
  return flag;
}

/**
 * Set integration credentials — encrypted at rest, write-only (FR 30.5).
 */
export async function setIntegrationCredential(
  provider: string,
  data: { apiKey?: string; apiSecret?: string; config?: Record<string, string> },
) {
  const secretJson = JSON.stringify({ apiKey: data.apiKey, apiSecret: data.apiSecret, ...(data.config ?? {}) });
  const encrypted = encrypt(secretJson);

  const credential = await prisma.integrationCredential.upsert({
    where: { id: `provider-${provider}` },
    update: { encryptedConfig: encrypted },
    create: {
      id: `provider-${provider}`,
      provider: provider as any,
      encryptedConfig: encrypted,
    },
  });
  return credential;
}

export async function getIntegrationCredentials() {
  const credentials = await prisma.integrationCredential.findMany();
  // Masked representation only (FR 30.5 BR-01)
  return credentials.map((c) => ({
    id: c.id,
    provider: c.provider,
    maskedSecret: `••••${c.updatedAt ? "••••" : "••••"}`,
    updatedAt: c.updatedAt,
  }));
}

function encrypt(plaintext: string): Uint8Array<ArrayBuffer> {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", Buffer.from(ENC_KEY.slice(0, 32)), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return new Uint8Array(Buffer.concat([iv, encrypted]));
}
