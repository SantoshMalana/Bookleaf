import { Schema, model, type Types } from 'mongoose';

/**
 * Books are a separate collection (not nested under the author as in the source JSON):
 * tickets reference a single book, admins query across books, and the royalty figures
 * are updated per book.
 *
 * Money is stored in whole rupees, exactly as in the dataset. Production books carry
 * null for fields that do not exist yet (publication date, MRP, royalty rate…).
 */
export interface IBook {
  _id: Types.ObjectId;
  bookCode: string;
  author: Types.ObjectId;
  title: string;
  isbn: string;
  genre: string;
  publicationDate: Date | null;
  status: string;
  mrp: number | null;
  royaltyPerCopy: number | null;
  totalCopiesSold: number;
  totalRoyaltyEarned: number;
  royaltyPaid: number;
  royaltyPending: number;
  lastRoyaltyPayoutDate: Date | null;
  printPartner: string | null;
  availableOn: string[];
  createdAt: Date;
  updatedAt: Date;
}

const bookSchema = new Schema<IBook>(
  {
    bookCode: { type: String, required: true, unique: true },
    author: { type: Schema.Types.ObjectId, ref: 'Author', required: true, index: true },
    title: { type: String, required: true },
    isbn: { type: String, required: true },
    genre: { type: String, default: '' },
    publicationDate: { type: Date, default: null },
    status: { type: String, required: true },
    mrp: { type: Number, default: null },
    royaltyPerCopy: { type: Number, default: null },
    totalCopiesSold: { type: Number, default: 0, min: 0 },
    totalRoyaltyEarned: { type: Number, default: 0, min: 0 },
    royaltyPaid: { type: Number, default: 0, min: 0 },
    royaltyPending: { type: Number, default: 0, min: 0 },
    lastRoyaltyPayoutDate: { type: Date, default: null },
    printPartner: { type: String, default: null },
    availableOn: { type: [String], default: [] },
  },
  { timestamps: true },
);

export const Book = model<IBook>('Book', bookSchema);
