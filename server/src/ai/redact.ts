/**
 * Data minimisation before text leaves our infrastructure.
 *
 * Author messages are sent to a third-party model provider. The model needs the *situation* ("I
 * haven't been paid", "the ISBN is wrong"), never the author's contact details or financial
 * identifiers — and authors do paste them ("my account number is …, call me on …"). So we mask:
 *
 *   - e-mail addresses and UPI ids          → [email]
 *   - phone numbers                         → [phone]
 *   - IFSC codes                            → [ifsc]
 *   - bank-account-like digit runs (9–18)   → [account-number]
 *
 * Deliberately NOT masked: ISBNs (needed for metadata tickets), rupee amounts, dates, book titles,
 * and the author's name (needed for the greeting; it comes from our own records, not free text).
 * Masking is applied to the copy sent to the model only — the stored ticket and what admins read
 * are untouched. It is regex-based, so it is a safety net, not a guarantee; the README says so.
 */

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*/g;
const IFSC = /\b[A-Za-z]{4}0[A-Za-z0-9]{6}\b/g;
// +91 98765 43210, 98765-43210, +1 415 555 0132 …
const PHONE_INTL = /(?<![\w])\+\d{1,3}[\s-]?\d(?:[\s-]?\d){7,11}(?!\d)/g;
const PHONE_IN = /(?<![\d-])(?:0|91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?![\d-])/g;
const LONG_DIGITS = /(?<![\d-])\d{9,18}(?![\d-])/g;

export function redactPii(text: string): string {
  return text
    .replace(EMAIL, '[email]')
    .replace(IFSC, '[ifsc]')
    .replace(PHONE_INTL, '[phone]')
    .replace(PHONE_IN, '[phone]')
    .replace(LONG_DIGITS, (m) => (/^97[89]\d{10}$/.test(m) ? m : '[account-number]')); // keep unhyphenated ISBN-13s
}
