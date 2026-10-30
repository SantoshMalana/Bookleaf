import { ACTIVE_STATUSES, PRIORITY_RANK, SLA_HOURS, type Priority, type Status } from '../config/constants.js';
import { MS_PER_HOUR } from '../lib/clock.js';

export const rankOf = (p: Priority): number => PRIORITY_RANK[p];

export const isActiveStatus = (s: Status): boolean => ACTIVE_STATUSES.includes(s);

/**
 * The response SLA clock runs only while the ball is in BookLeaf's court
 * (ticket just raised, or the author replied) and the ticket is still active.
 */
export function computeSlaDueAt(input: {
  status: Status;
  priority: Priority;
  awaitingResponseSince: Date | null;
}): Date | null {
  if (!isActiveStatus(input.status) || !input.awaitingResponseSince) return null;
  return new Date(input.awaitingResponseSince.getTime() + SLA_HOURS[input.priority] * MS_PER_HOUR);
}
