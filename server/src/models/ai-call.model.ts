import { Schema, model, type Types } from 'mongoose';

/** One row per LLM call (or skipped/failed attempt) — the raw data behind the AI usage page. */
export interface IAiCall {
  _id: Types.ObjectId;
  ticket: Types.ObjectId | null;
  kind: 'triage' | 'draft';
  provider: string;
  model: string;
  status: 'ok' | 'error' | 'skipped';
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
  error: string | null;
  createdAt: Date;
}

const aiCallSchema = new Schema<IAiCall>(
  {
    ticket: { type: Schema.Types.ObjectId, ref: 'Ticket', default: null },
    kind: { type: String, enum: ['triage', 'draft'], required: true },
    provider: { type: String, required: true },
    model: { type: String, required: true },
    status: { type: String, enum: ['ok', 'error', 'skipped'], required: true },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    latencyMs: { type: Number, default: 0 },
    costUsd: { type: Number, default: 0 },
    error: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

aiCallSchema.index({ createdAt: -1 });

export const AiCall = model<IAiCall>('AiCall', aiCallSchema);
