import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const limit = (opts: { windowMs: number; max: number; code: string; message: string; key?: (req: any) => string }) =>
  rateLimit({
    windowMs: opts.windowMs,
    limit: env.isTest ? 10_000 : opts.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: opts.key,
    handler: (req, res) => {
      res.status(429).json({ error: { code: opts.code, message: opts.message, requestId: req.requestId } });
    },
  });

const ipOf = (req: any): string => req.ip ?? 'unknown';
const userOrIp = (req: any): string => req.auth?.userId ?? ipOf(req);

/** Brute-force protection on the login endpoint (per IP + email). */
export const loginLimiter = limit({
  windowMs: 15 * 60_000,
  max: 15,
  code: 'RATE_LIMITED',
  message: 'Too many sign-in attempts. Please try again in a few minutes.',
  key: (req) => `${ipOf(req)}:${String(req.body?.email ?? '').toLowerCase()}`,
});

/** Blanket limit for the whole API. */
export const apiLimiter = limit({ windowMs: 60_000, max: 600, code: 'RATE_LIMITED', message: 'Too many requests, please slow down.', key: userOrIp });

/** Caps ticket creation per author — also caps LLM spend a single account can trigger. */
export const ticketCreateLimiter = limit({
  windowMs: 60 * 60_000,
  max: 15,
  code: 'RATE_LIMITED',
  message: 'You have submitted several tickets in the last hour. Please wait a little before raising another.',
  key: userOrIp,
});

/** Cap on AI-triggering admin actions (draft generation, re-triage). */
export const aiActionLimiter = limit({ windowMs: 60_000, max: 30, code: 'RATE_LIMITED', message: 'Too many AI requests. Please wait a moment.', key: userOrIp });
