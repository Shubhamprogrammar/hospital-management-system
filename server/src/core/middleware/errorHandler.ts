import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError.js";
import { env } from "../../config/env.js";

interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
    stack?: string;
    details?: unknown;
  };
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  let statusCode = 500;
  let message = "Internal server error";
  let code: string | undefined;
  let details: unknown;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    code = err.code;
  } else if (err.name === "ZodError") {
    statusCode = 400;
    message = "Validation error";
    code = "VALIDATION_ERROR";
    details = (err as any).errors ?? (err as any).issues;
  } else if (err.name === "PrismaClientKnownRequestError") {
    statusCode = 400;
    message = "Database error";
    code = (err as any).code;
  } else if (err.name === "BetterAuthError") {
    statusCode = 401;
    message = err.message;
    code = "AUTH_ERROR";
  }

  // Log in all environments
  console.error(`[ERROR] ${statusCode} - ${message}`, {
    code,
    stack: err.stack,
    details: env.NODE_ENV === "development" ? details : undefined,
  });

  const errorBody: Record<string, unknown> = {
    message,
  };

  if (code !== undefined) {
    errorBody.code = code;
  }

  if (env.NODE_ENV === "development" && err.stack) {
    errorBody.stack = err.stack;
  }

  if (details !== undefined) {
    errorBody.details = details;
  }

  const response: ErrorResponse = {
    success: false,
    error: errorBody as { message: string; code?: string; stack?: string; details?: unknown },
  };

  res.status(statusCode).json(response);
}
