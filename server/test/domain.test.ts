import { describe, expect, it } from 'vitest';
import { firstPayoutDeadline, getPayoutInfo, nextPayoutDate, summarizeAuthorRoyalty, type RoyaltyBookInput } from '../src/domain/royalty.js';
import { getProductionInfo } from '../src/domain/production.js';
import { applyPriorityPolicy } from '../src/domain/priority-policy.js';
import { computeSlaDueAt } from '../src/domain/sla.js';
import { fallbackClassify } from '../src/ai/fallback-classifier.js';
import cases from '../scripts/eval/cases.json' with { type: 'json' };

const NOW = new Date('2026-10-31T10:00:00Z');
const d = (s: string) => new Date(s);
const iso = (x: Date) => x.toISOString().slice(0, 10);

const live = (over: Partial<RoyaltyBookInput> = {}): RoyaltyBookInput => ({
  status: 'Published & Live',
  publicationDate: d('2024-07-05'),
  totalCopiesSold: 67,
  royaltyPending: 2546,
  lastRoyaltyPayoutDate: null,
  ...over,
});

describe('payout calendar (quarter end + 45 days)', () => {
  it('knows the four yearly deadlines', () => {
    expect(nextPayoutDate(d('2026-01-10')).toISOString().slice(0, 10)).toBe('2026-02-14');
    expect(iso(nextPayoutDate(d('2026-02-15')))).toBe('2026-05-15');
    expect(iso(nextPayoutDate(d('2026-06-01')))).toBe('2026-08-14');
    expect(iso(nextPayoutDate(NOW))).toBe('2026-11-14');
    expect(iso(nextPayoutDate(d('2026-11-15')))).toBe('2027-02-14');
  });

  it('treats the deadline day itself as still upcoming', () => {
    expect(iso(nextPayoutDate(d('2026-11-14T23:00:00Z')))).toBe('2026-11-14');
  });

  it('first payout is due 45 days after the quarter in which the book was published', () => {
    expect(iso(firstPayoutDeadline(d('2024-07-05')))).toBe('2024-11-14'); // Q3 2024
    expect(iso(firstPayoutDeadline(d('2025-01-20')))).toBe('2025-05-15'); // Q1 2025
    expect(iso(firstPayoutDeadline(d('2024-09-30')))).toBe('2024-11-14'); // quarter-end day counts
  });
});

describe('payout state (dataset scenarios)', () => {
  it('Ananya (never paid, ₹2,546 pending) is OVERDUE', () => {
    const p = getPayoutInfo(live(), 2546, NOW);
    expect(p.state).toBe('overdue');
    expect(p.overdueSince).toBe('2024-11-14');
    expect(p.daysOverdue).toBeGreaterThan(700);
    expect(p.nextPayoutDate).toBe('2026-11-14');
  });

  it('Kavita (₹850 pending, below ₹1,000) rolls over — not overdue', () => {
    const p = getPayoutInfo(live({ royaltyPending: 850, publicationDate: d('2024-11-05'), totalCopiesSold: 34 }), 850, NOW);
    expect(p.state).toBe('below_threshold');
    expect(p.shortfallToThreshold).toBe(150);
    expect(p.overdueSince).toBeNull();
  });

  it('threshold is account-level: a small book still pays when the account total clears ₹1,000', () => {
    const p = getPayoutInfo(live({ royaltyPending: 850, lastRoyaltyPayoutDate: d('2025-11-15') }), 4115, NOW);
    expect(p.state).toBe('scheduled');
  });

  it('Priya (paid before, ₹3,570 pending) is scheduled for the next cycle', () => {
    const p = getPayoutInfo(live({ royaltyPending: 3570, lastRoyaltyPayoutDate: d('2025-10-15') }), 3570, NOW);
    expect(p.state).toBe('scheduled');
    expect(p.nextPayoutDate).toBe('2026-11-14');
  });

  it('fully paid book is settled', () => {
    expect(getPayoutInfo(live({ royaltyPending: 0, lastRoyaltyPayoutDate: d('2025-12-01') }), 0, NOW).state).toBe('settled');
  });

  it('book in production has no payout state (null MRP etc. must not break anything)', () => {
    const p = getPayoutInfo({ status: 'In Production - Cover Design', publicationDate: null, totalCopiesSold: 0, royaltyPending: 0, lastRoyaltyPayoutDate: null }, 0, NOW);
    expect(p.state).toBe('not_applicable');
  });

  it('a newly published book is not overdue before its first window closes', () => {
    const p = getPayoutInfo(live({ publicationDate: d('2026-10-01') }), 5000, NOW);
    expect(p.state).toBe('scheduled');
    expect(p.nextPayoutDate).toBe('2027-02-14'); // first window: Q4 2026 → 14 Feb 2027
  });

  it('summarises an account (Diya: one paid book + one never-paid book)', () => {
    const books = [
      { ...live({ royaltyPending: 2540, lastRoyaltyPayoutDate: d('2025-11-15') }), totalRoyaltyEarned: 27540, royaltyPaid: 25000 },
      { ...live({ royaltyPending: 1575, publicationDate: d('2025-01-20') }), totalRoyaltyEarned: 1575, royaltyPaid: 0 },
    ];
    const s = summarizeAuthorRoyalty(books, NOW);
    expect(s.totalPending).toBe(4115);
    expect(s.overdueBooks).toBe(1);
    expect(s.belowThreshold).toBe(false);
  });
});

describe('production stages', () => {
  it('maps "In Production - Cover Design" onto the pipeline', () => {
    const p = getProductionInfo('In Production - Cover Design');
    expect(p.isLive).toBe(false);
    expect(p.stage).toBe('Cover Design');
    expect(p.stageIndex).toBe(2);
    expect(p.stages.filter((s) => s.state === 'done').map((s) => s.name)).toEqual(['Manuscript Received', 'Editing']);
    expect(p.commonDelayStage).toBe(true); // KB: delays typically happen at Cover Design
  });

  it('typesetting is not a common-delay stage; live books have everything done', () => {
    expect(getProductionInfo('In Production - Typesetting').commonDelayStage).toBe(false);
    const live = getProductionInfo('Published & Live');
    expect(live.isLive).toBe(true);
    expect(live.stages.every((s) => s.state === 'done')).toBe(true);
  });

  it('does not crash on unknown statuses', () => {
    expect(getProductionInfo('Something Else').stageIndex).toBe(-1);
  });
});

describe('priority policy (business-rule floors)', () => {
  const base = { aiPriority: 'Low' as const, royaltyOverdue: false };

  it('legal / fraud language is always Critical', () => {
    expect(applyPriorityPolicy({ ...base, category: 'Royalty & Payments', text: 'I will take legal action' }).priority).toBe('Critical');
  });

  it('ISBN errors are at least High (Knowledge Base rule)', () => {
    const r = applyPriorityPolicy({ ...base, category: 'ISBN & Metadata Issues', aiPriority: 'Medium', text: 'My ISBN is wrong on Amazon' });
    expect(r.priority).toBe('High');
    expect(r.floors[0]).toMatch(/high priority/i);
  });

  it('non-payment + overdue in our records is at least High, otherwise the model stands', () => {
    const text = "I haven't received my royalty";
    expect(applyPriorityPolicy({ category: 'Royalty & Payments', aiPriority: 'Medium', text, royaltyOverdue: true }).priority).toBe('High');
    expect(applyPriorityPolicy({ category: 'Royalty & Payments', aiPriority: 'Medium', text, royaltyOverdue: false }).priority).toBe('Medium');
  });

  it('never lowers a priority', () => {
    expect(applyPriorityPolicy({ category: 'General Inquiry', aiPriority: 'Critical', text: 'hello', royaltyOverdue: false }).priority).toBe('Critical');
  });
});

describe('SLA clock', () => {
  it('runs only while BookLeaf owes a response on an active ticket', () => {
    const since = new Date('2026-10-30T00:00:00Z');
    expect(computeSlaDueAt({ status: 'Open', priority: 'High', awaitingResponseSince: since })?.toISOString()).toBe('2026-10-31T00:00:00.000Z'); // +24h
    expect(computeSlaDueAt({ status: 'Open', priority: 'Critical', awaitingResponseSince: since })?.toISOString()).toBe('2026-10-30T04:00:00.000Z'); // +4h
    expect(computeSlaDueAt({ status: 'Resolved', priority: 'High', awaitingResponseSince: since })).toBeNull();
    expect(computeSlaDueAt({ status: 'In Progress', priority: 'High', awaitingResponseSince: null })).toBeNull();
  });
});

describe('rule-based fallback classifier (used when the AI is down)', () => {
  const rank = { Critical: 4, High: 3, Medium: 2, Low: 1 } as const;
  const results = (cases as Array<{ subject: string; description: string; category: string; priority: keyof typeof rank }>).map((c) => ({
    c,
    got: fallbackClassify(c.subject, c.description),
  }));

  it('gets the category right on at least 85% of the labelled eval set', () => {
    const correct = results.filter((r) => r.got.category === r.c.category).length;
    const accuracy = correct / results.length;
    const misses = results.filter((r) => r.got.category !== r.c.category).map((r) => `${r.c.subject} → ${r.got.category}`);
    expect(accuracy, `misses: ${misses.join(' | ')}`).toBeGreaterThanOrEqual(0.85);
  });

  it('is within one priority level on at least 85%', () => {
    const near = results.filter((r) => Math.abs(rank[r.got.priority] - rank[r.c.priority]) <= 1).length;
    expect(near / results.length).toBeGreaterThanOrEqual(0.85);
  });

  it('flags the brief\'s core urgency example higher than a bio update', () => {
    const royalty = fallbackClassify('Royalty', "I haven't received any royalty for 6 months");
    const bio = fallbackClassify('Bio', 'Can I update my author bio?');
    expect(rank[royalty.priority]).toBeGreaterThan(rank[bio.priority]);
  });
});

describe('priority floors added after the live held-out eval', () => {
  const p = (category: Parameters<typeof applyPriorityPolicy>[0]['category'], text: string, aiPriority: 'Low' | 'Medium' = 'Medium') =>
    applyPriorityPolicy({ category, aiPriority, text, royaltyOverdue: false }).priority;

  it('physically damaged or defective copies are at least High; a plain reprint request is not', () => {
    expect(p('Printing & Quality', 'The courier box was crushed and two books have bent corners and a torn cover.')).toBe('High');
    expect(p('Printing & Quality', 'Several pages are missing and some are printed upside down.')).toBe('High');
    expect(p('Printing & Quality', 'I would like to order a reprint of 20 author copies for a book fair next month.')).toBe('Medium');
  });

  it('a misspelt author name or a missing ISBN counts as a metadata error (High)', () => {
    expect(p('ISBN & Metadata Issues', "On Amazon my name appears as 'Rahul Verna' instead of 'Rahul Varma'.")).toBe('High');
    expect(p('ISBN & Metadata Issues', 'The ISBN field is empty on my dashboard.')).toBe('High');
    expect(p('ISBN & Metadata Issues', 'How do I update my book description?', 'Low')).toBe('Low');
  });
});
