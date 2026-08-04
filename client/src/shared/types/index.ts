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

/**
 * Genuine seniority check (same-track floor semantics): true if `role` meets or
 * exceeds the hierarchy level of a single senior role (e.g. `hasRoleAtLeast(role, ROLES.DOCTOR)`
 * = "doctor or anything more senior"). Only safe for single-role checks — see
 * `hasRole` for set-membership checks (nav visibility, route guards).
 */
export function hasRoleAtLeast(role: Role | undefined, ...allowed: Role[]): boolean {
  if (!role) return false;
  const floor = Math.min(...allowed.map((r) => ROLE_HIERARCHY[r]));
  return ROLE_HIERARCHY[role] >= floor;
}

/**
 * Direct set-membership authorization check — mirrors the server `authorize()`.
 * True if `role` is explicitly in `allowed`, or is an always-allowed admin
 * (SUPER_ADMIN / HOSPITAL_ADMIN). No numeric hierarchy floors, so lateral roles
 * sharing a level (LAB_TECHNICIAN/PHARMACIST/BILLING_STAFF) cannot reach each
 * other's features (RBAC audit #1).
 */
export function hasRole(role: Role | undefined, ...allowed: Role[]): boolean {
  if (!role) return false;
  if (allowed.length === 0) return true;
  if (role === ROLES.SUPER_ADMIN || role === ROLES.HOSPITAL_ADMIN) return true;
  return allowed.includes(role);
}

/**
 * Direct set-membership authorization check — mirrors the server `authorize()`.
 * True if `role` is explicitly in `allowed`, or is an always-allowed admin
 * (SUPER_ADMIN / HOSPITAL_ADMIN). No numeric hierarchy floors, so lateral roles
 * sharing a level (LAB_TECHNICIAN/PHARMACIST/BILLING_STAFF) cannot reach each
 * other's features (RBAC audit #1).
 */
export function hasRole(role: Role | undefined, ...allowed: Role[]): boolean {
  if (!role) return false;
  if (allowed.length === 0) return true;
  if (role === ROLES.SUPER_ADMIN || role === ROLES.HOSPITAL_ADMIN) return true;
  return allowed.includes(role);
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