/**
 * Daily AI spend ceiling.
 *
 * A circuit breaker protects us from a *failing* provider; this protects the wallet from a
 * *working* one (a spam burst, a loop, a bug that regenerates drafts). Spend is the sum of
 * `AiCall.costUsd` since 00:00 UTC. It is cached for a few seconds so the check costs nothing
 * on the hot path, and bumped locally after every successful call so a burst cannot overshoot
 * by more than the calls already in flight. When the ceiling is reached, AI calls are refused
 * with reason `budget_exceeded` and the app degrades exactly as it does when the AI is down
 * (rule-based triage, template drafts) until the next UTC day. `AI_DAILY_BUDGET_USD=0` disables it.
 */
import { env } from '../config/env.js';
import { AiCall } from '../models/index.js';

const CACHE_MS = 10_000;
let cache: { day: string; spent: number; at: number } | null = null;
let override: number | null = null;

const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);

export const dailyBudgetUsd = (): number => override ?? env.AI_DAILY_BUDGET_USD;

export async function spentTodayUsd(): Promise<number> {
  const day = utcDay();
  if (cache && cache.day === day && Date.now() - cache.at < CACHE_MS) return cache.spent;
  const start = new Date(`${day}T00:00:00.000Z`);
  const [row] = await AiCall.aggregate<{ total: number }>([
    { $match: { createdAt: { $gte: start }, status: 'ok' } },
    { $group: { _id: null, total: { $sum: '$costUsd' } } },
  ]);
  cache = { day, spent: row?.total ?? 0, at: Date.now() };
  return cache.spent;
}

/** Called after every successful call so the cached figure never lags far behind reality. */
export function noteSpend(usd: number): void {
  if (cache && cache.day === utcDay()) cache.spent += usd;
}

export async function budgetExhausted(): Promise<boolean> {
  const cap = dailyBudgetUsd();
  if (!cap || cap <= 0) return false;
  return (await spentTodayUsd()) >= cap;
}

/** Tests only. */
export function __setBudgetForTests(usd: number | null): void {
  override = usd;
  cache = null;
}
