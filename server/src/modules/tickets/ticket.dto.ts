import type { Category, Priority, Source, Status } from '../../config/constants.js';
import type { IAttachment, IDraft, IMessage, ITicket, ITriage } from '../../models/index.js';
import { presentDraft } from '../../ai/draft.service.js';

/** A ticket with author / book / assignee populated (lean). */
export type PopulatedTicket = Omit<ITicket, 'author' | 'book' | 'assignedTo'> & {
  author: { _id: unknown; name: string; authorCode: string; email: string };
  book: { _id: unknown; title: string; bookCode: string; status: string } | null;
  assignedTo: { _id: unknown; name: string } | null;
};

export const ticketRef = (n: number): string => `BL-${n}`;

export interface MessageDto {
  id: string;
  kind: 'public' | 'internal' | 'event';
  senderRole: 'author' | 'admin' | 'system';
  senderName: string;
  body: string;
  createdAt: Date;
  aiAssist?: { fromDraft: boolean; edited: boolean } | null;
}

const toMessage = (m: IMessage, includeAdminFields: boolean): MessageDto => ({
  id: String(m._id),
  kind: m.kind,
  senderRole: m.senderRole,
  senderName: m.senderName,
  body: m.body,
  createdAt: m.createdAt,
  ...(includeAdminFields ? { aiAssist: m.aiAssist } : {}),
});

// ───────────── author-facing (no AI fields, no internal notes, no priority) ─────────────

export interface AuthorTicketDto {
  id: string;
  ticketId: string;
  number: number;
  subject: string;
  description: string;
  status: Status;
  book: { id: string; title: string; bookCode: string } | null;
  attachments: IAttachment[];
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date;
  /** Admin replies on the ticket (used for the "reply received" badge in lists). */
  replyCount: number;
  messages?: MessageDto[];
}

export function toAuthorTicket(t: PopulatedTicket, messages?: IMessage[], replyCount = 0): AuthorTicketDto {
  return {
    id: String(t._id),
    ticketId: ticketRef(t.number),
    number: t.number,
    subject: t.subject,
    description: t.description,
    status: t.status,
    book: t.book ? { id: String(t.book._id), title: t.book.title, bookCode: t.book.bookCode } : null,
    attachments: t.attachments,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    lastActivityAt: t.lastActivityAt,
    replyCount,
    // Defence in depth: even if a caller passed internal rows, only public ones are serialized.
    ...(messages ? { messages: messages.filter((m) => m.kind === 'public').map((m) => toMessage(m, false)) } : {}),
  };
}

// ───────────── admin-facing ─────────────

export interface AdminTicketDto {
  id: string;
  ticketId: string;
  number: number;
  subject: string;
  description: string;
  status: Status;
  category: Category | null;
  categorySource: Source;
  priority: Priority;
  prioritySource: Source;
  priorityReason: string | null;
  triage: ITriage;
  author: { id: string; name: string; authorCode: string; email: string };
  book: { id: string; title: string; bookCode: string; status: string } | null;
  assignedTo: { id: string; name: string } | null;
  attachments: IAttachment[];
  isActive: boolean;
  awaitingResponseSince: Date | null;
  slaDueAt: Date | null;
  isOverdue: boolean;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  lastActivityAt: Date;
  messages?: MessageDto[];
  draft?: ReturnType<typeof presentDraft>;
}

export function toAdminTicket(
  t: PopulatedTicket,
  opts: { now?: Date; messages?: IMessage[]; adminName?: string; includeDraft?: boolean } = {},
): AdminTicketDto {
  const now = opts.now ?? new Date();
  return {
    id: String(t._id),
    ticketId: ticketRef(t.number),
    number: t.number,
    subject: t.subject,
    description: t.description,
    status: t.status,
    category: t.category,
    categorySource: t.categorySource,
    priority: t.priority,
    prioritySource: t.prioritySource,
    priorityReason: t.priorityReason,
    triage: t.triage,
    author: { id: String(t.author._id), name: t.author.name, authorCode: t.author.authorCode, email: t.author.email },
    book: t.book ? { id: String(t.book._id), title: t.book.title, bookCode: t.book.bookCode, status: t.book.status } : null,
    assignedTo: t.assignedTo ? { id: String(t.assignedTo._id), name: t.assignedTo.name } : null,
    attachments: t.attachments,
    isActive: t.isActive,
    awaitingResponseSince: t.awaitingResponseSince,
    slaDueAt: t.slaDueAt,
    isOverdue: Boolean(t.isActive && t.slaDueAt && t.slaDueAt < now),
    firstResponseAt: t.firstResponseAt,
    resolvedAt: t.resolvedAt,
    createdAt: t.createdAt,
    lastActivityAt: t.lastActivityAt,
    ...(opts.messages ? { messages: opts.messages.map((m) => toMessage(m, true)) } : {}),
    ...(opts.includeDraft ? { draft: presentDraft((t.draft as IDraft | null) ?? null, opts.adminName ?? 'BookLeaf Support') } : {}),
  };
}
