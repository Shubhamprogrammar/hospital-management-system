export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public details?: unknown;
  public code: string | undefined;

  constructor(message: string, statusCode: number, details?: unknown, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }

  // Static factory methods for compatibility with new-style usage
  static badRequest(message: string, code?: string): AppError {
    return new AppError(message, 400, undefined, code);
  }

  static unauthorized(message: string = "Unauthorized", code?: string): AppError {
    return new AppError(message, 401, undefined, code);
  }

  static forbidden(message: string = "Forbidden", code?: string): AppError {
    return new AppError(message, 403, undefined, code);
  }

  static notFound(message: string = "Resource not found", code?: string): AppError {
    return new AppError(message, 404, undefined, code);
  }

  static conflict(message: string, code?: string): AppError {
    return new AppError(message, 409, undefined, code);
  }

  static internal(message: string = "Internal server error", code?: string): AppError {
    return new AppError(message, 500, undefined, code);
  }

  static serviceUnavailable(message: string = "Service temporarily unavailable", code?: string): AppError {
    return new AppError(message, 503, undefined, code);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super(`${resource} not found`, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden - insufficient permissions") {
    super(message, 403);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details?: unknown) {
    super(message, 400, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict - resource already exists") {
    super(message, 409);
  }
}
