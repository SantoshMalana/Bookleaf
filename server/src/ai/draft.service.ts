/**
 * AI-drafted replies.
 *
 * Cost discipline:
 *   - generated lazily (only when an admin opens a ticket), never on ticket creation
 *   - cached on the ticket with a "basis" hash; reused until category, book or the latest
 *     public message changes
 *   - concurrent opens of the same ticket share one in-flight LLM call
 *   - explicit "regenerate" is rate-limited per ticket
 *
 * Failure discipline: if the model is unreachable or returns junk, the admin gets a
 * deterministic template (labelled as such) instead of an error.
 */
import { createHash } from 'node:crypto';
import { Errors } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { Message, Ticket, type IDraft, type ITicket } from '../models/index.js';
import { runStructured } from './ai-client.js';
import { loadTicketContext } from './context-loader.js';
import { buildDraftContext } from './context.js';
import { checkGrounding } from './grounding.js';
import { AiUnavailableError } from './providers/index.js';
import { draftOutputSchema, draftTool } from './schemas.js';
import { templateDraft } from './templates.js';

export const normaliseSpacing = (text: string): string =>
  text.replace(/[\u00A0\u2007\u2009\u200A\u202F]/g, ' ').replace(/[\u2010\u2011]/g, '-').replace(/[\u200B\u2060\uFEFF]/g, '');

const inflight = new Map<string, Promise<IDraft>>();
const lastRegenerate = new Map<string, number>();
const REGENERATE_COOLDOWN_MS = 8000;

export const draftBasis = (category: string | null, bookId: unknown, lastPublicMessageId: unknown): string =>
  createHash('sha1').update(`${category ?? ''}|${bookId ?? ''}|${lastPublicMessageId ?? ''}`).digest('hex').slice(0, 16);

export const signature = (adminName: string): string => `\n\nWarm regards,\n${adminName}\nBookLeaf Publishing — Author Support`;

/** What the admin sees: the cached body plus *their* signature. */
export function presentDraft(draft: IDraft | null, adminName: string) {
  if (!draft) return null;
  return {
    body: draft.body + signature(adminName),
    source: draft.source,
    verifyBeforeSending: draft.verifyBeforeSending,
    needsEscalation: draft.needsEscalation,
    escalationTeam: draft.escalationTeam,
    model: draft.model,
    generatedAt: draft.generatedAt,
  };
}

async function currentBasis(ticket: Pick<ITicket, '_id' | 'category' | 'book'>): Promise<string> {
  const last = await Message.findOne({ ticket: ticket._id, kind: 'public' }).sort({ createdAt: -1 }).select('_id').lean();
  return draftBasis(ticket.category, ticket.book, last?._id);
}

async function generate(ticketId: string, basis: string): Promise<IDraft> {
  const ticket = await Ticket.findById(ticketId).lean();
  if (!ticket) throw Errors.notFound('Ticket');
  const ctx = await loadTicketContext(ticket);
  if (!ctx) throw Errors.notFound('Author');
  const category = ticket.category ?? 'General Inquiry';
  const input = { subject: ticket.subject, description: ticket.description, ...ctx };

  let draft: IDraft;
  try {
    const built = buildDraftContext({ ...input, category });
    logger.debug({ ticketId, tokens: built.meta.approxTokens, sections: built.meta.sections }, 'draft prompt built');
    const r = await runStructured({
      kind: 'draft',
      ticketId,
      request: { system: built.system, user: built.user, tool: draftTool, maxTokens: 700, temperature: 0.3 },
      schema: draftOutputSchema,
    });
    // gpt-oss likes typographic spaces (U+202F in "48 hours", U+00A0, non-breaking hyphens). They render as cramped or
    // odd gaps in the editor and in authors' mail clients, so normalise to plain ASCII spacing before anyone sees it.
    const reply = normaliseSpacing(r.data.reply);
    // Deterministic fact-check of what the model wrote against what it was given; surfaced to the reviewer.
    const { warnings } = checkGrounding(reply, built.meta.groundingSource ?? '');
    if (warnings.length) logger.warn({ ticketId, warnings }, 'draft failed grounding check');
    draft = {
      body: reply,
      source: 'ai',
      verifyBeforeSending: [...warnings.map((w) => `Auto-check: ${w}`), ...r.data.verify_before_sending],
      needsEscalation: r.data.needs_escalation,
      escalationTeam: r.data.escalation_team,
      model: r.model,
      basis,
      generatedAt: new Date(),
    };
  } catch (err) {
    const reason = err instanceof AiUnavailableError ? err.reason : 'unexpected_error';
    if (!(err instanceof AiUnavailableError)) logger.error({ err, ticketId }, 'unexpected draft error');
    const t = templateDraft(category, input);
    draft = {
      body: t.reply,
      source: 'template',
      verifyBeforeSending: [`AI draft unavailable (${reason}) — showing a policy template. Personalise before sending.`, ...t.verify.slice(1)],
      needsEscalation: t.needsEscalation,
      escalationTeam: t.escalationTeam,
      model: null,
      basis,
      generatedAt: new Date(),
    };
  }

  await Ticket.updateOne({ _id: ticketId }, { $set: { draft } });
  return draft;
}

export async function getOrCreateDraft(ticketId: string, opts: { force?: boolean } = {}): Promise<{ draft: IDraft; cached: boolean }> {
  const ticket = await Ticket.findById(ticketId).lean();
  if (!ticket) throw Errors.notFound('Ticket');

  const basis = await currentBasis(ticket);
  if (ticket.draft && ticket.draft.basis === basis && !opts.force) return { draft: ticket.draft, cached: true };

  if (opts.force) {
    const last = lastRegenerate.get(ticketId) ?? 0;
    if (Date.now() - last < REGENERATE_COOLDOWN_MS) throw Errors.tooMany('Draft was just regenerated — please wait a few seconds.');
    lastRegenerate.set(ticketId, Date.now());
  }

  const key = `${ticketId}:${basis}`;
  let pending = inflight.get(key);
  if (!pending) {
    pending = generate(ticketId, basis).finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return { draft: await pending, cached: false };
}

/** Lets tests reset module-level state. */
export function __resetDraftState(): void {
  inflight.clear();
  lastRegenerate.clear();
}
