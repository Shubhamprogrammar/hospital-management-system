import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Databases
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),
  MONGO_URI: z.string().optional(),
  REDIS_URL: z.string().optional(),

  // Better Auth
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.string().url(),

  // CORS — comma-separated list of allowed browser origins.
  // e.g. "http://localhost:3000,http://192.168.1.36:3000"
  CLIENT_URL: z.string().default("http://localhost:3000"),

  // Cloudinary — optional. Without all three the uploads module falls back to
  // its local stub (no real bytes are stored).
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // Hugging Face Inference Providers (Hospital Assistant chatbot).
  // Optional — without a key the assistant falls back to canned replies.
  HUGGINGFACE_API_KEY: z.string().optional(),
  HUGGINGFACE_CHAT_MODEL: z.string().default("meta-llama/Llama-3.1-8B-Instruct:fastest"),
});

function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

const parsed = validateEnv();

/**
 * Allowed browser origins, split from CLIENT_URL (comma-separated).
 *
 * The Express CORS layer, Better Auth's trustedOrigins, and Socket.IO must all
 * accept the origin a user actually opens the app from — otherwise cross-origin
 * sign-in is rejected with "Invalid origin" and the user can never reach the
 * panel (e.g. when testing from the machine's LAN IP instead of localhost).
 */
export const clientUrls = parsed.CLIENT_URL.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const invalidOrigins = clientUrls.filter((origin) => !/^https?:\/\//.test(origin));
if (invalidOrigins.length > 0) {
  console.error(
    `❌ CLIENT_URL contains invalid origins (must be http(s) URLs): ${invalidOrigins.join(", ")}`,
  );
  process.exit(1);
}

export const env = { ...parsed, clientUrls };

export type Env = typeof env;
