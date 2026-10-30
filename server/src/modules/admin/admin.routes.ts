import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { authenticate, requireRole } from '../../middleware/authenticate.js';
import { aiActionLimiter } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { getAiUsage } from '../../ai/usage.service.js';
import { getTicket, listTickets } from '../tickets/ticket.service.js';
import {
  addInternalNote,
  assignTicket,
  draftForTicket,
  getQueueStats,
  replyToAuthor,
  retriageTicket,
  updateTicket,
} from '../tickets/admin-ticket.service.js';
import {
  adminReplySchema,
  adminUpdateSchema,
  assignmentSchema,
  draftRequestSchema,
  listTicketsQuerySchema,
  noteSchema,
  ticketIdParams,
  type ListTicketsQuery,
} from '../tickets/ticket.schemas.js';

/** Everything under /api/v1/admin requires the admin role. */
export const adminRouter = Router();
adminRouter.use(authenticate, requireRole('admin'));

adminRouter.get('/stats', asyncHandler(async (req, res) => res.json({ data: await getQueueStats(req.auth!) })));

adminRouter.get(
  '/ai/usage',
  asyncHandler(async (_req, res) => res.json({ data: await getAiUsage() })),
);

adminRouter.get(
  '/tickets',
  validate({ query: listTicketsQuerySchema }),
  asyncHandler(async (req, res) => res.json(await listTickets(req.auth!, req.query as unknown as ListTicketsQuery))),
);

adminRouter.get(
  '/tickets/:ticketId',
  validate({ params: ticketIdParams }),
  asyncHandler(async (req, res) => res.json({ data: await getTicket(req.auth!, req.params.ticketId as string) })),
);

adminRouter.patch(
  '/tickets/:ticketId',
  validate({ params: ticketIdParams, body: adminUpdateSchema }),
  asyncHandler(async (req, res) => res.json({ data: await updateTicket(req.auth!, req.params.ticketId as string, req.body) })),
);

adminRouter.post(
  '/tickets/:ticketId/replies',
  validate({ params: ticketIdParams, body: adminReplySchema }),
  asyncHandler(async (req, res) => res.status(201).json({ data: await replyToAuthor(req.auth!, req.params.ticketId as string, req.body) })),
);

adminRouter.post(
  '/tickets/:ticketId/notes',
  validate({ params: ticketIdParams, body: noteSchema }),
  asyncHandler(async (req, res) => res.status(201).json({ data: await addInternalNote(req.auth!, req.params.ticketId as string, req.body.body) })),
);

adminRouter.put(
  '/tickets/:ticketId/assignee',
  validate({ params: ticketIdParams, body: assignmentSchema }),
  asyncHandler(async (req, res) => res.json({ data: await assignTicket(req.auth!, req.params.ticketId as string, req.body.assignee) })),
);

/** Generate (or return the cached) AI draft. Falls back to a policy template if the AI is unavailable. */
adminRouter.post(
  '/tickets/:ticketId/draft',
  aiActionLimiter,
  validate({ params: ticketIdParams, body: draftRequestSchema }),
  asyncHandler(async (req, res) => res.json({ data: await draftForTicket(req.auth!, req.params.ticketId as string, req.body.force) })),
);

/** Re-run AI triage (never overwrites a category/priority an admin has set manually). */
adminRouter.post(
  '/tickets/:ticketId/triage',
  aiActionLimiter,
  validate({ params: ticketIdParams }),
  asyncHandler(async (req, res) => res.json({ data: await retriageTicket(req.auth!, req.params.ticketId as string) })),
);
