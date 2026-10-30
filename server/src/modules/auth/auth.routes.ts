import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { Errors } from '../../lib/errors.js';
import { SESSION_COOKIE, authenticate } from '../../middleware/authenticate.js';
import { loginLimiter } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { env } from '../../config/env.js';
import { User } from '../../models/index.js';
import { demoAccounts, login, toUserDto } from './auth.service.js';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required').max(200),
});

/** "12h" / "7d" / "30m" → ms (for the cookie lifetime; the JWT carries its own expiry). */
function durationMs(s: string): number {
  const m = /^(\d+)\s*([smhd])$/.exec(s);
  if (!m) return 12 * 3_600_000;
  return Number(m[1]) * { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as 's' | 'm' | 'h' | 'd'];
}

export const authRouter = Router();

authRouter.post(
  '/login',
  loginLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { token, user } = await login(req.body.email, req.body.password);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true, // not readable by JS → not stealable via XSS
      sameSite: 'lax', // blocks cross-site POSTs (CSRF) while allowing normal navigation
      secure: req.secure, // true behind HTTPS (trust proxy is enabled)
      maxAge: durationMs(env.JWT_EXPIRES_IN),
      path: '/',
    });
    // The token is also returned so API clients (Swagger/Postman) can use `Authorization: Bearer`.
    res.json({ data: { user, token } });
  }),
);

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.status(204).end();
});

authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.auth!.userId).lean();
    if (!user) throw Errors.unauthenticated('Account no longer exists');
    res.json({ data: { user: toUserDto(user) } });
  }),
);

authRouter.get('/demo-accounts', asyncHandler(async (_req, res) => res.json({ data: await demoAccounts() })));
