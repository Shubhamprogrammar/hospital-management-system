import type { Response } from "express";
import type { PaginationMeta } from "./pagination.js";

interface ApiResponseOptions {
  message?: string;
  pagination?: PaginationMeta;
}

/**
 * Success envelope per FRD 3.3:
 * { success: true, data, message?, meta: { requestId, pagination? } }
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode: number = 200,
  options?: ApiResponseOptions,
): void {
  res.status(statusCode).json({
    success: true,
    data,
    ...(options?.message ? { message: options.message } : {}),
    meta: {
      requestId: (res.req as any).requestId,
      ...(options?.pagination ? { pagination: options.pagination } : {}),
    },
  });
}

/**
 * Paginated list envelope (FRD 3.7) — meta includes page/limit/totalItems/totalPages.
 */
export function sendPaginated<T>(
  res: Response,
  data: T[],
  pagination: PaginationMeta,
  options?: ApiResponseOptions,
): void {
  sendSuccess(res, data, 200, {
    message: options?.message,
    pagination,
  });
}
