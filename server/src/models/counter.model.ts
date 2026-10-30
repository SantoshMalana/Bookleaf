import { Schema, model } from 'mongoose';

interface ICounter {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<ICounter>({ _id: String, seq: { type: Number, default: 0 } });
const Counter = model<ICounter>('Counter', counterSchema);

/** Atomic, gap-free-ish sequence (safe under concurrent ticket creation). */
export async function nextSequence(name: string): Promise<number> {
  const doc = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return doc.seq;
}
