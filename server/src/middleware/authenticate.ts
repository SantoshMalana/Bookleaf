import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ROLES, type Role } from '../config/constants.js';
import { Errors } from '../lib/errors.js';

export const SESSION_COOKIE = 'bl_session';

interface TokenPayload {
  sub: string;
  role: Role;
  aid: string | null;
  name: string;
  email: string;
}

export function signToken(p: TokenPayload): string {
  return jwt.sign(p, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] });
}

function extractToken(req: Parameters<RequestHandler>[0]): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  const cookie = req.cookies?.[SESSION_COOKIE];
  return typeof cookie === 'string' && cookie ? cookie : null;
}

/**
 * Authentication middleware. Accepts either an `Authorization: Bearer <jwt>` header (API clients,
 * Swagger, Postman) or the httpOnly session cookie (the browser app and SSE).
 */
export const authenticate: RequestHandler = (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next(Errors.unauthenticated());
  try {
    const p = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload & TokenPayload;
    if (!ROLES.includes(p.role) || !p.sub) return next(Errors.unauthenticated('Invalid session'));
    req.auth = { userId: p.sub, role: p.role, authorId: p.aid ?? null, name: p.name, email: p.email };
    next();
  } catch {
    next(Errors.unauthenticated('Session expired or invalid — please sign in again'));
  }
};

/** Role-based access control. Must run after `authenticate`. */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) return next(Errors.unauthenticated());
    if (!roles.includes(req.auth.role)) return next(Errors.forbidden());
    next();
  };
