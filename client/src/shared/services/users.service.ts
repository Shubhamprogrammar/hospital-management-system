import { api } from "@/shared/services/api";
import { env } from "@/shared/config/env";
import type { User } from "@/shared/types";
import type { Permission, Role, SessionInfo } from "@/shared/types/domain";
import type { PaginationParams } from "@/shared/types/api";

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: string;
  phone?: string;
  departmentId?: string;
}

export interface UpdateUserInput {
  name?: string;
  phone?: string;
  role?: string;
  isActive?: boolean;
}

export function listUsers(params: PaginationParams & { search?: string; role?: string }) {
  return api.list<User>("/users", params);
}

export function getUser(id: string) {
  return api.get<User>(`/users/${id}`);
}

export function createUser(input: CreateUserInput) {
  return api.post<User>("/users", input);
}

export function updateUser(id: string, input: UpdateUserInput) {
  return api.patch<User>(`/users/${id}`, input);
}

export function deactivateUser(id: string) {
  return api.delete<{ id: string }>(`/users/${id}`);
}

export function getMe() {
  return api.get<User>("/users/me");
}

export function updateMe(input: Partial<Pick<User, "name" | "phone" | "dateOfBirth" | "gender" | "address" | "bloodGroup">>) {
  return api.patch<User>("/users/me", input);
}

export function uploadAvatar(userId: string, formData: FormData) {
  return fetch(`${env.API_URL}/users/${userId}/avatar`, {
    method: "POST",
    credentials: "include",
    body: formData,
  }).then((r) => (r.ok ? r.json() : Promise.reject(r)));
}

export function bulkImportUsers(users: CreateUserInput[]) {
  return api.post<{ imported: number }>("/users/bulk-import", { users });
}

// ---------- Auth admin & sessions ----------

export function listAuthUsers(params: PaginationParams) {
  return api.list<User>("/auth/users", params);
}

export function createAuthUser(input: CreateUserInput) {
  return api.post<User>("/auth/users", input);
}

export function listMySessions() {
  return api.get<SessionInfo[]>("/auth/sessions");
}

export function revokeSession(sessionId: string) {
  return api.delete<{ revoked: boolean }>(`/auth/sessions/${sessionId}`);
}

// ---------- Roles ----------

export function listRoles() {
  return api.list<Role>("/roles");
}

export function getRole(id: string) {
  return api.get<Role>(`/roles/${id}`);
}

export function createRole(input: { name: string; description?: string; permissionKeys?: string[] }) {
  return api.post<Role>("/roles", input);
}

export function updateRole(id: string, input: { name?: string; description?: string; permissionKeys?: string[] }) {
  return api.patch<Role>(`/roles/${id}`, input);
}

export function deleteRole(id: string) {
  return api.delete<{ deleted: boolean }>(`/roles/${id}`);
}

export function listPermissions() {
  return api.get<Permission[]>("/roles/permissions");
}
