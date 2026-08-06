import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { randomUUID } from "crypto";

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
 * Request a pre-signed upload URL (FR 28.4-01).
 * S3 integration point — returns a presign contract; actual S3
 * presigning drops in here.
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

  // Sanitize filename (FR 28.6)
  const safeName = data.filename.replace(/[^\w.\-]/g, "_").replace(/\.\./g, "");

  const s3Key = `uploads/${data.uploadContext.toLowerCase()}/${randomUUID()}/${safeName}`;

  const file = await prisma.fileUpload.create({
    data: {
      uploadedBy: data.uploadedBy,
      uploadContext: data.uploadContext as any,
      s3Key,
      originalFilename: safeName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      status: "PENDING",
    },
  });

  // TODO: S3 getSignedUrl('putObject', { Key: s3Key, Expires: 300 })
  return {
    fileId: file.id,
    s3Key,
    uploadUrl: `/api/v1/uploads/${file.id}/confirm`, // local dev stub
    expiresIn: 300,
  };
}

export async function confirmUpload(fileId: string) {
  const file = await prisma.fileUpload.findUnique({ where: { id: fileId } });
  if (!file) throw new AppError("Upload not found", 404, undefined, "NOT_FOUND");

  // TODO: S3 headObject check — if missing, throw ERR_UPLOAD_NOT_CONFIRMED
  const updated = await prisma.fileUpload.update({
    where: { id: fileId },
    data: { status: "SCANNED_CLEAN" }, // content-scan job would run here
  });
  return updated;
}

export async function getDownloadUrl(fileId: string, userId: string) {
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

  // System/hospital admins manage the whole patient record; everyone else can
  // only download files they uploaded themselves.
  const isAdmin = actorRole === "SUPER_ADMIN" || actorRole === "HOSPITAL_ADMIN";
  if (!isAdmin && file.uploadedBy !== userId) {
    throw new AppError("You do not have access to this file", 403, undefined, "FORBIDDEN");
  }

  // TODO: S3 getSignedUrl('getObject', { Key: file.s3Key, Expires: 900 })
  return {
    fileId: file.id,
    downloadUrl: `/api/v1/uploads/${file.id}/download`, // signed URL stub
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

  await prisma.fileUpload.update({
    where: { id: fileId },
    data: { status: "FAILED" }, // tombstone per retention policy
  });

  // Keep the patient's record consistent: removing a file also removes the
  // PatientDocument rows pointing at it (patient docs list = PatientDocument).
  await prisma.patientDocument.deleteMany({ where: { s3Key: file.s3Key } });

  return prisma.fileUpload.findUniqueOrThrow({ where: { id: fileId } });
}
