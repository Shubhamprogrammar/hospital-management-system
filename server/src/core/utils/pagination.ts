/**
 * Standard pagination helper (FRD 3.7).
 * Query params: page (default 1), limit (default 20, max 100).
 */
export interface Pagination {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

export function parsePagination(
  pageRaw?: unknown,
  limitRaw?: unknown,
): Pagination {
  const page = Math.max(1, Number(pageRaw) || 1);
  const limit = Math.min(100, Math.max(1, Number(limitRaw) || 20));
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

export function buildPaginationMeta(
  totalItems: number,
  pagination: Pagination,
): PaginationMeta {
  return {
    page: pagination.page,
    limit: pagination.limit,
    totalItems,
    totalPages: Math.ceil(totalItems / pagination.limit),
  };
}
