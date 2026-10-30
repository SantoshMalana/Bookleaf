import { LIMITS } from '../config/constants.js';
import { businessNow } from '../lib/clock.js';
import { Author, Book, Message, type IBook, type IAuthor } from '../models/index.js';
import type { ITicket } from '../models/index.js';
import type { ThreadMessage } from './context.js';

export interface LoadedContext {
  author: IAuthor;
  books: IBook[];
  ticketBook: IBook | null;
  thread: ThreadMessage[];
  now: Date;
}

/** Loads exactly what the context builders need: the author, their books, and the last few public messages. */
export async function loadTicketContext(ticket: ITicket): Promise<LoadedContext | null> {
  const [author, books, recent] = await Promise.all([
    Author.findById(ticket.author).lean<IAuthor>(),
    Book.find({ author: ticket.author }).sort({ bookCode: 1 }).lean<IBook[]>(),
    Message.find({ ticket: ticket._id, kind: 'public' }).sort({ createdAt: -1 }).limit(LIMITS.aiThreadMessages).lean(),
  ]);
  if (!author) return null;
  const ticketBook = ticket.book ? (books.find((b) => String(b._id) === String(ticket.book)) ?? null) : null;
  const thread: ThreadMessage[] = recent
    .reverse()
    .map((m) => ({ senderRole: m.senderRole === 'admin' ? 'admin' : 'author', body: m.body, createdAt: m.createdAt }));
  return { author, books, ticketBook, thread, now: businessNow() };
}
