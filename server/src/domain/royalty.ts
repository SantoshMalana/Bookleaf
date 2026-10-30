/**
 * Royalty & payout rules from the BookLeaf Knowledge Base, as pure functions.
 *
 *  - Royalties are calculated quarterly and paid within 45 days of quarter end.
 *  - Minimum payout is ₹1,000; below that the balance rolls over to the next quarter.
 *
 * The AI never does this arithmetic: it receives the *result* (state + dates) as facts and
 * only writes the wording. That is what stops a model inventing a payout date.
 *
 * Assumptions (also listed in the README):
 *  - Quarter ends are 31 Mar / 30 Jun / 30 Sep / 31 Dec (identical for calendar and Indian FY quarters).
 *  - The ₹1,000 threshold applies to the author's accumulated pending royalty across all books.
 *  - A book that has never been paid becomes "overdue" once the first payout window after its
 *    publication quarter has passed and the author clears the threshold.
 */
import { LIVE_STATUS, PAYOUT_THRESHOLD_INR, PAYOUT_WINDOW_DAYS } from '../config/constants.js';
import { MS_PER_DAY, toISODate } from '../lib/clock.js';

export type PayoutState = 'not_applicable' | 'settled' | 'below_threshold' | 'overdue' | 'scheduled';

export interface PayoutInfo {
  state: PayoutState;
  /** Next regular payout date (YYYY-MM-DD) when money is owed, else null. */
  nextPayoutDate: string | null;
  /** For overdue: the date the first payout should have landed by. */
  overdueSince: string | null;
  daysOverdue: number | null;
  /** For below_threshold: how much more is needed to reach the minimum payout. */
  shortfallToThreshold: number | null;
  /** One-line, human/LLM-readable description. */
  summary: string;
}

export interface RoyaltyBookInput {
  status: string;
  publicationDate: Date | null;
  totalCopiesSold: number;
  royaltyPending: number;
  lastRoyaltyPayoutDate: Date | null;
}

export const formatINR = (n: number): string => `₹${n.toLocaleString('en-IN')}`;

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * MS_PER_DAY);
export const startOfUtcDay = (d: Date) => utc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** [month(0-based), day] of each quarter end. */
const QUARTER_ENDS: ReadonlyArray<readonly [number, number]> = [
  [2, 31],
  [5, 30],
  [8, 30],
  [11, 31],
];

/** Payout deadlines (quarter end + 45 days) for a calendar year. */
export function payoutDeadlines(year: number): Date[] {
  return QUARTER_ENDS.map(([m, d]) => addDays(utc(year, m, d), PAYOUT_WINDOW_DAYS));
}

/** The next payout deadline on or after `now`. */
export function nextPayoutDate(now: Date): Date {
  const today = startOfUtcDay(now);
  const y = today.getUTCFullYear();
  for (const year of [y - 1, y, y + 1]) {
    for (const due of payoutDeadlines(year)) if (due >= today) return due;
  }
  /* unreachable: y+1 always has a future deadline */
  return payoutDeadlines(y + 1)[3];
}

/** Payout deadline of the first quarter that ends on/after the publication date. */
export function firstPayoutDeadline(publicationDate: Date): Date {
  const pub = startOfUtcDay(publicationDate);
  const y = pub.getUTCFullYear();
  for (const year of [y, y + 1]) {
    for (const [m, d] of QUARTER_ENDS) {
      const end = utc(year, m, d);
      if (end >= pub) return addDays(end, PAYOUT_WINDOW_DAYS);
    }
  }
  return addDays(utc(y + 1, 11, 31), PAYOUT_WINDOW_DAYS);
}

export function getPayoutInfo(book: RoyaltyBookInput, authorPendingTotal: number, now: Date): PayoutInfo {
  const none = { nextPayoutDate: null, overdueSince: null, daysOverdue: null, shortfallToThreshold: null };

  if (book.status !== LIVE_STATUS || !book.publicationDate) {
    return { state: 'not_applicable', ...none, summary: 'Not published yet — royalties start accruing after launch.' };
  }
  if (book.royaltyPending <= 0) {
    return {
      state: book.totalCopiesSold > 0 ? 'settled' : 'not_applicable',
      ...none,
      summary: book.totalCopiesSold > 0 ? 'All royalties paid; nothing pending.' : 'No sales recorded yet.',
    };
  }

  const next = nextPayoutDate(now);

  if (authorPendingTotal < PAYOUT_THRESHOLD_INR) {
    const shortfall = PAYOUT_THRESHOLD_INR - authorPendingTotal;
    return {
      state: 'below_threshold',
      nextPayoutDate: toISODate(next),
      overdueSince: null,
      daysOverdue: null,
      shortfallToThreshold: shortfall,
      summary: `Account pending ${formatINR(authorPendingTotal)} is below the ${formatINR(PAYOUT_THRESHOLD_INR)} minimum payout (${formatINR(shortfall)} short); it rolls over to the next quarter.`,
    };
  }

  if (!book.lastRoyaltyPayoutDate) {
    const firstDue = firstPayoutDeadline(book.publicationDate);
    if (firstDue < startOfUtcDay(now)) {
      const days = Math.floor((startOfUtcDay(now).getTime() - firstDue.getTime()) / MS_PER_DAY);
      return {
        state: 'overdue',
        nextPayoutDate: toISODate(next),
        overdueSince: toISODate(firstDue),
        daysOverdue: days,
        shortfallToThreshold: null,
        summary: `OVERDUE: no payout has ever been made; the first payout was due by ${toISODate(firstDue)} (${days} days ago).`,
      };
    }
    const when = firstDue > next ? firstDue : next;
    return { state: 'scheduled', ...none, nextPayoutDate: toISODate(when), summary: `First payout scheduled by ${toISODate(when)}.` };
  }

  return {
    state: 'scheduled',
    ...none,
    nextPayoutDate: toISODate(next),
    summary: `Pending balance will be included in the next quarterly payout by ${toISODate(next)}.`,
  };
}

export interface AuthorRoyaltySummary {
  totalEarned: number;
  totalPaid: number;
  totalPending: number;
  nextPayoutDate: string | null;
  overdueBooks: number;
  belowThreshold: boolean;
}

export function summarizeAuthorRoyalty(
  books: Array<RoyaltyBookInput & { totalRoyaltyEarned: number; royaltyPaid: number }>,
  now: Date,
): AuthorRoyaltySummary {
  const totalEarned = books.reduce((s, b) => s + b.totalRoyaltyEarned, 0);
  const totalPaid = books.reduce((s, b) => s + b.royaltyPaid, 0);
  const totalPending = books.reduce((s, b) => s + b.royaltyPending, 0);
  const infos = books.map((b) => getPayoutInfo(b, totalPending, now));
  return {
    totalEarned,
    totalPaid,
    totalPending,
    nextPayoutDate: totalPending > 0 ? toISODate(nextPayoutDate(now)) : null,
    overdueBooks: infos.filter((i) => i.state === 'overdue').length,
    belowThreshold: totalPending > 0 && totalPending < PAYOUT_THRESHOLD_INR,
  };
}
