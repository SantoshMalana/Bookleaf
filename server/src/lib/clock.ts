import { env } from '../config/env.js';

/**
 * "Today" for *derived business facts* (next payout date, overdue royalty…).
 * Defaults to the wall clock; REFERENCE_DATE lets a reviewer pin it for repeatable demos.
 * Database timestamps (createdAt etc.) always use the real clock.
 */
export function businessNow(): Date {
  if (env.REFERENCE_DATE) {
    const d = new Date(env.REFERENCE_DATE);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

export function toISODate(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}
