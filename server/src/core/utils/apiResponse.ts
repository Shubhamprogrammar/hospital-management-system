import type { Response } from "express";

interface ApiResponseOptions {
  message?: string;
  meta?: Record<string, unknown>;
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode: number = 200,
  options?: ApiResponseOptions,
): void {
  res.status(statusCode).json({
    success: true,
    data,
    message: options?.message,
    meta: options?.meta,
  });
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  },
  options?: ApiResponseOptions,
): void {
  res.status(200).json({
    success: true,
    data,
    message: options?.message,
    pagination,
  });
}
