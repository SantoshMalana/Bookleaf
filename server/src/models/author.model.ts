import { Schema, model, type Types } from 'mongoose';

export interface IAuthor {
  _id: Types.ObjectId;
  /** Business key from the source dataset, e.g. AUTH001. */
  authorCode: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  joinedDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const authorSchema = new Schema<IAuthor>(
  {
    authorCode: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String, default: '' },
    city: { type: String, default: '' },
    joinedDate: { type: Date, required: true },
  },
  { timestamps: true },
);

export const Author = model<IAuthor>('Author', authorSchema);
