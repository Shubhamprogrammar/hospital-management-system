import { z } from "zod";

export const userSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Min 8 characters"),
  role: z.string().min(1, "Role required"),
  phone: z.string().optional(),
});

export type UserValues = z.infer<typeof userSchema>;
