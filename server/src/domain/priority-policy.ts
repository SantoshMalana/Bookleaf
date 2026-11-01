/**
 * Deterministic business-rule floors applied on top of the model's priority.
 *
 * Why not trust the model alone? A support desk cannot afford a "Low" on a legal threat
 * or on an ISBN mismatch (the Knowledge Base says ISBN errors are always high priority).
 * The model supplies nuance; these rules supply guarantees. The result records *why*
 * the priority was raised so admins can audit it.
 */
import { PRIORITY_RANK, type Category, type Priority } from '../config/constants.js';

export interface PolicyInput {
  category: Category;
  aiPriority: Priority;
  text: string;
  /** Author has a book whose first royalty payout is overdue (computed by domain/royalty). */
  royaltyOverdue: boolean;
}

export interface PolicyResult {
  priority: Priority;
  /** Reasons a floor was applied; empty when the model's priority stood. */
  floors: string[];
}

const LEGAL = /\b(legal action|lawyer|advocate|legal notice|consumer (court|forum)|sue\b|suing|police|fraud|scam|cheat(ed|ing)?|defam|cyber ?crime)\b/i;
const PRIVACY = /\b(data (leak|breach)|personal (data|information) (was )?(leaked|exposed)|privacy breach)\b/i;
const ISBN_ERROR = /\b(wrong|different|incorrect|duplicate|mismatch(ed)?|mixed up|swapped|another book|not (the )?same|doesn'?t match|does not match|misspel(l)?t|spelled wrong|instead of|no isbn|isbn (field )?(is )?(empty|missing|blank))\b/i;
/** A physical defect in printed copies — the priority rubric calls this High, and the live held-out eval showed the model often says Medium. */
const PRINT_DEFECT = /\b(damaged|torn|crushed|bent|missing pages?|pages? (are |were )?missing|misprint(ed|s)?|blurry|blurred|misalign(ed|ment)?|upside[- ]down|binding|falling (apart|out)|defect(ive)?|smudg(e|ed))\b/i;
const NON_PAYMENT = /\b(not (yet )?(received|paid|got)|haven'?t (received|been paid|got)|never (received|got|paid)|still (waiting|not)|no royalt(y|ies)|unpaid|overdue|pending since|missing payment)\b/i;
const MONTHS_WAIT = /\b(\d+|several|many|few)\s*(months?|years?)\b/i;

const rank = (p: Priority) => PRIORITY_RANK[p];
const max = (a: Priority, b: Priority): Priority => (rank(a) >= rank(b) ? a : b);

export function applyPriorityPolicy(input: PolicyInput): PolicyResult {
  let priority = input.aiPriority;
  const floors: string[] = [];
  const raise = (to: Priority, why: string) => {
    if (rank(to) > rank(priority)) {
      priority = max(priority, to);
      floors.push(`${why} → at least ${to}`);
    }
  };

  if (LEGAL.test(input.text)) raise('Critical', 'legal / fraud language');
  if (PRIVACY.test(input.text)) raise('Critical', 'possible data exposure');
  if (input.category === 'ISBN & Metadata Issues' && ISBN_ERROR.test(input.text)) {
    raise('High', 'reported ISBN/metadata error (Knowledge Base: always high priority)');
  }
  if (input.category === 'Printing & Quality' && PRINT_DEFECT.test(input.text)) raise('High', 'defective or damaged printed copies');
  if (input.category === 'Royalty & Payments') {
    if (NON_PAYMENT.test(input.text) && MONTHS_WAIT.test(input.text)) raise('High', 'long-running non-payment reported');
    if (input.royaltyOverdue && NON_PAYMENT.test(input.text)) raise('High', 'royalty payout is overdue in our records');
  }
  return { priority, floors };
}
