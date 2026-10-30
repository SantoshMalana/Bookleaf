import type { ErrorRequestHandler, RequestHandler } from 'express';
import { env } from '../config/env.js';
import { AppError, Errors } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `No route for ${req.method} ${req.originalUrl.split('?')[0]}`));
};

/**
 * Last-resort error mapper. Every response has the same envelope:
 *   { error: { code, message, details?, requestId } }
 * Unknown errors become a generic 500 (details only in logs, never leaked to the client).
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let appErr: AppError;

  if (err instanceof AppError) appErr = err;
  else if (err?.type === 'entity.parse.failed') appErr = Errors.badRequest('Request body is not valid JSON');
  else if (err?.type === 'entity.too.large') appErr = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  else if (err?.name === 'CastError') appErr = Errors.badRequest(`Invalid value for "${err.path}"`);
  else if (err?.code === 11000) appErr = Errors.conflict('DUPLICATE', 'A record with these details already exists');
  else {
    logger.error({ err, requestId: req.requestId, path: req.originalUrl }, 'unhandled error');
    appErr = new AppError(500, 'INTERNAL_ERROR', env.isProd ? 'Something went wrong on our side' : String(err?.message ?? err));
  }

  if (res.headersSent) return;
  res.status(appErr.status).json({
    error: { code: appErr.code, message: appErr.message, ...(appErr.details ? { details: appErr.details } : {}), requestId: req.requestId },
  });
};
