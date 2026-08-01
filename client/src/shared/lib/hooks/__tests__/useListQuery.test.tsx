import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useListQuery } from "@/shared/lib/hooks/useListQuery";
import type { ListResult } from "@/shared/services/api";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const listResult = (items: string[], page: number, totalItems: number): ListResult<string> => ({
  items,
  pagination: { page, limit: 10, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / 10)) },
});

describe("useListQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls queryFn with page=1 and limit=10 by default and exposes data + meta", async () => {
    const client = makeQueryClient();
    const queryFn = vi.fn().mockResolvedValue(listResult(["a", "b"], 1, 2));

    const { result } = renderHook(() => useListQuery({ queryKey: ["patients"], queryFn }), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(queryFn).toHaveBeenCalledWith({ page: 1, limit: 10 });
    expect(result.current.data?.items).toEqual(["a", "b"]);
    expect(result.current.meta.totalItems).toBe(2);
    expect(result.current.page).toBe(1);
  });

  it("setPage triggers a refetch with the new page and updates meta", async () => {
    const client = makeQueryClient();
    const queryFn = vi
      .fn()
      .mockResolvedValueOnce(listResult(["a"], 1, 25))
      .mockResolvedValueOnce(listResult(["b"], 3, 25));

    const { result } = renderHook(() => useListQuery({ queryKey: ["patients"], queryFn }), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.items).toEqual(["a"]);

    act(() => result.current.setPage(3));

    await waitFor(() => expect(result.current.data?.items).toEqual(["b"]));
    expect(queryFn).toHaveBeenLastCalledWith({ page: 3, limit: 10 });
    expect(result.current.page).toBe(3);
  });

  it("refetch re-runs queryFn and surfaces the latest data", async () => {
    const client = makeQueryClient();
    const queryFn = vi
      .fn()
      .mockResolvedValueOnce(listResult(["a"], 1, 1))
      .mockResolvedValueOnce(listResult(["a", "b"], 1, 2));

    const { result } = renderHook(() => useListQuery({ queryKey: ["patients"], queryFn }), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() => expect(result.current.data?.items).toEqual(["a"]));

    act(() => result.current.refetch());

    await waitFor(() => expect(result.current.data?.items).toEqual(["a", "b"]));
    expect(result.current.meta.totalItems).toBe(2);
  });

  it("exposes isError and the error when queryFn rejects", async () => {
    const client = makeQueryClient();
    const queryFn = vi.fn().mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useListQuery({ queryKey: ["patients"], queryFn }), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe("boom");
    expect(result.current.data).toBeUndefined();
  });

  it("returns a sensible default meta before any data resolves", () => {
    const client = makeQueryClient();
    const queryFn = vi.fn().mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useListQuery({ queryKey: ["patients"], queryFn }), {
      wrapper: wrapperFor(client),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.meta).toEqual({ page: 1, limit: 10, totalItems: 0, totalPages: 1 });
    expect(result.current.data).toBeUndefined();
  });
});
