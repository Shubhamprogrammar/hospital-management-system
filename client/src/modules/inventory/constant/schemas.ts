import { z } from "zod";

export const itemSchema = z.object({
  name: z.string().min(2, "Name required"),
  category: z.enum(["DRUG", "CONSUMABLE", "EQUIPMENT"]),
  unit: z.string().optional(),
  reorderPoint: z.string().min(1),
  reorderQuantity: z.string().min(1),
});

export type ItemValues = z.infer<typeof itemSchema>;
