import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { aiStatus } from './ai/ai-client.js';
import { env } from './config/env.js';
import { openApiSpec } from './docs/openapi.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { apiLimiter } from './middleware/rate-limit.js';
import { requestContext } from './middleware/request-context.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { bookRouter } from './modules/books/book.routes.js';
import { meRouter } from './modules/me/me.routes.js';
import { ticketRouter } from './modules/tickets/ticket.routes.js';
import { eventsRouter } from './realtime/events.routes.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Builds the Express app without starting a server (so tests can mount it with supertest). */
export function createApp(): Express {
  const app = express();
  app.set('trust proxy', 1); // behind Render/Vercel/nginx: correct client IPs + req.secure
  app.disable('x-powered-by');

  app.use(requestContext);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).requestId ?? '',
      autoLogging: { ignore: (req) => req.url === '/api/v1/health' || req.url?.startsWith('/api/v1/events') === true },
    }),
  );
  app.use(helmet());
  if (env.CLIENT_ORIGIN) app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  // Never gzip the SSE stream (it would be buffered until the buffer fills).
  app.use(compression({ filter: (req, res) => (req.path.endsWith('/events') ? false : compression.filter(req, res)) }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // ── API documentation (Swagger UI needs a looser CSP than the rest of the app) ──
  app.get('/api/openapi.json', (_req, res) => res.json(openApiSpec));
  app.use(
    '/api/docs',
    (_req: express.Request, res: express.Response, next: express.NextFunction) => {
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:");
      next();
    },
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec as any, { customSiteTitle: 'BookLeaf API docs' }),
  );

  // ── REST API ──
  const api = express.Router();
  api.use(apiLimiter);
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'up' : 'down', ai: aiStatus(), uptimeSeconds: Math.round(process.uptime()) });
  });
  api.use('/auth', authRouter);
  api.use('/me', meRouter);
  api.use('/books', bookRouter);
  api.use('/tickets', ticketRouter);
  api.use('/events', eventsRouter);
  api.use('/admin', adminRouter);
  api.use(notFoundHandler);
  app.use('/api/v1', api);

  // ── Single-page app (production: the same service serves the built React app) ──
  const dist = env.CLIENT_DIST ?? path.resolve(here, '../../client/dist');
  if (existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { maxAge: '1h', index: false }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
