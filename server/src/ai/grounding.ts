/**
 * Deterministic grounding check for AI drafts.
 *
 * The prompt tells the model to use only the facts it was given, but a prompt is a request, not a
 * guarantee. After every generation this module compares what the reply *asserts* — rupee amounts,
 * dates, ISBNs, links and turnaround promises — with what the model was actually given (the FACTS
 * block plus the POLICY text). Anything it cannot find there becomes a warning that is shown to the
 * human reviewer above the editor ("verify before sending"). It never rewrites the draft and never
 * blocks it: a false alarm costs the reviewer a glance, a missed hallucination costs an author's trust.
 *
 * It is intentionally conservative about what it extracts, so that warnings are rare and meaningful.
 */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const iso = (y: number, m: number, d: number): string => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const monthIndex = (name: string): number => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;

/** Every date mentioned in `text`, normalised to YYYY-MM-DD ("14 Nov 2024", "November 14, 2024", "2024-11-14"). */
export function extractDates(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) out.add(iso(+m[1]!, +m[2]!, +m[3]!));
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}\\.?,?\\s+(\\d{4})\\b`, 'gi'))) out.add(iso(+m[3]!, monthIndex(m[2]!), +m[1]!));
  for (const m of text.matchAll(new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'gi'))) out.add(iso(+m[3]!, monthIndex(m[1]!), +m[2]!));
  return [...out];
}

/** Rupee amounts as plain numbers: "₹2,546", "Rs. 1,000", "INR 38.50". */
export function extractAmounts(text: string): number[] {
  const out = new Set<number>();
  for (const m of text.matchAll(/(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d+)?)/gi)) {
    const n = Number(m[1]!.replace(/,/g, ''));
    if (Number.isFinite(n)) out.add(n);
  }
  return [...out];
}

/** Turnaround promises, normalised: "within 48 hours" → "48 hours", "5–7 business days" → "5-7 business days". */
export function extractTimelines(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b(\d{1,3})(?:\s*(?:–|-|to)\s*(\d{1,3}))?(?:\s+|-)?(business\s+days?|working\s+days?|hours?|days?|weeks?)\b/gi)) {
    const unit = m[3]!.toLowerCase().replace(/\s+/g, ' ').replace(/^working/, 'business').replace(/s$/, '');
    out.add(m[2] ? `${m[1]}-${m[2]} ${unit}` : `${m[1]} ${unit}`);
  }
  return [...out];
}

const extractIsbns = (t: string): string[] => [...t.matchAll(/\b97[89][-\s]?\d[-\s\dxX]{8,14}\d\b/g)].map((m) => m[0].replace(/[-\s]/g, ''));
const extractUrls = (t: string): string[] => [...t.matchAll(/https?:\/\/[^\s)]+|www\.[^\s)]+/gi)].map((m) => m[0].replace(/[.,;]+$/, '').toLowerCase());

const fmtDate = (isoDate: string): string => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${d} ${MONTHS[m! - 1]!.replace(/^./, (c) => c.toUpperCase())} ${y}`;
};

export interface GroundingResult {
  /** Human-readable warnings for the reviewer; empty when everything checks out. */
  warnings: string[];
}

/**
 * @param reply   the drafted reply (without signature)
 * @param source  everything the model was allowed to rely on: the POLICY text and the FACTS block
 */
export function checkGrounding(reply: string, source: string): GroundingResult {
  const warnings: string[] = [];

  const knownAmounts = new Set(extractAmounts(source));
  for (const n of extractAmounts(reply)) {
    if (!knownAmounts.has(n)) warnings.push(`The reply mentions ₹${n.toLocaleString('en-IN')}, which is not in the account data given to the AI.`);
  }

  const knownDates = new Set(extractDates(source));
  for (const d of extractDates(reply)) {
    if (!knownDates.has(d)) warnings.push(`The reply mentions ${fmtDate(d)}, which is not in the account data given to the AI.`);
  }

  const knownIsbns = new Set(extractIsbns(source));
  for (const i of extractIsbns(reply)) if (!knownIsbns.has(i)) warnings.push(`The reply quotes an ISBN (${i}) that is not on record.`);

  const knownUrls = new Set(extractUrls(source));
  for (const u of extractUrls(reply)) if (!knownUrls.has(u)) warnings.push(`The reply contains a link (${u}) that is not in the knowledge base.`);

  const knownTimelines = new Set(extractTimelines(source));
  for (const t of extractTimelines(reply)) {
    if (!knownTimelines.has(t)) warnings.push(`The reply promises "${t}", which is not a turnaround listed in company policy.`);
  }

  // Open-ended promises the policy does not make ("we'll pay immediately", "guaranteed today").
  for (const m of reply.matchAll(/\b(immediately|right away|today|tomorrow|guarantee[ds]?|instantly)\b/gi)) {
    const word = m[1]!.toLowerCase();
    if (!new RegExp(`\\b${word}\\b`, 'i').test(source)) warnings.push(`The reply promises "${word}", which company policy does not commit to — use the policy timeline instead.`);
  }

  // The one business rule worth enforcing even when every individual fact is correct: an overdue payout must
  // not be answered with "wait for the next regular payout" (that reads as a second delay).
  if (/REQUIRED_ACTION:[^\n]*overdue/i.test(source) && /\b(next|upcoming|regular)\b[^.]{0,40}\bpayout\b|\bpayout\b[^.]{0,40}\b(next|upcoming)\b/i.test(reply)) {
    warnings.push('The payout is overdue, but the reply points to a future payout cycle. Escalate with the 48-hour timeline instead.');
  }

  return { warnings: [...new Set(warnings)] };
}
