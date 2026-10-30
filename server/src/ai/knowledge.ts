/**
 * BookLeaf Knowledge Base, split into addressable sections.
 *
 * Cost design: instead of pasting the whole KB into every prompt, the context builder
 * sends only (a) the always-on core (company overview + tone) and (b) the ONE section
 * that matches the ticket's category. Sections are written to be terse and factual —
 * every token here is paid for on every draft.
 */
import type { Category } from '../config/constants.js';

/** Always included: who we are + how we sound. */
export const CORE_POLICY = `COMPANY
BookLeaf Publishing is a self-publishing company in India and the US. Packages: Standard Free (no upfront cost) and Bestseller Breakthrough (paid, with marketing and distribution add-ons). We handle cover design, typesetting, ISBN assignment, printing, distribution and royalty management. In-house printing facility and warehouse are in Delhi; overflow print partners are Repro India and Epitome Books.`;

export const TONE_GUIDE = `TONE
Empathetic and professional — authors are partners, not customers to be managed. Acknowledge the concern before solutions. Be specific: real numbers, dates, statuses. If it is BookLeaf's fault, own it directly, no corporate deflection. If investigation/escalation is needed give a clear timeline ("within 48 hours"), never open-ended promises. Always end with a clear next step.`;

/** Category-specific policy. Exactly one of these is added to a draft prompt. */
export const CATEGORY_POLICY: Record<Category, string> = {
  'Royalty & Payments': `ROYALTY POLICY
- 80/20 split: 80% of net profit per book to the author, 20% to BookLeaf.
- Net profit = MRP minus printing cost, platform commission (Amazon/Flipkart) and shipping charges.
- Royalties are calculated quarterly and paid within 45 days of quarter end.
- Minimum payout ₹1,000. Below that, the balance rolls over to the next quarter.
- Paid by bank transfer to the account linked in the author's dashboard.
- Authors can see a detailed royalty breakdown (sales per platform) in their dashboard; we can also share a line-by-line breakdown.
- If a payment is genuinely overdue, escalate with a 48-hour resolution timeline.`,

  'ISBN & Metadata Issues': `ISBN POLICY
- Every BookLeaf book gets a unique ISBN assigned by BookLeaf, registered under BookLeaf's publisher imprint. An ISBN under the author's own imprint must be obtained by the author independently.
- A reported ISBN error (duplicate, wrong book linked, mismatch between listing and physical copy) is HIGH priority and is escalated to the production team immediately; resolution timeline 48 hours.
- Metadata updates (e.g. description) can be submitted via the dashboard or by emailing the team; changes typically reflect on platforms within 3–5 business days.`,

  'Printing & Quality': `PRINTING & QUALITY POLICY
- In-house printing handles most orders; overflow or special formats go to Repro India or Epitome Books.
- Standard print turnaround: 5–7 business days from order confirmation.
- Quality issues (misprints, binding defects, colour inconsistency, blurry images, misalignment): BookLeaf arranges a FREE reprint after verification. The author may need to share photos of the defective copy. Reprint timeline: 5–7 business days.`,

  'Distribution & Availability': `DISTRIBUTION POLICY
- Books are listed on Amazon India, Flipkart, Amazon US, Amazon UK and the BookLeaf Store.
- New listings typically go live 7–10 business days after publication is complete.
- A book showing as unavailable on a platform usually means a stock-sync issue; the team can trigger a re-sync, which takes 24–48 hours.`,

  'Book Status & Production Updates': `PRODUCTION POLICY
- Stages: Manuscript Received → Editing (if opted) → Cover Design → Typesetting → Proofreading → ISBN Assignment → Printing → Distribution Setup → Published & Live.
- Authors are emailed at each stage. Delays typically happen at Cover Design (waiting for author approval) and Proofreading (revision rounds).
- Be honest about the cause of a delay, but never blame the author even when the delay is on their side — frame it collaboratively.
- After publication is complete, listings typically go live in 7–10 business days; standard print turnaround is 5–7 business days.`,

  'General Inquiry': `GENERAL POLICY
- Metadata updates (e.g. a book's description on Amazon after it is live) can be submitted through the dashboard or by emailing the BookLeaf team; changes typically reflect on platforms within 3–5 business days.
- Royalties are paid quarterly (within 45 days of quarter end, ₹1,000 minimum). Books are listed on Amazon India, Flipkart, Amazon US, Amazon UK and the BookLeaf Store.`,
};

/**
 * Reference guidance per category, taken from the "Sample Query → Response" table in the
 * assignment brief. Used as light few-shot calibration (guidance, not a script to copy).
 */
export const CATEGORY_GUIDANCE: Record<Category, string> = {
  'Royalty & Payments': `GUIDANCE (royalty)
Not received any royalty: acknowledge the frustration; explain the quarterly cycle and 45-day window; give the specific next payout date; if genuinely overdue, own it and escalate with a 48-hour timeline. Bank-link status is not in our system — never assert it, ask or flag it.
Amount seems too low: explain net profit = MRP − printing − platform commission − shipping; offer a detailed line-by-line breakdown; don't be defensive.`,
  'ISBN & Metadata Issues': `GUIDANCE (ISBN)
Treat as high priority; acknowledge it is a serious data issue; confirm escalation to the production team immediately; give a 48-hour resolution timeline.`,
  'Printing & Quality': `GUIDANCE (printing)
Apologise sincerely; ask for photos of the defective copies; confirm a free reprint once verified; give the 5–7 business day timeline.`,
  'Distribution & Availability': `GUIDANCE (distribution)
Explain it is typically a stock-sync issue; confirm you are triggering a re-sync with the distribution team; set the expectation of 24–48 hours.`,
  'Book Status & Production Updates': `GUIDANCE (production)
Use the actual production stage from FACTS. If delayed, say honestly why (e.g. waiting on proof approval) and give a specific updated timeline from policy; frame any author-side wait collaboratively.`,
  'General Inquiry': `GUIDANCE (general)
Answer directly from policy. Metadata updates: submit via dashboard or email; reflects in 3–5 business days.`,
};

export const KB_SECTION_NAMES = ['core', 'tone', 'category policy', 'category guidance'] as const;
