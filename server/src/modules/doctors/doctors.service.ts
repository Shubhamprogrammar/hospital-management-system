import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { cacheDel, cacheGet, cacheSet } from "../../config/redis.js";
import { ROLES, type Role } from "../../config/auth.js";

export async function createDoctor(data: {
  userId: string;
  departmentId: string;
  registrationNo: string;
  specialization: string;
  qualifications?: unknown;
  consultationFee?: number;
  experienceYears?: number;
  bio?: string;
}) {
  const existing = await prisma.doctor.findUnique({
    where: { registrationNo: data.registrationNo },
  });
  if (existing) {
    throw new AppError(
      "A doctor with this registration number already exists",
      409,
      undefined,
      "ERR_DUPLICATE_REGISTRATION",
    );
  }

  // A user can have at most one active doctor profile (prevents a doctor
  // re-registering after already self-completing their profile).
  const existingProfile = await prisma.doctor.findFirst({
    where: { userId: data.userId, deletedAt: null },
  });
  if (existingProfile) {
    throw new AppError(
      "This user already has a doctor profile",
      409,
      undefined,
      "ERR_PROFILE_EXISTS",
    );
  }

  return prisma.doctor.create({
    data: {
      userId: data.userId,
      departmentId: data.departmentId,
      registrationNo: data.registrationNo,
      specialization: data.specialization,
      qualifications: (data.qualifications as any) ?? undefined,
      consultationFee: data.consultationFee ?? 0,
      experienceYears: data.experienceYears ?? 0,
      bio: data.bio,
    },
  });
}

/**
 * The doctor profile linked to a user (or null when they don't have one).
 * Used by GET /doctors/me so a DOCTOR-role user can self-manage their profile.
 */
export async function getDoctorByUserId(userId: string) {
  return prisma.doctor.findFirst({
    where: { userId, deletedAt: null },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, image: true } },
      department: { select: { id: true, name: true, code: true } },
      availability: true,
    },
  });
}

/**
 * Ownership guard: a DOCTOR-role actor may only manage their OWN profile.
 * Admins (HOSPITAL_ADMIN) can manage any profile. Returns silently on success.
 */
export async function assertDoctorOwnsProfile(
  actor: { role?: Role | string; id?: string },
  doctorId: string,
): Promise<void> {
  if (actor?.role !== ROLES.DOCTOR) return;
  const doctor = await prisma.doctor.findFirst({
    where: { id: doctorId, deletedAt: null },
    select: { userId: true },
  });
  if (!doctor || doctor.userId !== actor.id) {
    throw new AppError(
      "You can only manage your own doctor profile",
      403,
      undefined,
      "FORBIDDEN",
    );
  }
}

export async function listDoctors(params: {
  departmentId?: string;
  specialization?: string;
  search?: string;
  availableToday?: boolean;
  page: number;
  limit: number;
}) {
  const where: Record<string, unknown> = { isActive: true, deletedAt: null };
  if (params.departmentId) where.departmentId = params.departmentId;
  if (params.specialization) {
    where.specialization = { contains: params.specialization, mode: "insensitive" };
  }
  if (params.search) {
    where.user = { name: { contains: params.search, mode: "insensitive" } };
  }

  const [total, doctors] = await prisma.$transaction([
    prisma.doctor.count({ where }),
    prisma.doctor.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, image: true } },
        department: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
  ]);

  return { total, doctors };
}

/** Resolve the Doctor record linked to a user account (for DOCTOR-role scoping). */
export async function getDoctorByUser(userId: string) {
  return prisma.doctor.findFirst({
    where: { userId, deletedAt: null },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, image: true } },
      department: { select: { id: true, name: true, code: true } },
    },
  });
}

export async function getDoctorDetail(id: string) {
  const doctor = await prisma.doctor.findFirst({
    where: { id, deletedAt: null },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, image: true } },
      department: { select: { id: true, name: true, code: true } },
      availability: true,
      leaves: { where: { endDate: { gte: new Date() } }, orderBy: { startDate: "asc" } },
    },
  });
  if (!doctor) throw new AppError("Doctor not found", 404, undefined, "NOT_FOUND");
  return doctor;
}

export async function updateDoctor(
  id: string,
  data: {
    departmentId?: string;
    specialization?: string;
    consultationFee?: number;
    experienceYears?: number;
    bio?: string;
    isActive?: boolean;
  },
) {
  const existing = await prisma.doctor.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError("Doctor not found", 404, undefined, "NOT_FOUND");

  const doctor = await prisma.doctor.update({ where: { id }, data });
  await cacheDel(`doctor:${id}:profile`);
  return doctor;
}

export async function setAvailability(
  doctorId: string,
  slots: { weekday: number; startTime: string; endTime: string; slotDurationMinutes?: number; clinicRoom?: string }[],
) {
  // Reject overlapping availability windows for same weekday (FRD 8.20)
  for (const a of slots) {
    for (const b of slots) {
      if (a === b) continue;
      if (a.weekday === b.weekday) {
        if (timeOverlaps(a.startTime, a.endTime, b.startTime, b.endTime)) {
          throw new AppError(
            "Overlapping availability windows for the same weekday",
            400,
            undefined,
            "VALIDATION_ERROR",
          );
        }
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.doctorAvailability.deleteMany({ where: { doctorId } });
    await tx.doctorAvailability.createMany({
      data: slots.map((s) => ({
        doctorId,
        weekday: s.weekday,
        startTime: s.startTime,
        endTime: s.endTime,
        slotDurationMinutes: s.slotDurationMinutes ?? 15,
        clinicRoom: s.clinicRoom,
      })),
    });
  });

  await cacheDel(`doctor:${doctorId}:slots:*`);
  return getDoctorDetail(doctorId);
}

export async function markLeave(
  doctorId: string,
  data: { startDate: string; endDate: string; reason?: string },
) {
  return prisma.doctorLeave.create({
    data: {
      doctorId,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      reason: data.reason,
    },
  });
}

/**
 * Computes available slots for a doctor on a date (FR 8.4-04):
 * weekly availability template minus existing appointments minus leaves.
 * Cached 60s (FRD 8.11).
 */
export async function getAvailableSlots(doctorId: string, date: string) {
  const cacheKey = `doctor:${doctorId}:slots:${date}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return JSON.parse(cached);

  const target = new Date(date);
  const weekday = target.getDay();

  const [availability, appointments, leaves] = await prisma.$transaction([
    prisma.doctorAvailability.findMany({ where: { doctorId, weekday } }),
    prisma.appointment.findMany({
      where: {
        doctorId,
        appointmentDate: target,
        status: { not: "CANCELLED" },
      },
      select: { slotStartTime: true },
    }),
    prisma.doctorLeave.findMany({
      where: {
        doctorId,
        startDate: { lte: target },
        endDate: { gte: target },
      },
    }),
  ]);

  if (leaves.length > 0) {
    return { date, slots: [], onLeave: true };
  }

  const booked = new Set(appointments.map((a) => a.slotStartTime));
  const slots: string[] = [];

  for (const av of availability) {
    const startMin = toMinutes(av.startTime);
    const endMin = toMinutes(av.endTime);
    const duration = av.slotDurationMinutes;
    for (let t = startMin; t + duration <= endMin; t += duration) {
      const slot = toHHMM(t);
      if (!booked.has(slot)) slots.push(slot);
    }
  }

  const result = { date, slots, onLeave: false };
  await cacheSet(cacheKey, JSON.stringify(result), 60);
  return result;
}

export async function deactivateDoctor(id: string) {
  const existing = await prisma.doctor.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError("Doctor not found", 404, undefined, "NOT_FOUND");
  return prisma.doctor.update({
    where: { id },
    data: { isActive: false, deletedAt: new Date() },
  });
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function timeOverlaps(s1: string, e1: string, s2: string, e2: string): boolean {
  return toMinutes(s1) < toMinutes(e2) && toMinutes(s2) < toMinutes(e1);
}
