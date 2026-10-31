import { z } from 'zod';
import { CATEGORIES, LIMITS, PRIORITIES, STATUSES } from '../../config/constants.js';
import { objectIdSchema } from '../../lib/object-id.js';

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export const createTicketSchema = z.object({
  /** Omit or null for "General / Account Level". */
  bookId: objectIdSchema.nullish(),
  subject: z.string().trim().min(3, 'Subject must be at least 3 characters').max(LIMITS.subjectMax),
  description: z.string().trim().min(LIMITS.descriptionMin, `Please describe the issue in at least ${LIMITS.descriptionMin} characters`).max(LIMITS.descriptionMax),
  /** UI-only in this version: only file metadata is recorded, not the file itself. */
  attachments: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        size: z.number().int().min(0).max(MAX_ATTACHMENT_BYTES),
        type: z.string().max(100).default(''),
      }),
    )
    .max(5)
    .default([]),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const messageSchema = z.object({ body: z.string().trim().min(1, 'Message cannot be empty').max(LIMITS.messageMax) });

export const feedbackSchema = z.object({
  helpful: z.boolean({ required_error: 'Please say whether the answer was helpful' }),
  comment: z.string().trim().max(500, 'Please keep your comment under 500 characters').optional(),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;

/** "Open,In Progress" → ['Open','In Progress'] */
const csvEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)).min(1));

const dateParam = z.coerce.date();

export const listTicketsQuerySchema = z.object({
  status: csvEnum(STATUSES).optional(),
  category: csvEnum(CATEGORIES).optional(),
  priority: csvEnum(PRIORITIES).optional(),
  from: dateParam.optional(),
  to: dateParam.optional(),
  /** me | unassigned | <admin user id> */
  assignee: z.union([z.enum(['me', 'unassigned']), objectIdSchema]).optional(),
  overdue: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['urgency', 'newest', 'oldest', 'activity']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;

export const ticketIdParams = z.object({ ticketId: objectIdSchema });

// ---- admin ----

export const adminUpdateSchema = z
  .object({
    status: z.enum(STATUSES).optional(),
    category: z.enum(CATEGORIES).optional(),
    priority: z.enum(PRIORITIES).optional(),
  })
  .refine((v) => v.status || v.category || v.priority, { message: 'Provide at least one of status, category or priority' });
export type AdminUpdateInput = z.infer<typeof adminUpdateSchema>;

export const adminReplySchema = z.object({
  body: z.string().trim().min(1, 'Reply cannot be empty').max(LIMITS.messageMax),
  /** Optionally move the ticket along in the same action ("Send & resolve"). */
  status: z.enum(['In Progress', 'Resolved']).optional(),
  /** The editor was pre-filled from the AI/template draft (lets us measure draft acceptance). */
  usedDraft: z.boolean().default(false),
});
export type AdminReplyInput = z.infer<typeof adminReplySchema>;

export const noteSchema = z.object({ body: z.string().trim().min(1, 'Note cannot be empty').max(LIMITS.noteMax) });

export const assignmentSchema = z.object({ assignee: z.enum(['me', 'unassigned']) });

export const draftRequestSchema = z.object({ force: z.boolean().default(false) });
