import { z } from "zod";

export const availabilitySchema = z.object({
  weekday: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  slotDurationMinutes: z.string().min(1),
  clinicRoom: z.string().optional(),
});

export type AvailabilityValues = z.infer<typeof availabilitySchema>;

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
