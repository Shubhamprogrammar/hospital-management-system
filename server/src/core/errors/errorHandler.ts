import type { Request, Response, NextFunction } from "express";
import { Prisma } from "../../generated/prisma/client.js";
import mongoose from "mongoose";
import { AppError } from "./AppError.js";
import { logger } from "../utils/logger.js";

/**
 * Global error handler — emits the FRD 3.3 failure envelope:
 * { success: false, error: { code, message, details }, meta: { requestId } }
 */
export const globalErrorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  let statusCode = 500;
  let code = "INTERNAL_ERROR";
  let message = "Internal server error";
  let details: unknown;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
    code = err.code ?? statusToCode(statusCode);
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      statusCode = 409;
      code = "CONFLICT";
      message = `Duplicate value for field(s): ${err.meta?.target}`;
    } else if (err.code === "P2025") {
      statusCode = 404;
      code = "NOT_FOUND";
      message = "Record not found";
    } else if (err.code === "P2003") {
      statusCode = 400;
      code = "VALIDATION_ERROR";
      message = "Invalid reference - related record does not exist";
    } else {
      statusCode = 400;
      code = "VALIDATION_ERROR";
      message = "Database constraint violation";
    }
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = "Invalid data provided";
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = Object.values(err.errors)
      .map((e: mongoose.Error.ValidatorError | mongoose.Error.CastError) => e.message)
      .join(", ");
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = `Invalid ${err.path}: ${err.value}`;
  } else if (err instanceof Error) {
    if (err.name === "JsonWebTokenError") {
      statusCode = 401;
      code = "UNAUTHENTICATED";
      message = "Invalid token";
    } else if (err.name === "TokenExpiredError") {
      statusCode = 401;
      code = "UNAUTHENTICATED";
      message = "Token expired, please login again";
    } else if (err.name === "ZodError") {
      statusCode = 400;
      code = "VALIDATION_ERROR";
      message = "Validation error";
      details = (err as any).errors ?? (err as any).issues;
    }
  }

  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} - ${message}`, {
      stack: err instanceof Error ? err.stack : undefined,
    });
  } else {
    logger.warn(`${req.method} ${req.originalUrl} - ${message}`);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
    meta: {
      requestId: (req as any).requestId,
    },
    ...(process.env.NODE_ENV === "development" && err instanceof Error
      ? { stack: err.stack }
      : {}),
  });
};

function statusToCode(status: number): string {
  switch (status) {
    case 400:
      return "VALIDATION_ERROR";
    case 401:
      return "UNAUTHENTICATED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 429:
      return "RATE_LIMITED";
    default:
      return "INTERNAL_ERROR";
  }
}
