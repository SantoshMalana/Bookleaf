import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';

export const inr = (n: number | null | undefined): string => (n == null ? '—' : `₹${n.toLocaleString('en-IN')}`);

export const num = (n: number | null | undefined): string => (n == null ? '—' : n.toLocaleString('en-IN'));

const toDate = (v: string | Date) => (typeof v === 'string' ? parseISO(v) : v);

/** 5 Jul 2024 */
export const day = (v: string | Date | null | undefined): string => (v ? format(toDate(v), 'd MMM yyyy') : '—');

/** 5 Jul 2024, 3:42 pm */
export const dateTime = (v: string | Date): string => format(toDate(v), 'd MMM yyyy, h:mm a');

/** "3 hours ago" */
export const ago = (v: string | Date): string => formatDistanceToNowStrict(toDate(v), { addSuffix: true });

/** Compact age: "3d", "5h", "12m" */
export function age(v: string | Date): string {
  const ms = Date.now() - toDate(v).getTime();
  const m = Math.max(0, Math.floor(ms / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** SLA label: "Overdue by 2d" / "Due in 5h". */
export function slaLabel(due: string | null, overdue: boolean): string | null {
  if (!due) return null;
  const ms = toDate(due).getTime() - Date.now();
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3_600_000);
  const text = h < 1 ? `${Math.max(1, Math.floor(abs / 60_000))}m` : h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`;
  return overdue || ms < 0 ? `Overdue by ${text}` : `Due in ${text}`;
}

export const fileSize = (bytes: number): string => (bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;
