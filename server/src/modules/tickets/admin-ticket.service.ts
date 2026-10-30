/**
 * Admin-only ticket operations: reply, internal notes, status/category/priority overrides,
 * assignment, AI draft + re-triage, and queue statistics.
 *
 * Every state change is recorded as an "event" row so the ticket carries a full audit trail.
 */
import { ACTIVE_STATUSES, PRIORITIES, PRIORITY_RANK, STATUSES, type Status } from '../../config/constants.js';
import { computeSlaDueAt, isActiveStatus } from '../../domain/sla.js';
import { getOrCreateDraft, presentDraft, signature } from '../../ai/draft.service.js';
import { triageTicket } from '../../ai/triage.service.js';
import { Errors } from '../../lib/errors.js';
import { hub } from '../../realtime/hub.js';
import { Message, Ticket, type ITicket } from '../../models/index.js';
import type { AuthContext } from '../../types/express.js';
import { logEvent } from './activity.js';
import { getTicket } from './ticket.service.js';
import type { AdminReplyInput, AdminUpdateInput } from './ticket.schemas.js';
import type { HydratedDocument } from 'mongoose';

type TicketDoc = HydratedDocument<ITicket>;

async function loadTicket(ticketId: string): Promise<TicketDoc> {
  const t = await Ticket.findById(ticketId);
  if (!t) throw Errors.notFound('Ticket');
  return t;
}

const actor = (a: AuthContext) => ({ id: a.userId, name: a.name });

/** Single place that keeps status-derived fields consistent (isActive, timestamps, SLA clock). */
export function applyStatus(ticket: TicketDoc, status: Status, now = new Date()): void {
  ticket.status = status;
  ticket.isActive = isActiveStatus(status);
  if (ticket.isActive) {
    ticket.resolvedAt = null;
    ticket.closedAt = null;
    if (status === 'Open' && !ticket.awaitingResponseSince) ticket.awaitingResponseSince = now;
  } else {
    ticket.awaitingResponseSince = null;
    ticket.resolvedAt ??= now;
    if (status === 'Closed') ticket.closedAt = now;
  }
  ticket.slaDueAt = computeSlaDueAt(ticket);
}

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

export async function replyToAuthor(admin: AuthContext, ticketId: string, input: AdminReplyInput) {
  const ticket = await loadTicket(ticketId);
  if (ticket.status === 'Closed') throw Errors.conflict('TICKET_CLOSED', 'This ticket is closed. Reopen it before replying.');

  const now = new Date();
  let aiAssist: { fromDraft: boolean; edited: boolean } | null = null;
  if (input.usedDraft && ticket.draft) {
    const body = normalize(input.body);
    const unchanged = body === normalize(ticket.draft.body) || body === normalize(ticket.draft.body + signature(admin.name));
    aiAssist = { fromDraft: true, edited: !unchanged };
  }

  await Message.create({ ticket: ticket._id, kind: 'public', senderRole: 'admin', sender: admin.userId, senderName: admin.name, body: input.body, aiAssist });

  const before = ticket.status;
  const next: Status = input.status ?? (ticket.status === 'Open' ? 'In Progress' : ticket.status);
  if (next !== before) {
    applyStatus(ticket, next, now);
    await logEvent(ticket._id, `Status ${before} → ${next} (reply sent).`, actor(admin));
  }
  if (!ticket.assignedTo) {
    ticket.assignedTo = admin.userId as any;
    await logEvent(ticket._id, `Assigned to ${admin.name} (first reply).`, actor(admin));
  }
  ticket.firstResponseAt ??= now;
  ticket.awaitingResponseSince = null;
  ticket.slaDueAt = null;
  ticket.lastActivityAt = now;
  await ticket.save();

  hub.publish({ type: 'ticket.message', ticketId: String(ticket._id), ticketNumber: ticket.number, authorId: String(ticket.author), authorVisible: true });
  return getTicket(admin, ticketId);
}

export async function addInternalNote(admin: AuthContext, ticketId: string, body: string) {
  const ticket = await loadTicket(ticketId);
  await Message.create({ ticket: ticket._id, kind: 'internal', senderRole: 'admin', sender: admin.userId, senderName: admin.name, body });
  ticket.lastActivityAt = new Date();
  await ticket.save();
  // Internal: admins only (authorVisible=false) — authors never receive an event for notes.
  hub.publish({ type: 'ticket.updated', ticketId: String(ticket._id), ticketNumber: ticket.number, authorId: String(ticket.author), authorVisible: false });
  return getTicket(admin, ticketId);
}

export async function updateTicket(admin: AuthContext, ticketId: string, patch: AdminUpdateInput) {
  const ticket = await loadTicket(ticketId);
  const now = new Date();
  const log: string[] = [];
  let authorVisible = false;

  if (patch.category && patch.category !== ticket.category) {
    log.push(`Category ${ticket.category ?? 'unset'} → ${patch.category} (manual override of ${ticket.categorySource} value).`);
    ticket.category = patch.category;
    ticket.categorySource = 'admin';
  }
  if (patch.priority && patch.priority !== ticket.priority) {
    log.push(`Priority ${ticket.priority} → ${patch.priority} (manual override of ${ticket.prioritySource} value).`);
    ticket.priority = patch.priority;
    ticket.prioritySource = 'admin';
    ticket.priorityRank = PRIORITY_RANK[patch.priority];
    ticket.priorityReason = `Set manually by ${admin.name}.`;
  }
  if (patch.status && patch.status !== ticket.status) {
    log.push(`Status ${ticket.status} → ${patch.status}.`);
    applyStatus(ticket, patch.status, now);
    authorVisible = true;
  }
  if (!log.length) return getTicket(admin, ticketId); // nothing to change — idempotent

  ticket.slaDueAt = computeSlaDueAt(ticket);
  ticket.lastActivityAt = now;
  await ticket.save();
  for (const line of log) await logEvent(ticket._id, line, actor(admin));

  hub.publish({ type: 'ticket.updated', ticketId: String(ticket._id), ticketNumber: ticket.number, authorId: String(ticket.author), authorVisible });
  return getTicket(admin, ticketId);
}

export async function assignTicket(admin: AuthContext, ticketId: string, assignee: 'me' | 'unassigned') {
  const ticket = await loadTicket(ticketId);
  const target = assignee === 'me' ? admin.userId : null;
  if (String(ticket.assignedTo ?? '') === String(target ?? '')) return getTicket(admin, ticketId);

  ticket.assignedTo = target as any;
  ticket.lastActivityAt = new Date();
  await ticket.save();
  await logEvent(ticket._id, assignee === 'me' ? `Assigned to ${admin.name}.` : `Unassigned by ${admin.name}.`, actor(admin));
  hub.publish({ type: 'ticket.updated', ticketId: String(ticket._id), ticketNumber: ticket.number, authorId: String(ticket.author), authorVisible: false });
  return getTicket(admin, ticketId);
}

export async function draftForTicket(admin: AuthContext, ticketId: string, force: boolean) {
  const { draft, cached } = await getOrCreateDraft(ticketId, { force });
  return { ...presentDraft(draft, admin.name)!, cached };
}

export async function retriageTicket(admin: AuthContext, ticketId: string) {
  await loadTicket(ticketId); // 404 early
  await triageTicket(ticketId);
  return getTicket(admin, ticketId);
}

export async function getQueueStats(admin: AuthContext) {
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 86_400_000);

  const [statusRows, priorityRows, overdue, unassigned, mine, awaiting, firstResponse] = await Promise.all([
    Ticket.aggregate<{ _id: Status; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Ticket.aggregate<{ _id: string; n: number }>([{ $match: { isActive: true } }, { $group: { _id: '$priority', n: { $sum: 1 } } }]),
    Ticket.countDocuments({ isActive: true, slaDueAt: { $lt: now } }),
    Ticket.countDocuments({ isActive: true, assignedTo: null }),
    Ticket.countDocuments({ isActive: true, assignedTo: admin.userId }),
    Ticket.countDocuments({ isActive: true, awaitingResponseSince: { $ne: null } }),
    Ticket.aggregate<{ avgMs: number }>([
      { $match: { createdAt: { $gte: since }, firstResponseAt: { $ne: null } } },
      { $group: { _id: null, avgMs: { $avg: { $subtract: ['$firstResponseAt', '$createdAt'] } } } },
    ]),
  ]);

  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, statusRows.find((r) => r._id === s)?.n ?? 0])) as Record<Status, number>;
  const activeByPriority = Object.fromEntries(PRIORITIES.map((p) => [p, priorityRows.find((r) => r._id === p)?.n ?? 0]));
  return {
    total: Object.values(byStatus).reduce((a, b) => a + b, 0),
    active: ACTIVE_STATUSES.reduce((s, st) => s + byStatus[st], 0),
    byStatus,
    activeByPriority,
    overdue,
    unassigned,
    assignedToMe: mine,
    awaitingResponse: awaiting,
    avgFirstResponseHours: firstResponse[0] ? Math.round((firstResponse[0].avgMs / 3_600_000) * 10) / 10 : null,
  };
}
