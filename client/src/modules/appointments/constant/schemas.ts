import { z } from "zod";

export const bookSchema = z.object({
  patientId: z.string().min(1, "Select a patient"),
  doctorId: z.string().min(1, "Select a doctor"),
  departmentId: z.string().min(1, "Select a department"),
  appointmentDate: z.string().min(1, "Date required"),
  slotStartTime: z.string().min(1, "Start time required"),
  slotEndTime: z.string().min(1, "End time required"),
  mode: z.enum(["IN_PERSON", "TELECONSULT"]),
  reason: z.string().optional(),
});

export type BookValues = z.infer<typeof bookSchema>;

export const APPOINTMENT_STATUSES = [
  "CONFIRMED",
  "CHECKED_IN",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
  "NEEDS_RESCHEDULE",
] as const;
