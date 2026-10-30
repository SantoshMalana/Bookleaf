import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth';
import { useToast } from './toast';

export type LiveState = 'connecting' | 'live' | 'offline';

interface TicketEvent {
  type: 'ticket.created' | 'ticket.updated' | 'ticket.message' | 'ticket.triaged' | 'ticket.draft';
  ticketId: string;
  ticketNumber: number;
  authorVisible: boolean;
}

/** Call right before a mutation the user triggered, so we don't toast them about their own action. */
let lastOwnAction = 0;
export const markOwnAction = () => {
  lastOwnAction = Date.now();
};

/**
 * Subscribes to the server's SSE stream and refreshes whatever data the event touches.
 * Events only carry ids — data is re-fetched through the normal (authorised) REST API.
 * If the stream is unavailable the 30-second polling on ticket queries still keeps things fresh.
 */
export function useLiveUpdates(): LiveState {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const [state, setState] = useState<LiveState>('connecting');

  useEffect(() => {
    if (!user || typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/v1/events');
    es.addEventListener('ready', () => setState('live'));
    es.onerror = () => setState(es.readyState === EventSource.CLOSED ? 'offline' : 'connecting');

    es.addEventListener('ticket', (raw) => {
      const e = JSON.parse((raw as MessageEvent).data) as TicketEvent;
      void qc.invalidateQueries({ queryKey: ['tickets'] });
      void qc.invalidateQueries({ queryKey: ['ticket', e.ticketId] });
      void qc.invalidateQueries({ queryKey: ['admin'] });
      void qc.invalidateQueries({ queryKey: ['me'] });

      const own = Date.now() - lastOwnAction < 2500;
      const ref = `BL-${e.ticketNumber}`;
      if (own) return;
      if (user.role === 'author') {
        if (e.type === 'ticket.message') toast.push({ tone: 'info', title: `New reply on ${ref}`, body: 'The BookLeaf team responded to your ticket.' });
        else if (e.type === 'ticket.updated' && e.authorVisible) toast.push({ tone: 'info', title: `${ref} was updated` });
      } else if (e.type === 'ticket.created') {
        toast.push({ tone: 'info', title: `New ticket ${ref}`, body: 'A new author query just arrived.' });
      }
    });

    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return state;
}
