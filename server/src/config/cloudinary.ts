import { v2 as cloudinary } from "cloudinary";
import { env } from "./env.js";

/**
 * Cloudinary is enabled only when all three credentials are present.
 * Otherwise the uploads module falls back to its local stub (no real bytes
 * are stored), so the app keeps working before credentials are configured.
 */
export const isCloudinaryConfigured = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME!,
    api_key: env.CLOUDINARY_API_KEY!,
    api_secret: env.CLOUDINARY_API_SECRET!,
    secure: true,
  });
}

/**
 * Best-effort delete of a real Cloudinary asset. No-op when storage isn't
 * configured or the row predates Cloudinary (resourceType null). Never throws
 * — callers must not fail their own DB work because a remote delete failed.
 */
export async function destroyCloudinaryAsset(
  publicId: string,
  resourceType: string | null | undefined,
): Promise<void> {
  if (!isCloudinaryConfigured || !resourceType || !publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType as "image" | "raw",
    });
  } catch (err) {
    console.error(`Cloudinary destroy failed for ${publicId}:`, err);
  }
}

export { cloudinary };
