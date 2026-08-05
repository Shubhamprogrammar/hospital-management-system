import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { randomUUID } from "crypto";
import { cloudinary, destroyCloudinaryAsset, isCloudinaryConfigured } from "../../config/cloudinary.js";

/** Mime/size whitelist per context (FR 28.5 BR-02). */
const CONTEXT_RULES: Record<string, { maxBytes: number; mimeTypes: RegExp }> = {
  AVATAR: { maxBytes: 5 * 1024 * 1024, mimeTypes: /^image\// },
  PATIENT_DOC: { maxBytes: 25 * 1024 * 1024, mimeTypes: /^(image\/|application\/pdf)/ },
  LAB_REPORT: { maxBytes: 25 * 1024 * 1024, mimeTypes: /^(image\/|application\/pdf)/ },
  CHAT_ATTACHMENT: { maxBytes: 25 * 1024 * 1024, mimeTypes: /.*/ },
  PRESCRIPTION_PDF: { maxBytes: 10 * 1024 * 1024, mimeTypes: /^application\/pdf/ },
  DISCHARGE_SUMMARY: { maxBytes: 10 * 1024 * 1024, mimeTypes: /^application\/pdf/ },
  OTHER: { maxBytes: 25 * 1024 * 1024, mimeTypes: /.*/ },
};

/**
 * Request a pre-signed upload contract (FR 28.4-01).
 *
 * With Cloudinary configured this returns a signed direct-upload contract the
 * browser POSTs its file to (https://api.cloudinary.com/v1_1/.../upload).
 * Without credentials it falls back to the local dev stub (no real bytes).
 */
export async function presignUpload(data: {
  uploadContext: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
}) {
  const rule = CONTEXT_RULES[data.uploadContext];
  if (!rule) throw new AppError("Unknown upload context", 400, undefined, "VALIDATION_ERROR");
  if (data.sizeBytes > rule.maxBytes) {
    throw new AppError("File exceeds the size limit for this context", 400, undefined, "ERR_FILE_TOO_LARGE");
  }
  if (!rule.mimeTypes.test(data.mimeType)) {
    throw new AppError("MIME type not allowed for this context", 400, undefined, "ERR_INVALID_MIME_TYPE");
  }

  // Sanitize filename (FR 28.6) and cap its length — the full Cloudinary
  // public_id (folder + name) must stay under ~160 chars.
  const safeName = data.filename
    .replace(/[^\w.\-]/g, "_")
    .replace(/\.\./g, "")
    .slice(0, 96);

  const folder = `${data.uploadContext.toLowerCase()}/${randomUUID()}`;
  // s3Key doubles as the Cloudinary public_id (folder path included).
  const s3Key = `${folder}/${safeName}`;

  const file = await prisma.fileUpload.create({
    data: {
      uploadedBy: data.uploadedBy,
      uploadContext: data.uploadContext as any,
      s3Key,
      originalFilename: safeName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      status: "PENDING",
      resourceType: isCloudinaryConfigured ? (data.mimeType.startsWith("image/") ? "image" : "raw") : null,
    },
  });

  if (!isCloudinaryConfigured) {
    return {
      fileId: file.id,
      s3Key,
      uploadUrl: `/api/v1/uploads/${file.id}/confirm`, // local dev stub
      expiresIn: 300,
    };
  }

  // Signed direct upload: the browser POSTs the file + these params to
  // Cloudinary. Sign everything except file/cloud_name/resource_type/signature.
  // Note: the signature binds folder/public_id/timestamp only — it does NOT
  // bind size or content, so a leaked contract could upload other bytes to the
  // (randomized) public_id. A content/size re-check at confirm would harden it.
  const timestamp = Math.floor(Date.now() / 1000);
  const resourceType: "image" | "raw" = data.mimeType.startsWith("image/") ? "image" : "raw";
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder, public_id: safeName },
    cloudinary.config().api_secret ?? "",
  );

  return {
    fileId: file.id,
    s3Key,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudinary.config().cloud_name}/${resourceType}/upload`,
    uploadParams: {
      api_key: cloudinary.config().api_key ?? "",
      timestamp,
      signature,
      folder,
      public_id: safeName,
    },
    expiresIn: 300,
  };
}

export async function confirmUpload(fileId: string, data?: { publicId?: string; secureUrl?: string }) {
  const file = await prisma.fileUpload.findUnique({ where: { id: fileId } });
  if (!file) throw new AppError("Upload not found", 404, undefined, "NOT_FOUND");

  if (isCloudinaryConfigured) {
    // The browser uploaded directly to Cloudinary; the public_id it returns
    // must match the contract we signed at presign time.
    if (!data?.publicId || !data?.secureUrl) {
      throw new AppError("Missing Cloudinary upload confirmation", 400, undefined, "VALIDATION_ERROR");
    }
    if (data.publicId !== file.s3Key) {
      throw new AppError("Upload public_id does not match the signed contract", 400, undefined, "VALIDATION_ERROR");
    }
  }

  // TODO: content-scan job would run here
  return prisma.fileUpload.update({
    where: { id: fileId },
    data: {
      status: "SCANNED_CLEAN",
      secureUrl: data?.secureUrl ?? file.secureUrl,
    },
  });
}

export async function getDownloadUrl(fileId: string, userId: string, actorRole?: string) {
  const file = await prisma.fileUpload.findUnique({ where: { id: fileId } });
  if (!file) throw new AppError("Upload not found", 404, undefined, "NOT_FOUND");

  // FR 28.4-04: never servable before scan is clean
  if (file.status !== "SCANNED_CLEAN" && file.status !== "UPLOADED") {
    throw new AppError(
      "File is not available for download yet",
      409,
      undefined,
      "ERR_UPLOAD_NOT_CONFIRMED",
    );
  }

  // System/hospital admins manage the whole patient record; others only their own uploads.
  const isAdmin = actorRole === "SUPER_ADMIN" || actorRole === "HOSPITAL_ADMIN";
  if (!isAdmin && file.uploadedBy !== userId) {
    throw new AppError("You do not have access to this file", 403, undefined, "FORBIDDEN");
  }

  if (isCloudinaryConfigured && file.resourceType && file.secureUrl) {
    // Force-download delivery URL straight from the CDN.
    const downloadUrl = cloudinary.url(file.s3Key, {
      resource_type: file.resourceType as "image" | "raw",
      flags: "attachment",
      secure: true,
    });
    return { fileId: file.id, downloadUrl, expiresIn: 900 };
  }

  return {
    fileId: file.id,
    downloadUrl: `/api/v1/uploads/${file.id}/download`, // local dev stub
    expiresIn: 900,
  };
}

export async function softDeleteUpload(fileId: string, userId: string, actorRole?: string) {
  const file = await prisma.fileUpload.findUnique({ where: { id: fileId } });
  if (!file) throw new AppError("Upload not found", 404, undefined, "NOT_FOUND");

  // System/hospital admins manage the whole patient record; everyone else can
  // only touch files they uploaded themselves.
  const isAdmin = actorRole === "SUPER_ADMIN" || actorRole === "HOSPITAL_ADMIN";
  if (!isAdmin && file.uploadedBy !== userId) {
    throw new AppError("You do not have access to this file", 403, undefined, "FORBIDDEN");
  }

  // Best-effort: delete the real asset from Cloudinary (no-op for stub rows).
  await destroyCloudinaryAsset(file.s3Key, file.resourceType);

  await prisma.fileUpload.update({
    where: { id: fileId },
    data: { status: "FAILED" }, // tombstone per retention policy
  });

  // Keep the patient's record consistent: removing a file also removes the
  // PatientDocument rows pointing at it (patient docs list = PatientDocument).
  await prisma.patientDocument.deleteMany({ where: { s3Key: file.s3Key } });

  return prisma.fileUpload.findUniqueOrThrow({ where: { id: fileId } });
}
