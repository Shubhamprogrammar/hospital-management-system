import { z } from "zod";

export const billSchema = z.object({
  patientId: z.string().min(1, "Select a patient"),
  items: z.array(z.object({
    description: z.string().min(1),
    quantity: z.string().min(1),
    unitPrice: z.string().min(1),
    sourceModule: z.enum(["CONSULTATION", "LAB", "PHARMACY", "ROOM_CHARGE", "AMBULANCE", "MISC"]),
  })).min(1, "Add at least one item"),
});

export type BillValues = z.infer<typeof billSchema>;

export const BILL_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "FINALIZED",
  "PAID",
  "PARTIALLY_PAID",
  "CANCELLED",
] as const;
