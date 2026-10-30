import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { authenticate, requireRole } from '../../middleware/authenticate.js';
import { ticketCreateLimiter } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { addAuthorMessage, createTicket, getTicket, listTickets } from './ticket.service.js';
import { createTicketSchema, listTicketsQuerySchema, messageSchema, ticketIdParams, type CreateTicketInput, type ListTicketsQuery } from './ticket.schemas.js';
import { toAuthorTicket, type PopulatedTicket } from './ticket.dto.js';
import { Ticket } from '../../models/index.js';
import { populatedQuery } from './ticket.service.js';

/**
 * Author-facing ticket API (admins may also read through these two GETs and receive the
 * admin representation; everything admin-specific lives under /admin).
 */
export const ticketRouter = Router();
ticketRouter.use(authenticate);

ticketRouter.get(
  '/',
  validate({ query: listTicketsQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await listTickets(req.auth!, req.query as unknown as ListTicketsQuery));
  }),
);

ticketRouter.post(
  '/',
  requireRole('author'),
  ticketCreateLimiter,
  validate({ body: createTicketSchema }),
  asyncHandler(async (req, res) => {
    const ticket = await createTicket(req.auth!, req.body as CreateTicketInput);
    const populated = await populatedQuery(Ticket.findById(ticket._id)).lean<PopulatedTicket>();
    res.status(201).json({ data: toAuthorTicket(populated!) });
  }),
);

ticketRouter.get(
  '/:ticketId',
  validate({ params: ticketIdParams }),
  asyncHandler(async (req, res) => {
    res.json({ data: await getTicket(req.auth!, req.params.ticketId as string) });
  }),
);

ticketRouter.post(
  '/:ticketId/messages',
  requireRole('author'),
  validate({ params: ticketIdParams, body: messageSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await addAuthorMessage(req.auth!, req.params.ticketId as string, req.body.body) });
  }),
);
