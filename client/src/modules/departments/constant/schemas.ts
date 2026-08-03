import { z } from "zod";

export const departmentSchema = z.object({
  name: z.string().min(2, "Name required"),
  code: z.string().min(2, "Code required"),
  description: z.string().optional(),
});

export type DepartmentValues = z.infer<typeof departmentSchema>;
