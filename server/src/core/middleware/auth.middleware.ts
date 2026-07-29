import type { Request, Response, NextFunction } from "express";

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  // TODO: implement JWT verification
  next();
}
