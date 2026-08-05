"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import type { PaginationMeta } from "@/shared/types";
import type { ListResult } from "@/shared/services/api";

interface ListQueryOptions<T> {
  queryKey: string[];
  queryFn: (params: { page: number; limit: number }) => Promise<ListResult<T>>;
  initialPage?: number;
  pageSize?: number;
  /** When false the list query is not fetched (e.g. role-specific views). */
  enabled?: boolean;
}

export interface ListQueryResult<T> {
  data: ListResult<T> | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  page: number;
  setPage: (page: number) => void;
  meta: PaginationMeta;
}

/** Standard paginated-list query hook used by module pages. */
export function useListQuery<T>({ queryKey, queryFn, initialPage = 1, pageSize = 10, enabled = true }: ListQueryOptions<T>): ListQueryResult<T> {
  const [page, setPage] = useState(initialPage);

  const query = useQuery({
    queryKey: [...queryKey, page, pageSize],
    queryFn: () => queryFn({ page, limit: pageSize }),
    enabled,
  });

  const meta: PaginationMeta =
    query.data?.pagination ?? { page, limit: pageSize, totalItems: 0, totalPages: 1 };

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error ?? null,
    refetch: () => {
      void query.refetch();
    },
    page,
    setPage,
    meta,
  };
}
