import { env } from "../config/env";
import type { ApiErrorBody, PaginationMeta } from "../types";

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface ListResult<T> {
  items: T[];
  pagination: PaginationMeta;
}

type Query = Record<string, unknown>;

function buildUrl(path: string, query?: Query): string {
  // env.API_URL is a relative same-origin path (e.g. "/api/v1"), so `new URL`
  // needs a base. Resolve against the browser origin in the client; fall back
  // to a localhost base in non-browser environments (tests, SSR).
  const base = env.API_URL.startsWith("http")
    ? env.API_URL
    : typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost";
  const url = new URL(`${env.API_URL}${path}`, base);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function request<T>(
  path: string,
  init: RequestInit & { query?: Query } = {},
): Promise<T> {
  const { query, ...rest } = init;
  const res = await fetch(buildUrl(path, query), {
    credentials: "include",
    headers: {
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...rest.headers,
    },
    ...rest,
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : undefined;

  if (!res.ok) {
    const errBody = body as ApiErrorBody | undefined;
    throw new ApiError(
      res.status,
      errBody?.error?.code ?? "UNKNOWN_ERROR",
      errBody?.error?.message ?? res.statusText,
      errBody?.error?.details,
    );
  }

  return body?.data as T;
}

async function requestRaw<T>(
  path: string,
  init: RequestInit & { query?: Query } = {},
): Promise<{ data: T; pagination?: PaginationMeta; unread?: number }> {
  const { query, ...rest } = init;
  const res = await fetch(buildUrl(path, query), {
    credentials: "include",
    headers: {
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...rest.headers,
    },
    ...rest,
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : undefined;

  if (!res.ok) {
    const errBody = body as ApiErrorBody | undefined;
    throw new ApiError(
      res.status,
      errBody?.error?.code ?? "UNKNOWN_ERROR",
      errBody?.error?.message ?? res.statusText,
      errBody?.error?.details,
    );
  }

  return { data: body?.data as T, pagination: body?.meta?.pagination, unread: body?.meta?.unread };
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>(path, { method: "GET", query }),
  post: <T>(path: string, body?: unknown, query?: Query) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined, query }),
  patch: <T>(path: string, body?: unknown, query?: Query) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined, query }),
  put: <T>(path: string, body?: unknown, query?: Query) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined, query }),
  delete: <T>(path: string, query?: Query) => request<T>(path, { method: "DELETE", query }),

  /** Use for paginated list endpoints — surfaces `meta.pagination` alongside the array. */
  list: async <T>(path: string, query?: Query): Promise<ListResult<T>> => {
    const { data, pagination } = await requestRaw<T[]>(path, { method: "GET", query });
    return {
      items: data,
      pagination: pagination ?? { page: 1, limit: data.length, totalItems: data.length, totalPages: 1 },
    };
  },

  /** Use when the caller also needs meta fields beyond pagination (e.g. notifications' `meta.unread`). */
  raw: requestRaw,

  /**
   * Fetch a raw/binary response (file download). Throws ApiError on failure so
   * callers get the standard error envelope, and returns the Response for
   * blob/text handling.
   */
  download: async (path: string, query?: Query): Promise<Response> => {
    const res = await fetch(buildUrl(path, query), { credentials: "include" });
    if (!res.ok) {
      let message = res.statusText;
      let code = "DOWNLOAD_FAILED";
      try {
        const body = (await res.json()) as ApiErrorBody | undefined;
        if (body?.error?.message) message = body.error.message;
        if (body?.error?.code) code = body.error.code;
      } catch {
        // non-JSON error body — keep statusText
      }
      throw new ApiError(res.status, code, message);
    }
    return res;
  },
};
