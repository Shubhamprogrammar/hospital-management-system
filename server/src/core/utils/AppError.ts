export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code: string | undefined;

  constructor(message: string, statusCode: number = 500, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;

    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, code?: string): AppError {
    return new AppError(message, 400, code);
  }

  static unauthorized(message: string = "Unauthorized", code?: string): AppError {
    return new AppError(message, 401, code);
  }

  static forbidden(message: string = "Forbidden", code?: string): AppError {
    return new AppError(message, 403, code);
  }

  static notFound(message: string = "Resource not found", code?: string): AppError {
    return new AppError(message, 404, code);
  }

  static conflict(message: string, code?: string): AppError {
    return new AppError(message, 409, code);
  }

  static internal(message: string = "Internal server error", code?: string): AppError {
    return new AppError(message, 500, code);
  }
}
