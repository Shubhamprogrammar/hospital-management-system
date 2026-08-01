// Type aliases (not interfaces) so they get implicit index signatures and are
// assignable to the api client's `Query = Record<string, unknown>`.
export type PaginationParams = {
  page?: number;
  limit?: number;
};

export type DateRangeParams = {
  from?: string;
  to?: string;
};

export type SearchParams = {
  search?: string;
};

export type ListParams = PaginationParams & SearchParams;
