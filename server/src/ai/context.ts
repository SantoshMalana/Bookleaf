/**
 * Context builders — the heart of the "cost-aware" requirement.
 *
 * Instead of "ticket history + whole knowledge base on every call", each task receives
 * the smallest context that can do the job:
 *
 *   triage : static rubric + subject/description (≤2000 chars) + a 1–2 line facts summary
 *   draft  : static voice rules + core policy + ONLY the matching category's policy and
 *            guidance + compact FACTS for that category + the last few public messages
 *
 * Numbers, dates and states are computed in code (domain/*) and passed in as FACTS, so
 * the model writes wording but never does arithmetic or date maths.
 */
import { LIMITS, PAYOUT_THRESHOLD_INR, PLATFORMS, PRODUCTION_STAGES, type Category } from '../config/constants.js';
import { CATEGORY_GUIDANCE, CATEGORY_POLICY, CORE_POLICY, TONE_GUIDE } from './knowledge.js';
import { DRAFT_SYSTEM, TRIAGE_SYSTEM } from './prompts.js';
import { formatINR, getPayoutInfo, nextPayoutDate } from '../domain/royalty.js';
import { getProductionInfo } from '../domain/production.js';
import { toISODate } from '../lib/clock.js';
import type { IAuthor, IBook } from '../models/index.js';

export interface ThreadMessage {
  senderRole: 'author' | 'admin';
  body: string;
  createdAt: Date;
}

export interface ContextInput {
  subject: string;
  description: string;
  author: Pick<IAuthor, 'name' | 'authorCode' | 'joinedDate'>;
  /** All of the author's books (needed for the account-level threshold and summaries). */
  books: IBook[];
  /** The book the ticket is about, or null for "General / Account Level". */
  ticketBook: IBook | null;
  thread: ThreadMessage[];
  now: Date;
}

export interface BuiltPrompt {
  system: string;
  user: string;
  meta: { approxTokens: number; sections: string[] };
}

/** ~4 characters per token is accurate enough for budgeting and tests. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max).trimEnd()}…` : s);
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const pendingTotal = (books: IBook[]) => books.reduce((s, b) => s + b.royaltyPending, 0);

/** Strip our own XML-ish delimiters from author text so it cannot "close" the data block. */
const sanitize = (s: string) => s.replace(/<\/?(ticket|author_message|context|facts)[^>]*>/gi, '');

function bookIdentity(b: IBook): string {
  const pub = toISODate(b.publicationDate);
  return `${b.title} (${b.bookCode}) — ${b.status}${pub ? `, published ${pub}` : ''}`;
}

// ───────────────────────────── triage ─────────────────────────────

export function buildTriageContext(input: ContextInput): BuiltPrompt {
  const total = pendingTotal(input.books);
  const lines: string[] = [];

  if (input.ticketBook) {
    const b = input.ticketBook;
    lines.push(`book: ${bookIdentity(b)}`);
    if (b.status === 'Published & Live') {
      const payout = getPayoutInfo(b, total, input.now);
      lines.push(`royalty: pending ${formatINR(b.royaltyPending)}, paid ${formatINR(b.royaltyPaid)}; payout state: ${payout.state}${payout.overdueSince ? ` (first payout was due ${payout.overdueSince})` : ''}`);
    }
  } else {
    const live = input.books.filter((b) => b.status === 'Published & Live');
    const overdue = live.filter((b) => getPayoutInfo(b, total, input.now).state === 'overdue').length;
    lines.push(`account-level ticket; ${input.books.length} books (${live.length} live); total pending royalty ${formatINR(total)}; overdue payouts: ${overdue}`);
  }

  const user = `<context>\n${lines.join('\n')}\n</context>\n<ticket>\n<subject>${sanitize(oneLine(input.subject))}</subject>\n<description>${sanitize(clip(input.description, LIMITS.aiTicketChars))}</description>\n</ticket>`;
  return { system: TRIAGE_SYSTEM, user, meta: { approxTokens: estimateTokens(TRIAGE_SYSTEM + user), sections: ['rubric', 'ticket', 'facts-summary'] } };
}

// ───────────────────────────── draft ─────────────────────────────

function royaltyBookLine(b: IBook, total: number, now: Date): string {
  const p = getPayoutInfo(b, total, now);
  return `${b.title} (${b.bookCode}): earned ${formatINR(b.totalRoyaltyEarned)}, paid ${formatINR(b.royaltyPaid)}, pending ${formatINR(b.royaltyPending)}; ${b.totalCopiesSold} copies × ${b.royaltyPerCopy != null ? formatINR(b.royaltyPerCopy) : 'n/a'}/copy, MRP ${b.mrp != null ? formatINR(b.mrp) : 'n/a'}; last payout ${toISODate(b.lastRoyaltyPayoutDate) ?? 'none'}; state ${p.state}`;
}

function factsFor(category: Category, input: ContextInput): string[] {
  const { ticketBook: b, books, now } = input;
  const total = pendingTotal(books);
  const out: string[] = [];

  out.push(`TODAY: ${toISODate(now)}`);
  out.push(`AUTHOR: ${input.author.name} (${input.author.authorCode}); first name: ${firstName(input.author.name)}`);
  out.push(b ? `TICKET_BOOK: ${bookIdentity(b)}` : 'TICKET_BOOK: none — general / account-level query');

  switch (category) {
    case 'Royalty & Payments': {
      const scope = b ? [b] : books.filter((x) => x.status === 'Published & Live');
      for (const x of scope) out.push(`ROYALTY: ${royaltyBookLine(x, total, now)}`);
      if (b) {
        const p = getPayoutInfo(b, total, now);
        out.push(`PAYOUT_STATE: ${p.summary}`);
        if (p.nextPayoutDate) out.push(`NEXT_PAYOUT_DATE: ${p.nextPayoutDate} (regular quarterly cycle)`);
      } else if (total > 0) {
        out.push(`NEXT_PAYOUT_DATE: ${toISODate(nextPayoutDate(now))} (regular quarterly cycle)`);
      }
      out.push(`ACCOUNT_TOTAL_PENDING: ${formatINR(total)} (minimum payout ${formatINR(PAYOUT_THRESHOLD_INR)})`);
      out.push('NOT_IN_SYSTEM: bank-account link status; per-platform sales; per-copy printing/commission/shipping costs');
      break;
    }
    case 'ISBN & Metadata Issues': {
      if (b) out.push(`ISBN_ON_RECORD: ${b.isbn} (registered under BookLeaf's imprint); listed on: ${b.availableOn.join(', ') || 'no platforms yet'}`);
      out.push("NOT_IN_SYSTEM: the ISBN/metadata the author sees on the external listing or physical copy");
      break;
    }
    case 'Printing & Quality': {
      if (b) out.push(`PRINT: partner ${b.printPartner ?? 'not assigned yet'}; status ${b.status}`);
      out.push('NOT_IN_SYSTEM: photos of the defective copies; which print batch/order the copies came from');
      break;
    }
    case 'Distribution & Availability': {
      if (b) {
        const missing = PLATFORMS.filter((p) => !b.availableOn.includes(p));
        out.push(`LISTED_ON: ${b.availableOn.join(', ') || 'none'}`);
        out.push(`NOT_LISTED_ON: ${missing.join(', ') || 'none'}`);
      }
      out.push('NOT_IN_SYSTEM: live stock-sync state per platform');
      break;
    }
    case 'Book Status & Production Updates': {
      if (b) {
        const prod = getProductionInfo(b.status);
        out.push(`PRODUCTION: stage "${prod.stage}"${prod.stageIndex >= 0 ? ` (${prod.stageIndex + 1} of ${PRODUCTION_STAGES.length})` : ''}${prod.isLive ? ' — already live' : ''}`);
        if (!prod.isLive) {
          out.push(`REMAINING_STAGES: ${prod.stages.filter((s) => s.state === 'upcoming').map((s) => s.name).join(' → ') || 'none'}`);
          if (prod.commonDelayStage) out.push(`NOTE: delays commonly occur at ${prod.stage} (author approval / revision rounds)`);
        }
      }
      out.push('NOT_IN_SYSTEM: date the current stage started; whether we are waiting on author approval or a revision round');
      break;
    }
    case 'General Inquiry': {
      if (!b && books.length) out.push(`BOOKS: ${books.map((x) => `${x.title} — ${x.status}`).join('; ')}`);
      break;
    }
  }
  return out;
}

export function buildDraftContext(input: ContextInput & { category: Category }): BuiltPrompt {
  const { category } = input;
  const system = [
    DRAFT_SYSTEM,
    '',
    'POLICY',
    CORE_POLICY,
    CATEGORY_POLICY[category],
    TONE_GUIDE,
    CATEGORY_GUIDANCE[category],
  ].join('\n');

  const thread = input.thread
    .slice(-LIMITS.aiThreadMessages)
    .map((m) => `[${m.senderRole === 'admin' ? 'BookLeaf team' : 'Author'}] ${sanitize(clip(oneLine(m.body), LIMITS.aiMessageChars))}`);

  const user = [
    '<facts>',
    ...factsFor(category, input),
    '</facts>',
    thread.length ? `\nTHREAD (latest ${thread.length}, oldest first — reply to the newest author message):\n${thread.join('\n')}` : '',
    `\nORIGINAL TICKET`,
    `<author_message>`,
    `Subject: ${sanitize(oneLine(input.subject))}`,
    sanitize(clip(input.description, LIMITS.aiTicketChars)),
    `</author_message>`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    system,
    user,
    meta: {
      approxTokens: estimateTokens(system + user),
      sections: ['voice-rules', 'core-policy', `policy:${category}`, 'tone', `guidance:${category}`, 'facts', thread.length ? `thread(${thread.length})` : 'no-thread'],
    },
  };
}
