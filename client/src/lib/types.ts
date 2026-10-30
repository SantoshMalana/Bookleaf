/** Shapes returned by the REST API (mirrors the server DTOs). */

export type Role = 'author' | 'admin';
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
export const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'] as const;
export type Status = (typeof STATUSES)[number];
export type Source = 'pending' | 'ai' | 'fallback' | 'admin' | 'seed';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  authorId: string | null;
}

export type PayoutState = 'not_applicable' | 'settled' | 'below_threshold' | 'overdue' | 'scheduled';

export interface Book {
  id: string;
  bookCode: string;
  title: string;
  isbn: string;
  genre: string;
  publicationDate: string | null;
  status: string;
  isLive: boolean;
  mrp: number | null;
  royaltyPerCopy: number | null;
  totalCopiesSold: number;
  totalRoyaltyEarned: number;
  royaltyPaid: number;
  royaltyPending: number;
  lastRoyaltyPayoutDate: string | null;
  printPartner: string | null;
  availableOn: string[];
  production: {
    isLive: boolean;
    stage: string;
    stageIndex: number;
    stages: Array<{ name: string; state: 'done' | 'current' | 'upcoming' }>;
    commonDelayStage: boolean;
  };
  payout: {
    state: PayoutState;
    nextPayoutDate: string | null;
    overdueSince: string | null;
    daysOverdue: number | null;
    shortfallToThreshold: number | null;
    summary: string;
  };
  author?: { name: string; authorCode: string } | null;
}

export interface Me {
  user: User;
  author?: { id: string; authorCode: string; name: string; email: string; phone: string; city: string; joinedDate: string };
  royalty?: { totalEarned: number; totalPaid: number; totalPending: number; nextPayoutDate: string | null; overdueBooks: number; belowThreshold: boolean };
  books?: { total: number; live: number; inProduction: number };
  tickets?: { active: number; total: number };
}

export interface Message {
  id: string;
  kind: 'public' | 'internal' | 'event';
  senderRole: 'author' | 'admin' | 'system';
  senderName: string;
  body: string;
  createdAt: string;
  aiAssist?: { fromDraft: boolean; edited: boolean } | null;
}

export interface AuthorTicket {
  id: string;
  ticketId: string;
  number: number;
  subject: string;
  description: string;
  status: Status;
  book: { id: string; title: string; bookCode: string } | null;
  attachments: Array<{ name: string; size: number; type: string }>;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  replyCount: number;
  messages?: Message[];
}

export interface Draft {
  body: string;
  source: 'ai' | 'template';
  verifyBeforeSending: string[];
  needsEscalation: boolean;
  escalationTeam: string;
  model: string | null;
  generatedAt: string;
  cached?: boolean;
}

export interface AdminTicket {
  id: string;
  ticketId: string;
  number: number;
  subject: string;
  description: string;
  status: Status;
  category: Category | null;
  categorySource: Source;
  priority: Priority;
  prioritySource: Source;
  priorityReason: string | null;
  triage: { status: 'pending' | 'done' | 'fallback' | 'failed'; model: string | null; confidence: number | null; rationale: string | null; error: string | null; at: string | null };
  author: { id: string; name: string; authorCode: string; email: string };
  book: { id: string; title: string; bookCode: string; status: string } | null;
  assignedTo: { id: string; name: string } | null;
  attachments: Array<{ name: string; size: number; type: string }>;
  isActive: boolean;
  awaitingResponseSince: string | null;
  slaDueAt: string | null;
  isOverdue: boolean;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  lastActivityAt: string;
  messages?: Message[];
  draft?: Draft | null;
}

export interface Page<T> {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface QueueStats {
  total: number;
  active: number;
  byStatus: Record<Status, number>;
  activeByPriority: Record<Priority, number>;
  overdue: number;
  unassigned: number;
  assignedToMe: number;
  awaitingResponse: number;
  avgFirstResponseHours: number | null;
}

export interface AiUsage {
  windowDays: number;
  config: { configured: boolean; provider: string; model: string; circuit: 'closed' | 'open' | 'half-open'; retryAfterMs: number; priceInPerMTok: number; priceOutPerMTok: number };
  totals: { successfulCalls: number; inputTokens: number; outputTokens: number; costUsd: number };
  triage: {
    successfulCalls: number; failedCalls: number; skippedCalls: number; avgInputTokens: number; avgOutputTokens: number; avgLatencyMs: number; costUsd: number;
    aiClassified: number; fallbackClassified: number; pending: number; fallbackRate: number;
  };
  draft: {
    successfulCalls: number; failedCalls: number; skippedCalls: number; avgInputTokens: number; avgOutputTokens: number; avgLatencyMs: number; costUsd: number;
    repliesSentAsIs: number; repliesSentEdited: number; repliesWrittenManually: number;
  };
  failureReasons: Array<{ reason: string; count: number }>;
}

export interface DemoAccounts {
  authorPassword: string;
  adminPassword: string;
  accounts: Array<{ name: string; email: string; role: Role; city: string | null }>;
}
