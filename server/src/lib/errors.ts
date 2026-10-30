/**
 * One error type for the whole API. Anything thrown as AppError is rendered by the
 * error-handling middleware as { error: { code, message, details?, requestId } }.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  badRequest: (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details),
  validation: (details: unknown) => new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', details),
  unauthenticated: (message = 'Authentication required') => new AppError(401, 'UNAUTHENTICATED', message),
  invalidCredentials: () => new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password'),
  forbidden: (message = 'You do not have access to this resource') => new AppError(403, 'FORBIDDEN', message),
  notFound: (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`),
  conflict: (code: string, message: string) => new AppError(409, code, message),
  tooMany: (message = 'Too many requests, please slow down') => new AppError(429, 'RATE_LIMITED', message),
  aiUnavailable: (message: string) => new AppError(503, 'AI_UNAVAILABLE', message),
};
