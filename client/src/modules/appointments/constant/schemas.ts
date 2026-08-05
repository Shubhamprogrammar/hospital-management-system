import { z } from "zod";

/** Appointment bookings must always be in the future (BR): date not before today, and same-day slots ahead of now. */
export function isFutureBooking(date: string, slotStartTime: string) {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return false;
  const at = new Date(y, m - 1, d);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (at < startOfToday) return false;
  if (at.getTime() === startOfToday.getTime()) {
    const [hh, mm] = slotStartTime.split(":").map(Number);
    if (typeof hh !== "number" || typeof mm !== "number" || Number.isNaN(hh) || Number.isNaN(mm)) return false;
    if (new Date(y, m - 1, d, hh, mm) <= now) return false;
  }
  return true;
}

/** Future-check refinement shared by the book and request schemas. */
function futureRefinement(v: { appointmentDate: string; slotStartTime: string }, ctx: z.RefinementCtx) {
  if (!isFutureBooking(v.appointmentDate, v.slotStartTime)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["appointmentDate"],
      message: "Appointment date and slot must be in the future",
    });
  }
}

const bookBaseSchema = z.object({
  patientId: z.string().min(1, "Select a patient"),
  doctorId: z.string().min(1, "Select a doctor"),
  departmentId: z.string().min(1, "Select a department"),
  appointmentDate: z.string().min(1, "Date required"),
  slotStartTime: z.string().min(1, "Start time required"),
  slotEndTime: z.string().min(1, "End time required"),
  mode: z.enum(["IN_PERSON", "TELECONSULT"]),
  reason: z.string().optional(),
});

export const bookSchema = bookBaseSchema.superRefine(futureRefinement);

export type BookValues = z.infer<typeof bookSchema>;

/**
 * Patient self-service request — no patient picker: the server resolves the
 * caller's own Patient record and creates the appointment as PENDING.
 * Built from the shared base (not `bookSchema`) because Zod v4 forbids
 * `.omit()` on object schemas that already carry refinements.
 */
export const requestSchema = bookBaseSchema.omit({ patientId: true }).superRefine(futureRefinement);

export type RequestValues = z.infer<typeof requestSchema>;

export const APPOINTMENT_STATUSES = [
  "PENDING",
  "BOOKED",
  "CHECKED_IN",
  "COMPLETED",
  "CANCELLED",
  "REJECTED",
  "NO_SHOW",
  "NEEDS_RESCHEDULE",
] as const;
