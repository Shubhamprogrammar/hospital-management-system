import { z } from "zod";

export const admitSchema = z.object({
  patientId: z.string().min(1, "Select a patient"),
  admittingDoctorId: z.string().min(1, "Select a doctor"),
  wardId: z.string().min(1, "Select a ward"),
  bedId: z.string().min(1, "Select a bed"),
  admissionType: z.enum(["EMERGENCY", "REFERRAL", "DIRECT"]),
});

export type AdmitValues = z.infer<typeof admitSchema>;
