/**
 * Ticket use-cases shared by both portals: create, list, read, author follow-up.
 * Admin-only operations live in admin-ticket.service.ts.
 *
 * Authorization rule enforced here (not only in routes): an author's queries are always
 * scoped by their own author id, and a ticket that belongs to someone else is reported as
 * 404 (not 403) so ticket ids cannot be probed.
 */
import type { FilterQuery } from 'mongoose';
import type { AuthContext } from '../../types/express.js';
import { Errors } from '../../lib/errors.js';
import { computeSlaDueAt } from '../../domain/sla.js';
import { scheduleTriage } from '../../ai/triage.service.js';
import { hub } from '../../realtime/hub.js';
import { Book, Message, Ticket, nextSequence, type IMessage, type ITicket } from '../../models/index.js';
import type { CreateTicketInput, ListTicketsQuery } from './ticket.schemas.js';
import { logEvent } from './activity.js';
import { toAdminTicket, toAuthorTicket, type PopulatedTicket } from './ticket.dto.js';

const POPULATE = [
  { path: 'author', select: 'name authorCode email' },
  { path: 'book', select: 'title bookCode status' },
  { path: 'assignedTo', select: 'name' },
] as const;

export const populatedQuery = <T>(q: T): T => (q as any).populate(POPULATE);

const BASE_NUMBER = 1000;

export async function createTicket(auth: AuthContext, input: CreateTicketInput) {
  if (!auth.authorId) throw Errors.forbidden('Only authors can raise support tickets');

  let bookId = null;
  if (input.bookId) {
    // The book must belong to the requesting author — otherwise 404 (do not reveal it exists).
    const book = await Book.findOne({ _id: input.bookId, author: auth.authorId }).select('_id').lean();
    if (!book) throw Errors.notFound('Book');
    bookId = book._id;
  }

  const now = new Date();
  const number = BASE_NUMBER + (await nextSequence('ticket'));
  const ticket = await Ticket.create({
    number,
    author: auth.authorId,
    book: bookId,
    subject: input.subject,
    description: input.description,
    attachments: input.attachments,
    status: 'Open',
    isActive: true,
    awaitingResponseSince: now,
    slaDueAt: computeSlaDueAt({ status: 'Open', priority: 'Medium', awaitingResponseSince: now }),
    lastActivityAt: now,
  });

  await logEvent(ticket._id, 'Ticket created by the author. AI triage queued.');
  hub.publish({ type: 'ticket.created', ticketId: String(ticket._id), ticketNumber: number, authorId: auth.authorId, authorVisible: true });
  scheduleTriage(String(ticket._id)); // async: never blocks or fails ticket creation
  return ticket;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildFilter(auth: AuthContext, f: ListTicketsQuery): FilterQuery<ITicket> {
  const q: FilterQuery<ITicket> = {};
  if (auth.role === 'author') q.author = auth.authorId;
  if (f.status) q.status = { $in: f.status };
  if (f.category) q.category = { $in: f.category };
  if (f.priority) q.priority = { $in: f.priority };
  if (f.from || f.to) q.createdAt = { ...(f.from ? { $gte: f.from } : {}), ...(f.to ? { $lte: new Date(f.to.getTime() + 86_400_000 - 1) } : {}) };
  if (f.assignee === 'me') q.assignedTo = auth.userId;
  else if (f.assignee === 'unassigned') q.assignedTo = null;
  else if (f.assignee) q.assignedTo = f.assignee;
  if (f.overdue) {
    q.isActive = true;
    q.slaDueAt = { $lt: new Date() };
  }
  if (f.q) {
    const rx = new RegExp(escapeRegex(f.q), 'i');
    const num = /^(?:bl-)?(\d{4,})$/i.exec(f.q)?.[1];
    q.$or = [{ subject: rx }, { description: rx }, ...(num ? [{ number: Number(num) }] : [])];
  }
  return q;
}

const SORTS = {
  // Active before finished; then most urgent; then oldest first — "what should I do next?"
  urgency: { isActive: -1, priorityRank: -1, createdAt: 1 },
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  activity: { lastActivityAt: -1 },
} as const;

export async function listTickets(auth: AuthContext, f: ListTicketsQuery) {
  const filter = buildFilter(auth, f);
  const sortKey = f.sort ?? (auth.role === 'admin' ? 'urgency' : 'activity');

  const [docs, total] = await Promise.all([
    populatedQuery(Ticket.find(filter))
      .sort(SORTS[sortKey] as any)
      .skip((f.page - 1) * f.limit)
      .limit(f.limit)
      .lean<PopulatedTicket[]>(),
    Ticket.countDocuments(filter),
  ]);

  const now = new Date();
  let items;
  if (auth.role === 'admin') {
    items = docs.map((t) => toAdminTicket(t, { now }));
  } else {
    // How many admin replies each ticket has — drives the "new reply" cue in the author's list.
    const counts = await Message.aggregate<{ _id: unknown; n: number }>([
      { $match: { ticket: { $in: docs.map((d) => d._id) }, kind: 'public', senderRole: 'admin' } },
      { $group: { _id: '$ticket', n: { $sum: 1 } } },
    ]);
    const byTicket = new Map(counts.map((c) => [String(c._id), c.n]));
    items = docs.map((t) => toAuthorTicket(t, undefined, byTicket.get(String(t._id)) ?? 0));
  }

  return { items, meta: { page: f.page, limit: f.limit, total, totalPages: Math.max(1, Math.ceil(total / f.limit)) } };
}

/** Loads a ticket the caller is allowed to see, or throws 404. */
export async function findAccessibleTicket(auth: AuthContext, ticketId: string): Promise<PopulatedTicket> {
  const filter: FilterQuery<ITicket> = { _id: ticketId };
  if (auth.role === 'author') filter.author = auth.authorId;
  const doc = await populatedQuery(Ticket.findOne(filter)).lean<PopulatedTicket | null>();
  if (!doc) throw Errors.notFound('Ticket');
  return doc;
}

export async function getTicket(auth: AuthContext, ticketId: string) {
  const t = await findAccessibleTicket(auth, ticketId);
  const visibility = auth.role === 'admin' ? {} : { kind: 'public' as const }; // authors: public rows only, filtered in the query itself
  const messages = await Message.find({ ticket: t._id, ...visibility }).sort({ createdAt: 1 }).lean<IMessage[]>();
  if (auth.role === 'admin') return toAdminTicket(t, { messages, adminName: auth.name, includeDraft: true });
  return toAuthorTicket(t, messages, messages.filter((m) => m.senderRole === 'admin').length);
}

export async function addAuthorMessage(auth: AuthContext, ticketId: string, body: string) {
  if (auth.role !== 'author') throw Errors.forbidden('Use the admin reply endpoint to respond to authors');
  const ticket = await Ticket.findOne({ _id: ticketId, author: auth.authorId });
  if (!ticket) throw Errors.notFound('Ticket');
  if (ticket.status === 'Closed') throw Errors.conflict('TICKET_CLOSED', 'This ticket is closed. Please raise a new ticket for further questions.');

  const now = new Date();
  await Message.create({ ticket: ticket._id, kind: 'public', senderRole: 'author', sender: auth.userId, senderName: auth.name, body });

  const reopened = ticket.status === 'Resolved';
  if (reopened) {
    ticket.status = 'Open';
    ticket.isActive = true;
    ticket.resolvedAt = null;
  }
  ticket.awaitingResponseSince = now;
  ticket.slaDueAt = computeSlaDueAt(ticket);
  ticket.lastActivityAt = now;
  await ticket.save();

  if (reopened) await logEvent(ticket._id, 'Ticket reopened automatically by the author\'s follow-up (Resolved → Open).');
  hub.publish({ type: 'ticket.message', ticketId: String(ticket._id), ticketNumber: ticket.number, authorId: String(ticket.author), authorVisible: true });
  return getTicket(auth, ticketId);
}
