/**
 * Rule-based classifier used when the LLM is unavailable (down, rate-limited, not configured,
 * or returned something unusable). It is deliberately simple and transparent: weighted keyword
 * scoring per category plus a few urgency cues. Results are tagged source="fallback" in the UI
 * so admins know to double-check them.
 */
import { PRIORITY_RANK, type Category, type Priority } from '../config/constants.js';

const RULES: Array<{ category: Category; patterns: Array<[RegExp, number]> }> = [
  {
    category: 'Royalty & Payments',
    patterns: [
      [/\broyalt(y|ies)\b/i, 4],
      [/\b(payout|payment|paid|unpaid|bank (transfer|account|details)|settlement|statement)\b/i, 3],
      [/\b(earning|earnings|revenue|commission|net profit|per copy|₹|rs\.?|inr)\b/i, 1.5],
      [/\b(too low|less than|amount|calculation|breakdown)\b/i, 1.5],
    ],
  },
  {
    category: 'ISBN & Metadata Issues',
    patterns: [
      [/\bisbn\b/i, 5],
      [/\b(metadata|wrong (title|author name|cover)|author name (is )?(spelled|wrong)|duplicate (listing|isbn))\b/i, 3],
      [/\b(different|wrong|incorrect|mismatch)\b.*\b(isbn|book linked)\b/i, 2],
      [/\b(misspel(l)?t|spelled wrong|(name|title) (appears|shows|is shown) as|about the author|old (draft )?cover|wrong cover|no isbn)\b/i, 3],
    ],
  },
  {
    category: 'Printing & Quality',
    patterns: [
      [/\b(print(ed|ing)? quality|misprint(s|ed)?|blurry|blurred|smudg(e|ed)|misalign(ed|ment)?|binding|pages? (fell|falling|torn|missing|cut)|colou?r (is |are )?(off|faded|inconsistent|wrong)|faded|reprint|damaged copies?|defect(ive)?)\b/i, 5],
      [/\b(crushed|bent corners?|torn (cover|pages?)|upside[- ]down|washed[- ]out|dull(er)? colou?rs?|colou?rs? (look|looks|are|is) (dull|washed|faded))\b/i, 5],
      [/\b(author copies|physical cop(y|ies)|paperback|hardcover|paper quality)\b/i, 2],
    ],
  },
  {
    category: 'Distribution & Availability',
    patterns: [
      [/\b(currently unavailable|out of stock|not (showing|available|listed|visible)|unavailable|stock sync|delisted|not live on|listing (is )?(missing|down))\b/i, 5],
      [/\b(kindle|e-?book|cannot find (it|my book) on|not (on|in) the (bookleaf )?store|not showing on)\b/i, 4],
      [/\b(amazon|flipkart|bookleaf store|platform|listing|listed)\b/i, 1.5],
    ],
  },
  {
    category: 'Book Status & Production Updates',
    patterns: [
      [/\b(typesetting|cover design|proofreading|proof|editing stage|manuscript|production (stage|status)|in production)\b/i, 4],
      [/\b(when will (it|my book)|how long|still (in|waiting)|delay(ed)?|status of my book|go live|launch date|release date)\b/i, 2.5],
    ],
  },
];

const CRITICAL = /\b(legal action|lawyer|advocate|legal notice|consumer (court|forum)|police|fraud|scam|cheated|defamation|data (leak|breach)|(sent|went|transferred|credited) to (the )?(wrong|someone else|another)|(phone number|home address|personal (details|information|data)) (and [\w ]{1,20} )?(appears?|is (visible|shown|public)))\b/i;
const URGENT_ROYALTY = /\b(not (yet )?(received|paid)|haven'?t (received|been paid)|never (received|paid)|no royalt(y|ies)|unpaid|overdue)\b/i;
const LOW_SIGNALS = /\b(can i|is it possible|how (do|can) i|update (my )?(bio|description|author)|just (wanted|checking)|suggestion|feedback)\b/i;

export interface FallbackResult {
  category: Category;
  priority: Priority;
  rationale: string;
}

export function fallbackClassify(subject: string, description: string): FallbackResult {
  const text = `${subject}\n${description}`;
  let best: { category: Category; score: number } = { category: 'General Inquiry', score: 0 };

  for (const rule of RULES) {
    const score = rule.patterns.reduce((s, [re, w]) => (re.test(text) ? s + w : s), 0);
    if (score > best.score) best = { category: rule.category, score };
  }
  const category: Category = best.score >= 3 ? best.category : 'General Inquiry';

  let priority: Priority = 'Medium';
  let why = 'default for an actionable query';
  if (CRITICAL.test(text)) {
    priority = 'Critical';
    why = 'legal/fraud language';
  } else if (category === 'ISBN & Metadata Issues' && /\b(wrong|different|incorrect|duplicate|mismatch)/i.test(text)) {
    priority = 'High';
    why = 'ISBN/metadata error';
  } else if (category === 'Royalty & Payments' && URGENT_ROYALTY.test(text)) {
    priority = 'High';
    why = 'non-payment reported';
  } else if (category === 'Printing & Quality' || category === 'Distribution & Availability') {
    priority = 'High';
    why = 'defect or availability problem affecting sales';
  } else if (category === 'General Inquiry' && LOW_SIGNALS.test(text)) {
    priority = 'Low';
    why = 'general question, not time-sensitive';
  } else if (category === 'General Inquiry') {
    priority = 'Low';
    why = 'no urgent signals';
  }

  return { category, priority, rationale: `Rule-based: ${why}.` };
}

export const priorityRankOf = (p: Priority) => PRIORITY_RANK[p];
