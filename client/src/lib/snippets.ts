/**
 * Canned replies for common situations. They are plain starting points for the admin to edit, not
 * AI output, and every turnaround quoted here is one of the company policy timelines (the same ones
 * the AI is limited to), so they can never over-promise.
 */
export interface Snippet {
  id: string;
  label: string;
  body: string;
}

export const SNIPPETS: Snippet[] = [
  {
    id: 'looking',
    label: 'Looking into it',
    body: "Hi {{name}}, thank you for flagging this. We're looking into {{book}} now and will update you here within 48 hours.",
  },
  {
    id: 'royalty-breakdown',
    label: 'Royalty breakdown',
    body: "Hi {{name}}, happy to walk you through this. You can see sales per platform in your dashboard, and we can also share a line-by-line breakdown of how the royalty for {{book}} was calculated (net profit is the MRP minus printing cost, platform commission and shipping, and you receive 80% of it). Just reply here and we'll send the breakdown.",
  },
  {
    id: 'photos',
    label: 'Ask for photos',
    body: "Hi {{name}}, we're sorry the copies arrived like that. Could you send clear photos of the affected pages and the cover? Once we've verified them we'll arrange a free reprint, which takes 5–7 business days.",
  },
  {
    id: 'resync',
    label: 'Re-sync listing',
    body: "Hi {{name}}, this usually points to a stock-sync issue. We've asked our distribution team to re-sync the listing for {{book}}, which takes 24–48 hours. We'll confirm here once it's back.",
  },
  {
    id: 'metadata',
    label: 'Metadata update',
    body: "Hi {{name}}, you can submit the change through your dashboard or by emailing our team. Updates to a live listing typically show up on the platforms within 3–5 business days.",
  },
  {
    id: 'close',
    label: 'Wrap up',
    body: "Hi {{name}}, glad we could get this sorted. If anything else comes up, just reply on this ticket and we'll pick it up.",
  },
];

export function fillSnippet(snippet: Snippet, vars: { name: string; book: string | null }): string {
  return snippet.body.replace(/\{\{name\}\}/g, vars.name).replace(/\{\{book\}\}/g, vars.book ?? 'your account');
}
