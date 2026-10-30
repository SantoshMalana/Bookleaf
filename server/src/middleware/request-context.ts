import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

/** Gives every request an id (echoed in the X-Request-Id header and in error bodies) for log correlation. */
export const requestContext: RequestHandler = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  req.requestId = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
};
