import { z } from "zod";

export const roleSchema = z.object({
  name: z.string().min(2, "Role name required"),
  description: z.string().optional(),
  permissionKeys: z.array(z.string()),
});

export type RoleValues = z.infer<typeof roleSchema>;
