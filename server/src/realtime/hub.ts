/**
 * In-process publish/subscribe hub that feeds the Server-Sent Events endpoint.
 *
 * Events carry only identifiers ("ticket X changed"); clients re-fetch through the normal
 * REST API, so authorization is always enforced by the API and never by the event payload.
 * Authors only receive events for their own tickets; admins receive all of them.
 *
 * Scaling note: this is per-process. Running more than one API instance needs a shared bus
 * (Redis pub/sub, Mongo change streams) — documented as a known limitation.
 */
import type { Role } from '../config/constants.js';

export type TicketEventType = 'ticket.created' | 'ticket.updated' | 'ticket.message' | 'ticket.triaged' | 'ticket.draft';

export interface TicketEvent {
  type: TicketEventType;
  ticketId: string;
  ticketNumber: number;
  /** Owner of the ticket; used to route events to the right author. */
  authorId: string;
  /** True when the change is visible to the author (reply, status change). */
  authorVisible: boolean;
}

interface Subscriber {
  id: number;
  role: Role;
  authorId: string | null;
  send: (event: TicketEvent) => void;
}

class Hub {
  private subs = new Map<number, Subscriber>();
  private seq = 0;

  subscribe(role: Role, authorId: string | null, send: (e: TicketEvent) => void): () => void {
    const id = ++this.seq;
    this.subs.set(id, { id, role, authorId, send });
    return () => this.subs.delete(id);
  }

  publish(event: TicketEvent): void {
    for (const s of this.subs.values()) {
      const allowed = s.role === 'admin' || (s.authorId === event.authorId && event.authorVisible);
      if (!allowed) continue;
      try {
        s.send(event);
      } catch {
        this.subs.delete(s.id); // broken socket; it will also unsubscribe on 'close'
      }
    }
  }

  get size(): number {
    return this.subs.size;
  }
}

export const hub = new Hub();
