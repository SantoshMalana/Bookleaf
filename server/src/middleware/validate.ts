import type { RequestHandler } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { Errors } from '../lib/errors.js';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Declarative request validation. Parsed (coerced, trimmed, defaulted) values replace the raw
 * ones, so handlers can rely on types and never see unvalidated input.
 */
export const validate =
  (schemas: Schemas): RequestHandler =>
  (req, _res, next) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) req.query = schemas.query.parse(req.query);
      if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(Errors.validation(err.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message }))));
      }
      next(err);
    }
  };
