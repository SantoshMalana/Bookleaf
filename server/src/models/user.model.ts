import { Schema, model, type Types } from 'mongoose';
import { ROLES, type Role } from '../config/constants.js';

export interface IUser {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  role: Role;
  /** Link to the publishing profile; only set for role=author. */
  author: Types.ObjectId | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ROLES, required: true, index: true },
    author: { type: Schema.Types.ObjectId, ref: 'Author', default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const User = model<IUser>('User', userSchema);
