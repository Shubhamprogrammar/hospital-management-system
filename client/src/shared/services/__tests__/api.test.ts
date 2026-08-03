import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, api } from "@/shared/services/api";

/** Builds a minimal fetch Response-like object for stubbing `global.fetch`. */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null),
    },
    json: async () => body,
  } as unknown as Response;
}

function textResponse(status: number, statusText: string): Response {
  return {
    ok: false,
    status,
    statusText,
    headers: { get: () => null },
    json: async () => {
      throw new Error("not json");
    },
  } as unknown as Response;
}

// Untyped mock: `mock.calls` entries are `any[]`, so call-arg assertions don't
// trip strict-mode "possibly undefined" errors on the optional fetch `init`.
const fetchMock = vi.fn();

describe("api client", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GET sends credentials and builds a query string from params", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ id: "1" }] }));

    const result = await api.get<{ id: string }[]>("/patients", { page: 2, search: "rahul", empty: "", nil: null, undef: undefined });

    expect(result).toEqual([{ id: "1" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/v1/patients");
    expect(url).toContain("page=2");
    expect(url).toContain("search=rahul");
    // undefined / null / empty-string params are dropped
    expect(url).not.toContain("empty");
    expect(url).not.toContain("nil");
    expect(url).not.toContain("undef");
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("include");
  });

  it("POST serializes the JSON body and sets the content-type header", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { id: "new-1" } }));

    const result = await api.post<{ id: string }>("/patients", { name: "Rahul" });

    expect(result).toEqual({ id: "new-1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/v1/patients");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ name: "Rahul" });
  });

  it("PATCH / PUT / DELETE use their HTTP methods", async () => {
    const okResponse = () => jsonResponse({ data: { ok: true } });
    fetchMock.mockResolvedValueOnce(okResponse());
    fetchMock.mockResolvedValueOnce(okResponse());
    fetchMock.mockResolvedValueOnce(okResponse());

    await api.patch("/patients/1", { name: "X" });
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");

    await api.put("/settings/1", { value: 2 });
    expect(fetchMock.mock.calls[1][1].method).toBe("PUT");

    await api.delete("/patients/1");
    expect(fetchMock.mock.calls[2][1].method).toBe("DELETE");
  });

  it("list() unwraps items and pagination from the meta block", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [{ id: "1" }, { id: "2" }],
        meta: { pagination: { page: 1, limit: 10, totalItems: 2, totalPages: 1 } },
      }),
    );

    const result = await api.list<{ id: string }>("/appointments", { limit: 10 });

    expect(result.items).toHaveLength(2);
    expect(result.pagination).toEqual({ page: 1, limit: 10, totalItems: 2, totalPages: 1 });
  });

  it("list() falls back to inferred pagination when meta.pagination is absent", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [1, 2, 3] }));

    const result = await api.list<number>("/items");

    expect(result.items).toEqual([1, 2, 3]);
    expect(result.pagination).toEqual({ page: 1, limit: 3, totalItems: 3, totalPages: 1 });
  });

  it("raw() surfaces extra meta fields like unread count", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{ id: "n1" }], meta: { pagination: { page: 1, limit: 20, totalItems: 1, totalPages: 1 }, unread: 4 } }),
    );

    const result = await api.raw<{ id: string }[]>("/notifications");

    expect(result.data).toEqual([{ id: "n1" }]);
    expect(result.unread).toBe(4);
  });

  it("throws ApiError with code/message/details for JSON error responses", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { success: false, error: { code: "VALIDATION_ERROR", message: "departmentId is required", details: { field: "departmentId" } } },
        400,
      ),
    );

    const error = await api.get("/opd/queue").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).code).toBe("VALIDATION_ERROR");
    expect((error as ApiError).message).toBe("departmentId is required");
    expect((error as ApiError).details).toEqual({ field: "departmentId" });
  });

  it("falls back to statusText for non-JSON error responses", async () => {
    fetchMock.mockResolvedValueOnce(textResponse(500, "Internal Server Error"));

    const error = await api.get("/boom").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(500);
    expect((error as ApiError).code).toBe("UNKNOWN_ERROR");
    expect((error as ApiError).message).toBe("Internal Server Error");
  });
});
