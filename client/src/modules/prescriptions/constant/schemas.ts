import { z } from "zod";

export const itemSchema = z.object({
  drugName: z.string().min(1, "Drug name required"),
  dosage: z.string().min(1, "Dosage required"),
  frequency: z.string().min(1, "Frequency required"),
  durationDays: z.string().min(1),
  route: z.enum(["ORAL", "IV", "IM", "TOPICAL", "OTHER"]),
});

export const prescriptionSchema = z.object({
  patientId: z.string().min(1, "Select a patient"),
  doctorId: z.string().min(1, "Select a doctor"),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, "Add at least one item"),
});

export type PrescriptionValues = z.infer<typeof prescriptionSchema>;

export const ROUTES = ["ORAL", "IV", "IM", "TOPICAL", "OTHER"] as const;
