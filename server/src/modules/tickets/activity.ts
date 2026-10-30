import { Message } from '../../models/index.js';

/** Admin-only activity log entry (status changes, overrides, AI triage results…). */
export async function logEvent(ticketId: unknown, body: string, actor?: { id: string; name: string }): Promise<void> {
  await Message.create({
    ticket: ticketId,
    kind: 'event',
    senderRole: 'system',
    sender: actor?.id ?? null,
    senderName: actor?.name ?? 'System',
    body,
  });
}
