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

/** System administrators — the only roles that implicitly see every module. */
export const ADMIN_ROLES: readonly Role[] = [ROLES.SUPER_ADMIN, ROLES.HOSPITAL_ADMIN];

/** True if the role is a system administrator (SUPER_ADMIN / HOSPITAL_ADMIN). */
export function isAdminRole(role: Role | undefined): boolean {
  return !!role && ADMIN_ROLES.includes(role);
}

/**
 * Strict role allowlist — true only if `role` is literally one of `allowed`.
 * No hierarchy inference: two roles at the same "level" (e.g. PHARMACIST and
 * BILLING_STAFF) are deliberately NOT interchangeable. Use this for UI gating
 * instead of hierarchy-based checks so each role only sees its own tooling.
 */
export function hasAnyRole(role: Role | undefined, ...allowed: Role[]): boolean {
  return !!role && allowed.includes(role);
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