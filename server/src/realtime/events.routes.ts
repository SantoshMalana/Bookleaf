import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { hub } from './hub.js';

/**
 * GET /api/v1/events — Server-Sent Events stream of ticket change notifications.
 *
 * Why SSE over WebSockets: updates are one-way (server → browser), SSE reconnects
 * automatically, works through proxies/HTTP2, and authenticates with the same session cookie.
 * The client also polls as a safety net, so a dropped stream only delays — never loses — updates.
 */
export const eventsRouter = Router();

eventsRouter.get('/', authenticate, (req, res) => {
  const auth = req.auth!;
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable proxy buffering (nginx/Render) so events flush immediately
  });
  res.flushHeaders();
  res.write('retry: 3000\n');
  res.write(`event: ready\ndata: ${JSON.stringify({ role: auth.role })}\n\n`);

  const unsubscribe = hub.subscribe(auth.role, auth.authorId, (event) => {
    res.write(`event: ticket\ndata: ${JSON.stringify(event)}\n\n`);
  });
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000); // keeps idle connections open

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});
