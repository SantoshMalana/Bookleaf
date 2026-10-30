import { Schema, model, type Types } from 'mongoose';

/**
 * Everything that happens on a ticket after it is raised.
 *
 *  kind = 'public'   → visible to the author (author follow-ups and admin replies)
 *  kind = 'internal' → admin-only notes
 *  kind = 'event'    → admin-only activity log (status changes, AI triage, overrides…)
 *
 * Keeping visibility on the row (instead of three arrays on the ticket) means the
 * author-facing query is a single `kind: 'public'` filter — there is no way to
 * "forget" to strip internal data in a serializer.
 */
export interface IMessage {
  _id: Types.ObjectId;
  ticket: Types.ObjectId;
  kind: 'public' | 'internal' | 'event';
  senderRole: 'author' | 'admin' | 'system';
  sender: Types.ObjectId | null;
  senderName: string;
  body: string;
  /** For admin replies: was an AI draft used, and was it edited before sending? */
  aiAssist: { fromDraft: boolean; edited: boolean } | null;
  createdAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    ticket: { type: Schema.Types.ObjectId, ref: 'Ticket', required: true },
    kind: { type: String, enum: ['public', 'internal', 'event'], required: true },
    senderRole: { type: String, enum: ['author', 'admin', 'system'], required: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    senderName: { type: String, required: true },
    body: { type: String, required: true },
    aiAssist: {
      type: new Schema({ fromDraft: Boolean, edited: Boolean }, { _id: false }),
      default: null,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

messageSchema.index({ ticket: 1, createdAt: 1 });
messageSchema.index({ 'aiAssist.fromDraft': 1 });

export const Message = model<IMessage>('Message', messageSchema);
