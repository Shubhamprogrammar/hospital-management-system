import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError.js";

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(`Route not found: ${req.originalUrl}`, 404));
};
