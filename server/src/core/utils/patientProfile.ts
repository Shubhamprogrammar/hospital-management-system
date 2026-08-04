import { prisma } from "../../config/prisma.js";
import { generateNextUhid } from "./uhid.js";

/**
 * Ensure a Patient profile exists for a patient user account.
 * Order: linked userId → match+link by email/phone → create (only when the
 * account carries every required field). Never guesses DOB/gender, and minors
 * (BR-03) need a guardian record we can't provision here.
 *
 * Shared by the Better Auth signup hook (auto-provision on registration) and
 * the patient-chat resolver (recovery for accounts that predate it).
 */
export async function ensurePatientProfile(user: {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  dateOfBirth: Date | null;
  gender: string | null;
}) {
  const linked = await prisma.patient.findFirst({
    where: { userId: user.id, isActive: true, deletedAt: null },
  });
  if (linked) return linked;

  // Match + link an existing (reception-registered) record by email or phone.
  // Never return a record already linked to a different account.
  if (user.email || user.phone) {
    const byContact = await prisma.patient.findFirst({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [
          ...(user.email ? [{ email: user.email }] : []),
          ...(user.phone ? [{ phone: user.phone }] : []),
        ],
      },
    });
    if (byContact) {
      if (byContact.userId && byContact.userId !== user.id) return null;
      if (!byContact.userId) {
        await prisma.patient.update({ where: { id: byContact.id }, data: { userId: user.id } });
      }
      return byContact;
    }
  }

  // Auto-create a complete profile when the account has every required field.
  const gender = user.gender?.toUpperCase();
  if (
    user.name &&
    user.phone &&
    user.dateOfBirth &&
    gender &&
    ["MALE", "FEMALE", "OTHER"].includes(gender) &&
    ageInYears(user.dateOfBirth) >= 18
  ) {
    return prisma.patient.create({
      data: {
        uhid: await generateNextUhid(),
        name: user.name,
        dob: user.dateOfBirth,
        gender: gender as "MALE" | "FEMALE" | "OTHER",
        phone: user.phone,
        email: user.email ?? undefined,
        userId: user.id,
      },
    });
  }

  return null;
}

function ageInYears(dob: Date): number {
  return Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}
