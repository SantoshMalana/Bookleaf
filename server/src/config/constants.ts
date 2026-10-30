/**
 * Shared domain constants. Everything that encodes a BookLeaf business rule or a
 * fixed vocabulary (categories, statuses, SLAs…) lives here so that the API,
 * the AI layer and the seed script can never drift apart.
 */

export const CATEGORIES = [
  'Royalty & Payments',
  'ISBN & Metadata Issues',
  'Printing & Quality',
  'Distribution & Availability',
  'Book Status & Production Updates',
  'General Inquiry',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_RANK: Record<Priority, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };

/** First-response targets (hours) used for the "overdue" flag in the admin queue. */
export const SLA_HOURS: Record<Priority, number> = { Critical: 4, High: 24, Medium: 48, Low: 72 };

export const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'] as const;
export type Status = (typeof STATUSES)[number];
export const ACTIVE_STATUSES: readonly Status[] = ['Open', 'In Progress'];

export const ROLES = ['author', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** Where a category / priority value came from. Shown as a badge in the admin UI. */
export const SOURCES = ['pending', 'ai', 'fallback', 'admin', 'seed'] as const;
export type Source = (typeof SOURCES)[number];

export const TRIAGE_STATUSES = ['pending', 'done', 'fallback', 'failed'] as const;
export type TriageStatus = (typeof TRIAGE_STATUSES)[number];

/** Pipeline from the BookLeaf Knowledge Base ("Production Stages"). */
export const PRODUCTION_STAGES = [
  'Manuscript Received',
  'Editing',
  'Cover Design',
  'Typesetting',
  'Proofreading',
  'ISBN Assignment',
  'Printing',
  'Distribution Setup',
  'Published & Live',
] as const;

export const PLATFORMS = ['Amazon India', 'Flipkart', 'Amazon US', 'Amazon UK', 'BookLeaf Store'] as const;

/** Royalty policy from the Knowledge Base. */
export const PAYOUT_THRESHOLD_INR = 1000;
export const PAYOUT_WINDOW_DAYS = 45;

export const LIVE_STATUS = 'Published & Live';

export const LIMITS = {
  subjectMax: 150,
  descriptionMin: 10,
  descriptionMax: 4000,
  messageMax: 4000,
  noteMax: 2000,
  /** Characters of author text forwarded to the LLM (cost control + injection surface). */
  aiTicketChars: 2000,
  aiMessageChars: 600,
  aiThreadMessages: 4,
} as const;
