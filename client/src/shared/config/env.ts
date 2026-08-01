const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1";
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:8080";

if (!process.env.NEXT_PUBLIC_API_URL && process.env.NODE_ENV !== "production") {
  console.warn(
    `[env] NEXT_PUBLIC_API_URL not set, falling back to ${API_URL}. Add it to client/.env.local.`,
  );
}

export const env = {
  API_URL,
  AUTH_URL: `${API_URL}/auth`,
  SOCKET_URL,
};
