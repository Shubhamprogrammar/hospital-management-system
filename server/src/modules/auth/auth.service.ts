import { auth } from "../../config/auth.js";
import type { AuthUser } from "./auth.types.js";
import type { Role } from "../../config/auth.js";

/**
 * Get the current session for a request.
 */
export async function getSession(headers: Record<string, string>) {
  const session = await auth.api.getSession({ headers });
  return session;
}

/**
 * List all users (admin only).
 */
export async function listUsers(
  headers: Record<string, string>,
  query?: { page?: number; limit?: number },
) {
  const result = await auth.api.listUsers({
    headers,
    query: {
      limit: query?.limit?.toString() ?? "20",
      offset: ((query?.page ?? 1) - 1) * (query?.limit ?? 20),
    },
  });

  return result as unknown as {
    users: AuthUser[];
    total: number;
  };
}

/**
 * List active sessions for the current user (FRD 4.7-09).
 */
export async function listSessions(headers: Record<string, string>) {
  const sessions = await auth.api.listSessions({ headers });
  return sessions;
}

/**
 * Revoke a specific session (FRD 4.7-10).
 */
export async function revokeSession(headers: Record<string, string>, sessionId: string) {
  const result = await auth.api.revokeSession({
    headers,
    body: { token: sessionId },
  });
  return result;
}

/**
 * Create a new user with a specific role (admin only).
 * Requires SUPER_ADMIN or HOSPITAL_ADMIN role.
 */
export async function createUser(
  headers: Record<string, string>,
  data: {
    name: string;
    email: string;
    password: string;
    role: Role;
    phone?: string;
  },
) {
  const result = await auth.api.createUser({
    headers,
    body: {
      name: data.name,
      email: data.email,
      password: data.password,
      role: data.role,
      data: {
        phone: data.phone,
      },
    },
  });

  return result as unknown as {
    user: AuthUser;
  };
}
