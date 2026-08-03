import { z } from "zod";

export const vehicleSchema = z.object({
  registrationNo: z.string().min(2, "Registration required"),
  type: z.enum(["BASIC", "ICU", "MORTUARY"]),
});

export const requestSchema = z.object({
  pickupAddress: z.string().min(5, "Pickup address required"),
  dropAddress: z.string().optional(),
  urgency: z.enum(["EMERGENCY", "URGENT", "ROUTINE"]),
});

export type VehicleValues = z.infer<typeof vehicleSchema>;
export type RequestValues = z.infer<typeof requestSchema>;
