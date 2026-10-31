/**
 * Ticket triage = category + priority.
 *
 * Flow (never blocks ticket creation — the ticket is already saved when this runs):
 *   1. build a small context (rubric + ticket + facts summary)
 *   2. ONE LLM call returning {category, priority, confidence, rationale}
 *   3. apply deterministic priority floors (legal threats, ISBN errors, overdue royalty…)
 *   4. if the LLM path fails for any reason → rule-based fallback classifier, flagged as such
 *   5. persist without clobbering anything an admin has already overridden
 */
import { logger } from '../lib/logger.js';
import { PRIORITY_RANK } from '../config/constants.js';
import { getPayoutInfo } from '../domain/royalty.js';
import { applyPriorityPolicy } from '../domain/priority-policy.js';
import { computeSlaDueAt } from '../domain/sla.js';
import { hub } from '../realtime/hub.js';
import { logEvent } from '../modules/tickets/activity.js';
import { Message, Ticket } from '../models/index.js';
import { runStructured } from './ai-client.js';
import { loadTicketContext } from './context-loader.js';
import { buildTriageContext } from './context.js';
import { fallbackClassify } from './fallback-classifier.js';
import { AiUnavailableError } from './providers/index.js';
import { triageOutputSchema, triageTool } from './schemas.js';

/** Fire-and-forget; errors are logged, never thrown into the request that created the ticket. */
export function scheduleTriage(ticketId: string): void {
  setImmediate(() => {
    triageTicket(ticketId).catch((err) => logger.error({ err, ticketId }, 'triage crashed'));
  });
}

export async function triageTicket(ticketId: string): Promise<void> {
  const ticket = await Ticket.findById(ticketId).lean();
  if (!ticket) return;
  const ctx = await loadTicketContext(ticket);
  if (!ctx) return;

  const pendingTotal = ctx.books.reduce((s, b) => s + b.royaltyPending, 0);
  const royaltyOverdue = (ctx.ticketBook ? [ctx.ticketBook] : ctx.books).some(
    (b) => getPayoutInfo(b, pendingTotal, ctx.now).state === 'overdue',
  );

  let category;
  let aiPriority;
  let source: 'ai' | 'fallback' = 'ai';
  let model: string | null = null;
  let confidence: number | null = null;
  let rationale: string;
  let failure: string | null = null;

  try {
    const built = buildTriageContext({ subject: ticket.subject, description: ticket.description, ...ctx });
    const r = await runStructured({
      kind: 'triage',
      ticketId,
      request: { system: built.system, user: built.user, tool: triageTool, maxTokens: 200, temperature: 0 },
      schema: triageOutputSchema,
    });
    category = r.data.category;
    aiPriority = r.data.priority;
    confidence = r.data.confidence;
    rationale = r.data.rationale;
    model = r.model;
  } catch (err) {
    failure = err instanceof AiUnavailableError ? err.reason : 'unexpected_error';
    if (!(err instanceof AiUnavailableError)) logger.error({ err, ticketId }, 'unexpected triage error');
    const fb = fallbackClassify(ticket.subject, ticket.description);
    source = 'fallback';
    category = fb.category;
    aiPriority = fb.priority;
    rationale = fb.rationale;
  }

  // Floors look at everything the author has said so far. Read *after* the model call (which can take seconds), so a
  // follow-up that arrived while the model was thinking is not lost.
  const followUps = await Message.find({ ticket: ticket._id, kind: 'public', senderRole: 'author' }).select('body').lean();
  const text = [ticket.subject, ticket.description, ...followUps.map((m) => m.body)].join('\n');
  const policy = applyPriorityPolicy({ category, aiPriority, text, royaltyOverdue });
  const priorityReason = [rationale, ...policy.floors.map((f) => `Policy: ${f}`)].join(' ');

  // Re-read right before writing so an admin override made while the model was thinking wins.
  const fresh = await Ticket.findById(ticketId);
  if (!fresh) return;
  if (fresh.categorySource !== 'admin') {
    fresh.category = category;
    fresh.categorySource = source;
  }
  if (fresh.prioritySource !== 'admin') {
    fresh.priority = policy.priority;
    fresh.prioritySource = source;
    fresh.priorityRank = PRIORITY_RANK[policy.priority];
    fresh.priorityReason = priorityReason;
    fresh.slaDueAt = computeSlaDueAt(fresh);
  }
  fresh.triage = { status: source === 'ai' ? 'done' : 'fallback', model, confidence, rationale, error: failure, at: new Date() };
  await fresh.save();

  await logEvent(
    fresh._id,
    source === 'ai'
      ? `AI triage: ${category} · ${policy.priority}${confidence != null ? ` (confidence ${Math.round(confidence * 100)}%)` : ''}. ${rationale}${policy.floors.length ? ` Priority raised by policy: ${policy.floors.join('; ')}.` : ''}`
      : `AI unavailable (${failure}) — rule-based triage applied: ${category} · ${policy.priority}. Please review.${policy.floors.length ? ` Policy: ${policy.floors.join('; ')}.` : ''}`,
  );
  hub.publish({ type: 'ticket.triaged', ticketId, ticketNumber: fresh.number, authorId: String(fresh.author), authorVisible: false });
}

/**
 * Crash/restart recovery: triage runs in-process, so a restart mid-flight could leave a ticket
 * "pending". This sweeps them up. (A durable queue such as BullMQ would replace this in production.)
 */
export async function recoverPendingTriage(olderThanMs = 20_000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const stuck = await Ticket.find({ 'triage.status': 'pending', createdAt: { $lt: cutoff } })
    .sort({ createdAt: 1 })
    .limit(25)
    .select('_id')
    .lean();
  for (const t of stuck) await triageTicket(String(t._id));
  return stuck.length;
}
