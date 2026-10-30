/**
 * Demo tickets. They are built from the sample queries in the assignment brief, attached to
 * the real seeded authors/books so the admin queue looks alive on first load: a mix of
 * statuses, categories and priorities, an overdue ticket, a resolved and a closed one.
 *
 * They are written directly (no LLM call) and flagged with source "seed" — the UI shows
 * them as "Preset" so nobody mistakes them for live AI output. Real tickets raised through
 * the app are triaged by the AI path.
 */
import type { Category, Priority, Status } from '../config/constants.js';

export interface DemoMessage {
  kind: 'public' | 'internal' | 'event';
  role: 'author' | 'admin' | 'system';
  /** Admin email for admin messages. */
  admin?: string;
  body: string;
  /** Hours before "now" this message was written. */
  ageHours: number;
}

export interface DemoTicket {
  authorCode: string;
  bookCode: string | null;
  subject: string;
  description: string;
  ageHours: number;
  status: Status;
  category: Category;
  priority: Priority;
  rationale: string;
  assignedTo?: string;
  messages?: DemoMessage[];
}

const RIYA = 'admin@bookleaf.example';
const KARAN = 'ops@bookleaf.example';

export const DEMO_TICKETS: DemoTicket[] = [
  {
    authorCode: 'AUTH003',
    bookCode: 'BK005',
    subject: "Haven't received any royalty since my book launched",
    description:
      "Hello, my book Between Two Temples has been live since July 2024 and I haven't received a single royalty payment so far. My dashboard shows copies sold but nothing has reached my bank account. Could you please tell me what is going on and when I can expect the payment?",
    ageHours: 76,
    status: 'Open',
    category: 'Royalty & Payments',
    priority: 'High',
    rationale: 'Author reports no royalty ever received; our records show the first payout is long overdue.',
  },
  {
    authorCode: 'AUTH005',
    bookCode: 'BK009',
    subject: 'Royalty for Letters from Lakshadweep seems too low',
    description:
      "I have sold roughly 200 copies of Letters from Lakshadweep but my last payout was only ₹8,000. By my calculation I should have received more. Could you explain how my royalty is calculated?",
    ageHours: 20,
    status: 'Open',
    category: 'Royalty & Payments',
    priority: 'Medium',
    rationale: 'Royalty calculation question; no non-payment reported.',
  },
  {
    authorCode: 'AUTH007',
    bookCode: 'BK011',
    subject: "ISBN on Amazon doesn't match my physical copy",
    description:
      "The Algorithm of Love shows a different ISBN on the Amazon listing than the one printed on my physical copy. This is confusing for readers and I'm worried my sales are being attributed to the wrong book.",
    ageHours: 30,
    status: 'In Progress',
    category: 'ISBN & Metadata Issues',
    priority: 'High',
    rationale: 'Reported ISBN mismatch — always high priority per policy.',
    assignedTo: RIYA,
    messages: [
      {
        kind: 'event',
        role: 'system',
        body: 'Status Open → In Progress (reply sent).',
        ageHours: 26,
      },
      {
        kind: 'public',
        role: 'admin',
        admin: RIYA,
        ageHours: 26,
        body: "Hi Sneha,\n\nThank you for flagging this — an ISBN mismatch between the listing and your printed copy is a serious data issue, and I'm sorry for the confusion it has caused. We have escalated it to our production team and will confirm the corrected details within 48 hours.\n\nCould you send us a photo of the copyright page of your copy so the team can compare it with the Amazon listing?\n\nWarm regards,\nRiya Verma\nBookLeaf Publishing — Author Support",
      },
      {
        kind: 'internal',
        role: 'admin',
        admin: RIYA,
        ageHours: 25,
        body: 'ISBN on file is 978-93-5XXXX-11-0. Waiting on production to compare against the live Amazon listing.',
      },
    ],
  },
  {
    authorCode: 'AUTH004',
    bookCode: 'BK006',
    subject: 'Author copies arrived with blurry images and misaligned pages',
    description:
      "I received my author copies of Debugging Life today and the print quality is poor. The images are blurry and several pages are misaligned. I'm really disappointed — what can be done?",
    ageHours: 6,
    status: 'Open',
    category: 'Printing & Quality',
    priority: 'High',
    rationale: 'Defective printed copies reported; reprint workflow applies.',
  },
  {
    authorCode: 'AUTH001',
    bookCode: 'BK001',
    subject: 'Whispers of the Ganges shows "Currently Unavailable" on Amazon',
    description: 'My book is published but it is showing as "Currently Unavailable" on Amazon India. Readers are messaging me that they cannot buy it. Please help.',
    ageHours: 120,
    status: 'Resolved',
    category: 'Distribution & Availability',
    priority: 'High',
    rationale: 'Book unavailable on a major platform — likely stock sync.',
    assignedTo: KARAN,
    messages: [
      {
        kind: 'public',
        role: 'admin',
        admin: KARAN,
        ageHours: 112,
        body: "Hi Priya,\n\nThanks for letting us know — a \"Currently Unavailable\" label usually points to a stock-sync issue between our system and the platform. We are triggering a re-sync with our distribution team now, and it typically takes 24–48 hours for the listing to go live again.\n\nWe'll confirm here once it's showing as available.\n\nWarm regards,\nKaran Mehta\nBookLeaf Publishing — Author Support",
      },
      { kind: 'event', role: 'system', body: 'Status Open → In Progress (reply sent).', ageHours: 112 },
      {
        kind: 'public',
        role: 'admin',
        admin: KARAN,
        ageHours: 70,
        body: 'Hi Priya,\n\nGood news: the re-sync is complete and Whispers of the Ganges is showing as available on Amazon India again. If you notice anything odd, just reply here and we will look straight away.\n\nWarm regards,\nKaran Mehta\nBookLeaf Publishing — Author Support',
      },
      { kind: 'event', role: 'system', body: 'Status In Progress → Resolved.', ageHours: 70 },
    ],
  },
  {
    authorCode: 'AUTH007',
    bookCode: 'BK013',
    subject: 'Midnight in Mysore — when will the cover be ready?',
    description: "It's been about three weeks and Midnight in Mysore is still at the cover design stage. When can I expect it to move forward and go live?",
    ageHours: 40,
    status: 'Open',
    category: 'Book Status & Production Updates',
    priority: 'Medium',
    rationale: 'Production-status enquiry for an unpublished book.',
  },
  {
    authorCode: 'AUTH008',
    bookCode: 'BK014',
    subject: 'Can I update my book description on Amazon?',
    description: 'My book is already live on Amazon. Is it possible to update its description now, and if so how long will the change take to show?',
    ageHours: 200,
    status: 'Closed',
    category: 'General Inquiry',
    priority: 'Low',
    rationale: 'Plain metadata-update question; no error or urgency.',
    assignedTo: RIYA,
    messages: [
      {
        kind: 'public',
        role: 'admin',
        admin: RIYA,
        ageHours: 190,
        body: 'Hi Farhan,\n\nYes — metadata updates can be submitted through your dashboard or by emailing our team. Changes typically reflect on the platforms within 3–5 business days. Send us the new description whenever you are ready and we will take it from there.\n\nWarm regards,\nRiya Verma\nBookLeaf Publishing — Author Support',
      },
      { kind: 'event', role: 'system', body: 'Status Open → In Progress (reply sent).', ageHours: 190 },
      { kind: 'event', role: 'system', body: 'Status In Progress → Closed.', ageHours: 150 },
    ],
  },
  {
    authorCode: 'AUTH009',
    bookCode: 'BK016',
    subject: 'No royalty received for The Nagpur Notebooks',
    description: 'I have not received any royalty payment for The Nagpur Notebooks since it was published last November. Could you let me know the status?',
    ageHours: 10,
    status: 'Open',
    category: 'Royalty & Payments',
    priority: 'Medium',
    rationale: 'No royalty received, but the balance is below the ₹1,000 minimum payout so it rolls over (not overdue).',
  },
];
