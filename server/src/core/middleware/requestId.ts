import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

// Express guarantees URL params are strings at runtime. With
// noUncheckedIndexedAccess enabled, req.params.* is otherwise typed
// `string | undefined` across every module — declare the known param
// names so controllers don't need non-null assertions everywhere.
declare module "express-serve-static-core" {
  interface ParamsDictionary {
    id: string;
    entityType: string;
    entityId: string;
    sessionId: string;
    provider: string;
    key: string;
    appointmentId: string;
    visitId: string;
  }
}

/**
 * Assigns an X-Request-Id to every request (client-provided or generated)
 * for cross-service tracing (FRD 3.2, 44).
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers["x-request-id"];
  const id = typeof incoming === "string" && incoming ? incoming : randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}
