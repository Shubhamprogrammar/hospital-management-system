import { prisma } from "../../config/prisma.js";
import { AppError } from "../errors/AppError.js";

/**
 * Resolves the Doctor profile id for a request. Prescription, LabOrder,
 * AiPrescriptionSuggestion and IpdRound FK columns reference Doctor.id —
 * NOT User.id — so controllers must translate the authenticated user into
 * their linked doctor profile (or use an explicit doctorId from the body).
 *
 * @param userId          authenticated user id (req.user.id)
 * @param explicitDoctorId optional doctorId supplied in the request body
 * @param context         human-readable action label for the error message
 */
export async function resolveDoctorId(
  userId: string | undefined,
  explicitDoctorId?: string,
  context = "this action",
): Promise<string> {
  if (explicitDoctorId) return explicitDoctorId;

  if (userId) {
    const doctor = await prisma.doctor.findFirst({
      where: { userId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (doctor) return doctor.id;
  }

  throw new AppError(
    `A doctor profile is required to perform ${context}`,
    400,
    undefined,
    "ERR_DOCTOR_PROFILE_REQUIRED",
  );
}
