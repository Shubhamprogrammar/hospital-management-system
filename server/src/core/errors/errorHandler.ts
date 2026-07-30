import type { Request, Response, NextFunction } from "express";
import { Prisma } from "../../../generated/prisma/client.js";
import mongoose from "mongoose";
import { AppError } from "./AppError.js";
import { logger } from "../utils/logger.js";

export const globalErrorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  let statusCode = 500;
  let message = "Internal server error";
  let details: unknown;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      statusCode = 409;
      message = `Duplicate value for field(s): ${err.meta?.target}`;
    } else if (err.code === "P2025") {
      statusCode = 404;
      message = "Record not found";
    } else if (err.code === "P2003") {
      statusCode = 400;
      message = "Invalid reference - related record does not exist";
    }
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    statusCode = 400;
    message = "Invalid data provided";
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e: mongoose.Error.ValidatorError | mongoose.Error.CastError) => e.message)
      .join(", ");
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  } else if (err instanceof Error) {
    if (err.name === "JsonWebTokenError") {
      statusCode = 401;
      message = "Invalid token";
    } else if (err.name === "TokenExpiredError") {
      statusCode = 401;
      message = "Token expired, please login again";
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
    message,
    ...(details ? { details } : {}),
    ...(process.env.NODE_ENV === "development" && err instanceof Error
      ? { stack: err.stack }
      : {}),
  });
};
