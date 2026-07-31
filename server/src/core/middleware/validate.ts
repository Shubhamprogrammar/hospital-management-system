import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";
import { AppError } from "../errors/AppError.js";

/**
 * Zod validation middleware factory. Validates against `VALIDATION_ERROR`
 * standard error code (FRD 3.4).
 */
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      return next(
        new AppError("Validation failed", 400, details, "VALIDATION_ERROR"),
      );
    }

    // Attach validated, typed data
    (req as any).validated = result.data;
    next();
  };
}
