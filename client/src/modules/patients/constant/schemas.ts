import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2, "Name is required"),
  dob: z.string().min(1, "Date of birth required"),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  phone: z.string().min(7, "Phone is required"),
  email: z.string().email().optional().or(z.literal("")),
  bloodGroup: z.enum(["A_POS", "A_NEG", "B_POS", "B_NEG", "AB_POS", "AB_NEG", "O_POS", "O_NEG", "UNKNOWN"]),
  allergies: z.string().optional(),
  chronicConditions: z.string().optional(),
});

export type RegisterValues = z.input<typeof registerSchema>;

export const BLOOD_GROUPS = [
  "A_POS",
  "A_NEG",
  "B_POS",
  "B_NEG",
  "AB_POS",
  "AB_NEG",
  "O_POS",
  "O_NEG",
  "UNKNOWN",
] as const;

export const GENDERS = ["MALE", "FEMALE", "OTHER"] as const;
