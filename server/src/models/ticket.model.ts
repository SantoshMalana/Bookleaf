import { Schema, model, type Types } from 'mongoose';
import {
  CATEGORIES,
  PRIORITIES,
  SOURCES,
  STATUSES,
  TRIAGE_STATUSES,
  type Category,
  type Priority,
  type Source,
  type Status,
  type TriageStatus,
} from '../config/constants.js';

export interface IAttachment {
  name: string;
  size: number;
  type: string;
}

export interface ITriage {
  status: TriageStatus;
  model: string | null;
  confidence: number | null;
  rationale: string | null;
  /** Why the AI path was skipped (rate limit, timeout, not configured…). */
  error: string | null;
  at: Date | null;
}

export interface IDraft {
  body: string;
  source: 'ai' | 'template';
  verifyBeforeSending: string[];
  needsEscalation: boolean;
  escalationTeam: string;
  model: string | null;
  /** Hash of the inputs the draft was built from; a mismatch means the draft is stale. */
  basis: string;
  generatedAt: Date;
}

export interface IFeedback {
  helpful: boolean;
  comment: string | null;
  at: Date;
}

export interface ITicket {
  _id: Types.ObjectId;
  /** Sequential number, rendered to humans as BL-<number>. */
  number: number;
  author: Types.ObjectId;
  book: Types.ObjectId | null;
  subject: string;
  description: string;
  attachments: IAttachment[];
  status: Status;
  category: Category | null;
  categorySource: Source;
  priority: Priority;
  prioritySource: Source;
  /** Numeric copy of priority so the queue can be sorted by urgency in the database. */
  priorityRank: number;
  priorityReason: string | null;
  triage: ITriage;
  draft: IDraft | null;
  /** The author's "was this helpful?" rating, only possible once resolved; cleared if the ticket is reopened. */
  feedback: IFeedback | null;
  assignedTo: Types.ObjectId | null;
  /** true while Open / In Progress. Stored so the queue sort is a plain index scan. */
  isActive: boolean;
  /** Set when the ball is in BookLeaf's court (new ticket or author follow-up); cleared on admin reply. */
  awaitingResponseSince: Date | null;
  /** awaitingResponseSince + SLA(priority). Past this and the ticket is "overdue". */
  slaDueAt: Date | null;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const attachmentSchema = new Schema<IAttachment>({ name: String, size: Number, type: String }, { _id: false });

const triageSchema = new Schema<ITriage>(
  {
    status: { type: String, enum: TRIAGE_STATUSES, default: 'pending' },
    model: { type: String, default: null },
    confidence: { type: Number, default: null },
    rationale: { type: String, default: null },
    error: { type: String, default: null },
    at: { type: Date, default: null },
  },
  { _id: false },
);

const draftSchema = new Schema<IDraft>(
  {
    body: { type: String, required: true },
    source: { type: String, enum: ['ai', 'template'], required: true },
    verifyBeforeSending: { type: [String], default: [] },
    needsEscalation: { type: Boolean, default: false },
    escalationTeam: { type: String, default: 'none' },
    model: { type: String, default: null },
    basis: { type: String, required: true },
    generatedAt: { type: Date, required: true },
  },
  { _id: false },
);

const feedbackSchema = new Schema<IFeedback>(
  { helpful: { type: Boolean, required: true }, comment: { type: String, default: null }, at: { type: Date, required: true } },
  { _id: false },
);

const ticketSchema = new Schema<ITicket>(
  {
    number: { type: Number, required: true, unique: true },
    author: { type: Schema.Types.ObjectId, ref: 'Author', required: true },
    book: { type: Schema.Types.ObjectId, ref: 'Book', default: null },
    subject: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    attachments: { type: [attachmentSchema], default: [] },
    status: { type: String, enum: STATUSES, default: 'Open' },
    category: { type: String, enum: [...CATEGORIES, null], default: null },
    categorySource: { type: String, enum: SOURCES, default: 'pending' },
    priority: { type: String, enum: PRIORITIES, default: 'Medium' },
    prioritySource: { type: String, enum: SOURCES, default: 'pending' },
    priorityRank: { type: Number, default: 2 },
    priorityReason: { type: String, default: null },
    triage: { type: triageSchema, default: () => ({ status: 'pending' }) },
    draft: { type: draftSchema, default: null },
    feedback: { type: feedbackSchema, default: null },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    isActive: { type: Boolean, default: true },
    awaitingResponseSince: { type: Date, default: null },
    slaDueAt: { type: Date, default: null },
    firstResponseAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    lastActivityAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

// Author "My Tickets" list.
ticketSchema.index({ author: 1, lastActivityAt: -1 });
// Admin queue default sort: active first, then most urgent, then oldest.
ticketSchema.index({ isActive: -1, priorityRank: -1, createdAt: 1 });
ticketSchema.index({ status: 1, category: 1 });
ticketSchema.index({ slaDueAt: 1 });
ticketSchema.index({ assignedTo: 1, isActive: 1 });
// Startup recovery of tickets whose async triage never finished.
ticketSchema.index({ 'triage.status': 1, createdAt: 1 });

export const Ticket = model<ITicket>('Ticket', ticketSchema);
