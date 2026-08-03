// Mirrors server/src/config/auth.ts — keep in sync with the backend.
export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  HOSPITAL_ADMIN: "HOSPITAL_ADMIN",
  RECEPTIONIST: "RECEPTIONIST",
  DOCTOR: "DOCTOR",
  NURSE: "NURSE",
  LAB_TECHNICIAN: "LAB_TECHNICIAN",
  PATHOLOGIST: "PATHOLOGIST",
  PHARMACIST: "PHARMACIST",
  BILLING_STAFF: "BILLING_STAFF",
  INVENTORY_MANAGER: "INVENTORY_MANAGER",
  AMBULANCE_DISPATCHER: "AMBULANCE_DISPATCHER",
  AMBULANCE_DRIVER: "AMBULANCE_DRIVER",
  WARD_BOY: "WARD_BOY",
  ACCOUNTANT: "ACCOUNTANT",
  IT_SUPPORT: "IT_SUPPORT",
  PATIENT: "PATIENT",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_HIERARCHY: Record<Role, number> = {
  SUPER_ADMIN: 100,
  HOSPITAL_ADMIN: 80,
  DOCTOR: 60,
  PATHOLOGIST: 55,
  NURSE: 50,
  LAB_TECHNICIAN: 40,
  PHARMACIST: 40,
  BILLING_STAFF: 40,
  INVENTORY_MANAGER: 40,
  AMBULANCE_DISPATCHER: 35,
  ACCOUNTANT: 40,
  IT_SUPPORT: 30,
  RECEPTIONIST: 30,
  AMBULANCE_DRIVER: 25,
  WARD_BOY: 30,
  PATIENT: 10,
};

/** True if `role` meets the minimum level of any role in `allowed` (hierarchy-floor semantics, matches server authorize()). */
export function hasRoleAtLeast(role: Role | undefined, ...allowed: Role[]): boolean {
  if (!role) return false;
  const floor = Math.min(...allowed.map((r) => ROLE_HIERARCHY[r]));
  return ROLE_HIERARCHY[role] >= floor;
}

export interface User {
  id: string;
  name: string | null;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: Role;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  bloodGroup: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
  meta: { requestId: string; pagination?: PaginationMeta; unread?: number };
}

export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string; details?: unknown };
  meta: { requestId: string };
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}
