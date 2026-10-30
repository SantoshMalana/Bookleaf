import type { IBook } from '../../models/index.js';
import { getPayoutInfo, type PayoutInfo } from '../../domain/royalty.js';
import { getProductionInfo, type ProductionInfo } from '../../domain/production.js';
import { toISODate } from '../../lib/clock.js';

export interface BookDto {
  id: string;
  bookCode: string;
  authorId: string;
  title: string;
  isbn: string;
  genre: string;
  publicationDate: string | null;
  status: string;
  isLive: boolean;
  mrp: number | null;
  royaltyPerCopy: number | null;
  totalCopiesSold: number;
  totalRoyaltyEarned: number;
  royaltyPaid: number;
  royaltyPending: number;
  lastRoyaltyPayoutDate: string | null;
  printPartner: string | null;
  availableOn: string[];
  production: ProductionInfo;
  payout: PayoutInfo;
}

/**
 * Presents a book together with the facts derived from it (production stage, payout state).
 * `authorPendingTotal` is needed because the ₹1,000 payout threshold is account-level.
 */
export function toBookDto(book: IBook, authorPendingTotal: number, now: Date): BookDto {
  const production = getProductionInfo(book.status);
  return {
    id: String(book._id),
    bookCode: book.bookCode,
    authorId: String(book.author),
    title: book.title,
    isbn: book.isbn,
    genre: book.genre,
    publicationDate: toISODate(book.publicationDate),
    status: book.status,
    isLive: production.isLive,
    mrp: book.mrp,
    royaltyPerCopy: book.royaltyPerCopy,
    totalCopiesSold: book.totalCopiesSold,
    totalRoyaltyEarned: book.totalRoyaltyEarned,
    royaltyPaid: book.royaltyPaid,
    royaltyPending: book.royaltyPending,
    lastRoyaltyPayoutDate: toISODate(book.lastRoyaltyPayoutDate),
    printPartner: book.printPartner,
    availableOn: book.availableOn,
    production,
    payout: getPayoutInfo(book, authorPendingTotal, now),
  };
}

export const sumPending = (books: Array<Pick<IBook, 'royaltyPending'>>): number =>
  books.reduce((s, b) => s + b.royaltyPending, 0);
