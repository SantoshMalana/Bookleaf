import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { PRIORITY_RANK } from '../config/constants.js';
import { computeSlaDueAt } from '../domain/sla.js';
import { logger } from '../lib/logger.js';
import { AiCall, Author, Book, Message, Ticket, User, nextSequence, type IUser } from '../models/index.js';
import { hashPassword } from '../modules/auth/auth.service.js';
import { DEMO_TICKETS } from './demo-tickets.js';
import sample from './bookleaf_sample_data.json' with { type: 'json' };

export const ADMIN_ACCOUNTS = [
  { name: 'Riya Verma', email: 'admin@bookleaf.example' },
  { name: 'Karan Mehta', email: 'ops@bookleaf.example' },
];

interface SeedOptions {
  /** Drop every collection first. */
  reset?: boolean;
  /** Also create demo tickets (only when the ticket collection is empty). */
  demoTickets?: boolean;
}

const toDate = (v: string | null): Date | null => (v ? new Date(v) : null);
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

/**
 * Loads the assignment's dataset (10 authors / 18 books) exactly as provided, creates a login
 * for every author plus two admins, and optionally adds demo tickets. Idempotent: re-running
 * updates records in place and never duplicates them.
 */
export async function seedDatabase(opts: SeedOptions = {}) {
  if (opts.reset) {
    await Promise.all([User.deleteMany({}), Author.deleteMany({}), Book.deleteMany({}), Ticket.deleteMany({}), Message.deleteMany({}), AiCall.deleteMany({})]);
    await mongoose.connection.collection('counters').deleteMany({});
  }

  const authorHash = await hashPassword(env.SEED_AUTHOR_PASSWORD);
  const adminHash = await hashPassword(env.SEED_ADMIN_PASSWORD);

  let bookCount = 0;
  for (const a of sample.authors) {
    const author = await Author.findOneAndUpdate(
      { authorCode: a.author_id },
      { authorCode: a.author_id, name: a.name, email: a.email, phone: a.phone, city: a.city, joinedDate: new Date(a.joined_date) },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    await User.findOneAndUpdate(
      { email: a.email.toLowerCase() },
      { $set: { name: a.name, role: 'author', author: author._id }, $setOnInsert: { passwordHash: authorHash } },
      { upsert: true },
    );

    for (const b of a.books) {
      await Book.findOneAndUpdate(
        { bookCode: b.book_id },
        {
          bookCode: b.book_id,
          author: author._id,
          title: b.title,
          isbn: b.isbn,
          genre: b.genre,
          publicationDate: toDate(b.publication_date),
          status: b.status,
          mrp: b.mrp,
          royaltyPerCopy: b.author_royalty_per_copy,
          totalCopiesSold: b.total_copies_sold,
          totalRoyaltyEarned: b.total_royalty_earned,
          royaltyPaid: b.royalty_paid,
          royaltyPending: b.royalty_pending,
          lastRoyaltyPayoutDate: toDate(b.last_royalty_payout_date),
          printPartner: b.print_partner,
          availableOn: b.available_on,
        },
        { upsert: true, setDefaultsOnInsert: true },
      );
      bookCount += 1;
    }
  }

  for (const admin of ADMIN_ACCOUNTS) {
    await User.findOneAndUpdate(
      { email: admin.email },
      { $set: { name: admin.name, role: 'admin', author: null }, $setOnInsert: { passwordHash: adminHash } },
      { upsert: true },
    );
  }

  let tickets = 0;
  if (opts.demoTickets && (await Ticket.estimatedDocumentCount()) === 0) tickets = await createDemoTickets();

  const summary = { authors: sample.authors.length, books: bookCount, admins: ADMIN_ACCOUNTS.length, demoTickets: tickets };
  logger.info(summary, 'database seeded');
  return summary;
}

async function createDemoTickets(): Promise<number> {
  const admins = new Map((await User.find({ role: 'admin' }).lean<IUser[]>()).map((u) => [u.email, u]));
  const authors = new Map((await Author.find().lean()).map((a) => [a.authorCode, a]));
  const books = new Map((await Book.find().lean()).map((b) => [b.bookCode, b]));

  for (const d of DEMO_TICKETS) {
    const author = authors.get(d.authorCode)!;
    const createdAt = hoursAgo(d.ageHours);
    const number = 1000 + (await nextSequence('ticket'));
    const msgs = d.messages ?? [];
    const publicAdminMsgs = msgs.filter((m) => m.kind === 'public' && m.role === 'admin');
    const lastPublic = msgs.filter((m) => m.kind === 'public').sort((a, b) => a.ageHours - b.ageHours)[0];
    const awaiting = !lastPublic || lastPublic.role === 'author';
    const isActive = d.status === 'Open' || d.status === 'In Progress';
    const firstReply = publicAdminMsgs.sort((a, b) => b.ageHours - a.ageHours)[0];
    const lastActivity = msgs.length ? hoursAgo(Math.min(...msgs.map((m) => m.ageHours))) : createdAt;

    const awaitingResponseSince = isActive && awaiting ? (lastPublic ? hoursAgo(lastPublic.ageHours) : createdAt) : null;
    const ticket = await Ticket.create({
      number,
      author: author._id,
      book: d.bookCode ? books.get(d.bookCode)!._id : null,
      subject: d.subject,
      description: d.description,
      status: d.status,
      isActive,
      category: d.category,
      categorySource: 'seed',
      priority: d.priority,
      prioritySource: 'seed',
      priorityRank: PRIORITY_RANK[d.priority],
      priorityReason: d.rationale,
      triage: { status: 'done', model: 'seed-fixture', confidence: null, rationale: d.rationale, error: null, at: createdAt },
      assignedTo: d.assignedTo ? admins.get(d.assignedTo)!._id : null,
      awaitingResponseSince,
      slaDueAt: computeSlaDueAt({ status: d.status, priority: d.priority, awaitingResponseSince }),
      firstResponseAt: firstReply ? hoursAgo(firstReply.ageHours) : null,
      resolvedAt: d.status === 'Resolved' || d.status === 'Closed' ? hoursAgo(Math.max(0, (msgs.at(-1)?.ageHours ?? 1))) : null,
      closedAt: d.status === 'Closed' ? hoursAgo(msgs.at(-1)?.ageHours ?? 1) : null,
      lastActivityAt: lastActivity,
      createdAt,
    });

    await Message.create({ ticket: ticket._id, kind: 'event', senderRole: 'system', senderName: 'System', body: 'Ticket created by the author.', createdAt });
    for (const m of msgs) {
      const admin = m.admin ? admins.get(m.admin) : undefined;
      await Message.create({
        ticket: ticket._id,
        kind: m.kind,
        senderRole: m.role,
        sender: admin?._id ?? null,
        senderName: m.role === 'admin' ? (admin?.name ?? 'BookLeaf Support') : m.role === 'author' ? author.name : 'System',
        body: m.body,
        createdAt: hoursAgo(m.ageHours),
      });
    }
  }
  return DEMO_TICKETS.length;
}

/** Seeds only if the database has no authors yet (used by AUTO_SEED on first boot). */
export async function seedIfEmpty() {
  if ((await Author.estimatedDocumentCount()) > 0) return null;
  return seedDatabase({ demoTickets: true });
}
