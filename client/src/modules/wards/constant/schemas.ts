import { z } from "zod";

export const wardSchema = z.object({
  name: z.string().min(2, "Name required"),
  wardType: z.enum(["GENERAL", "ICU", "ICCU", "PEDIATRIC", "MATERNITY", "ISOLATION"]),
  floor: z.string().min(1, "Floor required"),
  nursePatientRatio: z.string().optional(),
});

export type WardValues = z.infer<typeof wardSchema>;

export const WARD_TYPES = [
  "GENERAL",
  "ICU",
  "ICCU",
  "PEDIATRIC",
  "MATERNITY",
  "ISOLATION",
] as const;
