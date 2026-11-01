/**
 * Deterministic reply templates — the "AI is down" safety net.
 *
 * When the LLM cannot be reached, admins still get a sensible, policy-accurate starting
 * point built from the same computed facts the LLM would have received. They are less
 * tailored than an AI draft and are labelled "template" in the UI.
 */
import type { Category } from '../config/constants.js';
import { PAYOUT_THRESHOLD_INR } from '../config/constants.js';
import { formatINR, getPayoutInfo, nextPayoutDate } from '../domain/royalty.js';
import { getProductionInfo } from '../domain/production.js';
import { toISODate } from '../lib/clock.js';
import type { ContextInput } from './context.js';

export interface TemplateDraft {
  reply: string;
  verify: string[];
  needsEscalation: boolean;
  escalationTeam: 'none' | 'production' | 'distribution' | 'finance' | 'printing';
}

const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export function templateDraft(category: Category, input: ContextInput): TemplateDraft {
  const hi = `Hi ${first(input.author.name)},\n\n`;
  const b = input.ticketBook;
  const title = b ? `"${b.title}"` : 'your book';
  const pendingTotal = input.books.reduce((s, x) => s + x.royaltyPending, 0);
  const t = (reply: string, extra: Partial<TemplateDraft> = {}): TemplateDraft => ({
    reply: hi + reply,
    verify: ['Template reply (AI unavailable) — personalise before sending.'],
    needsEscalation: false,
    escalationTeam: 'none',
    ...extra,
  });

  switch (category) {
    case 'Royalty & Payments': {
      const p = b ? getPayoutInfo(b, pendingTotal, input.now) : null;
      const next = toISODate(nextPayoutDate(input.now));
      const bank = 'Please also confirm that the bank account linked in your dashboard is correct.';
      if (b && p?.state === 'overdue') {
        return t(
          `I'm sorry about the wait on your royalty for ${title}. Our records show ${formatINR(b.royaltyPending)} pending and no payout made so far, and your first payout was due by ${p.overdueSince}. This is on us. We are escalating it to our finance team now and will confirm your payment date within 48 hours.\n\n${bank}\n\nNext step: we will write back within 48 hours with a confirmed payout date.`,
          { needsEscalation: true, escalationTeam: 'finance', verify: ['Template reply (AI unavailable) — personalise before sending.', 'Confirm whether the author has bank details linked.'] },
        );
      }
      if (b && p?.state === 'below_threshold') {
        return t(
          `Thank you for checking on ${title}. Your account currently has ${formatINR(pendingTotal)} in pending royalties. Our minimum payout is ${formatINR(PAYOUT_THRESHOLD_INR)}, so this balance rolls over to the next quarter (${formatINR(p.shortfallToThreshold ?? 0)} more is needed to reach the threshold). Royalties are calculated quarterly and paid within 45 days of the quarter ending; the next payout date is ${p.nextPayoutDate}.\n\nNext step: if you would like a line-by-line breakdown of how this was calculated, reply here and we will send it.`,
        );
      }
      if (b && p?.state === 'scheduled') {
        return t(
          `Thank you for your question about ${title}. You have earned ${formatINR(b.totalRoyaltyEarned)}, of which ${formatINR(b.royaltyPaid)} has been paid and ${formatINR(b.royaltyPending)} is pending. Pending royalties are included in the next quarterly payout, due by ${p.nextPayoutDate} (within 45 days of quarter end).\n\nRoyalty is 80% of net profit, where net profit is MRP minus printing cost, platform commission and shipping. Next step: reply here if you would like a detailed line-by-line breakdown and we will share it.`,
        );
      }
      return t(
        `Thank you for reaching out about your royalties. Royalties are calculated quarterly and paid within 45 days of the quarter ending, with a ${formatINR(PAYOUT_THRESHOLD_INR)} minimum payout; your next regular payout date is ${next}. Your account currently shows ${formatINR(pendingTotal)} pending.\n\nNext step: we are happy to share a line-by-line royalty breakdown — just reply here and tell us which book you would like it for.`,
      );
    }
    case 'ISBN & Metadata Issues':
      return t(
        `Thank you for flagging this. A mismatch or error in ISBN details is a serious data issue and we treat it as high priority. We are escalating it to our production team right now and will resolve it within 48 hours.${b ? ` The ISBN on our records for ${title} is ${b.isbn}.` : ''}\n\nNext step: please send us a screenshot of the listing and a photo of the copyright page of your copy so the team can compare them.`,
        { needsEscalation: true, escalationTeam: 'production', verify: ['Template reply (AI unavailable) — personalise before sending.', 'Confirm the ISBN the author sees on the listing vs our records.'] },
      );
    case 'Printing & Quality':
      return t(
        `I'm truly sorry your copies of ${title} did not meet the quality you deserve. We will arrange a free reprint once we have verified the issue. Could you please share clear photos of the defective copies (the affected pages and the binding)?\n\nOnce verified, a reprint takes 5–7 business days. Next step: reply with the photos and we will start the verification straight away.`,
        { needsEscalation: true, escalationTeam: 'printing' },
      );
    case 'Distribution & Availability':
      return t(
        `Thank you for letting us know that ${title} is showing as unavailable. This is usually a stock-sync issue between our system and the platform. We are triggering a re-sync with our distribution team now, and it typically takes 24–48 hours for the listing to go live again.\n\nNext step: if it still shows as unavailable after 48 hours, reply here with the platform and a screenshot and we will escalate it immediately.`,
        { needsEscalation: true, escalationTeam: 'distribution' },
      );
    case 'Book Status & Production Updates': {
      const stage = b ? getProductionInfo(b.status).stage : null;
      return t(
        `Thank you for checking in on ${title}${stage ? `, which is currently at the ${stage} stage` : ''}. We know waiting is hard, and we want you to have a clear picture. We are checking with the team on exactly where things stand and will send you a specific updated timeline within 48 hours.\n\nNext step: watch for our update — and if anything is waiting on your approval, we will point it out so we can move together.`,
        { needsEscalation: true, escalationTeam: 'production', verify: ['Template reply (AI unavailable) — personalise before sending.', 'Check whether the delay is awaiting author approval or a revision round.'] },
      );
    }
    default:
      return t(
        `Thank you for your question. Updates to a book's metadata, such as its description on Amazon, can be submitted through your dashboard or by emailing our team, and changes typically reflect on the platforms within 3–5 business days.\n\nNext step: send us the details of what you would like changed and we will take it from there.`,
      );
  }
}
