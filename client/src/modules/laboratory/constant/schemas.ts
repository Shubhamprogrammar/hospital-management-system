import { z } from "zod";

export const orderSchema = z.object({
  patientId: z.string().min(1, "Select a patient"),
  doctorId: z.string().min(1, "Select a doctor"),
  testIds: z.array(z.string()).min(1, "Select at least one test"),
});

export type OrderValues = z.infer<typeof orderSchema>;
