import { z } from "zod";

export const bedSchema = z.object({
  wardId: z.string().min(1, "Select a ward"),
  bedNumber: z.string().min(1, "Bed number required"),
  bedType: z.enum(["GENERAL", "ICU", "ISOLATION"]),
});

export type BedValues = z.infer<typeof bedSchema>;

export const BED_STATUSES = [
  "AVAILABLE",
  "OCCUPIED",
  "CLEANING",
  "MAINTENANCE",
  "RESERVED",
] as const;
