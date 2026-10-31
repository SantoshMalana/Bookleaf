/**
 * Single choke-point for every LLM call. Responsibilities:
 *   1. refuse fast when AI is not configured or the circuit breaker is open,
 *   2. enforce a hard timeout,
 *   3. translate provider-specific failures into one AiUnavailableError(reason),
 *   4. validate the model's output against a Zod schema (never trust model output),
 *   5. record tokens / latency / cost for every attempt (AI usage page, cost awareness).
 *
 * Callers (triage, draft) catch AiUnavailableError and degrade gracefully.
 */
import type { ZodType, ZodTypeDef } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { AiCall } from '../models/index.js';
import { budgetExhausted, noteSpend } from './budget.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { AiUnavailableError, getProvider, type LlmProvider } from './providers/index.js';
import type { AiFailureReason, LlmRequest } from './providers/types.js';

export const breaker = new CircuitBreaker(env.AI_BREAKER_THRESHOLD, env.AI_BREAKER_COOLDOWN_MS);

export interface AiRunResult<T> {
  data: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export function costOf(inputTokens: number, outputTokens: number): number {
  return (inputTokens * env.llm.priceInPerMTok + outputTokens * env.llm.priceOutPerMTok) / 1_000_000;
}

function classifyError(err: unknown): { reason: AiFailureReason; message: string } {
  const e = err as { status?: number; name?: string; message?: string; code?: string };
  const msg = e?.message ?? String(err);
  if (e?.status === 429) return { reason: 'rate_limited', message: 'Provider rate limit reached' };
  if (e?.status === 401 || e?.status === 403) return { reason: 'auth', message: 'Provider rejected the API key' };
  if (/timeout|timed out|ETIMEDOUT|AbortError/i.test(`${e?.name} ${msg} ${e?.code}`)) return { reason: 'timeout', message: 'Provider timed out' };
  return { reason: 'provider_error', message: msg.slice(0, 200) };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`AI call exceeded ${ms}ms`), { name: 'TimeoutError' })), ms);
  });
  return Promise.race([p, guard]).finally(() => clearTimeout(timer));
}

async function record(row: {
  ticketId: string | null;
  kind: 'triage' | 'draft';
  provider: LlmProvider | null;
  status: 'ok' | 'error' | 'skipped';
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  error?: string | null;
  model?: string;
}): Promise<void> {
  try {
    const inTok = row.inputTokens ?? 0;
    const outTok = row.outputTokens ?? 0;
    await AiCall.create({
      ticket: row.ticketId,
      kind: row.kind,
      provider: row.provider?.name ?? env.llm.provider,
      model: row.model ?? row.provider?.model ?? env.llm.model,
      status: row.status,
      inputTokens: inTok,
      outputTokens: outTok,
      latencyMs: row.latencyMs ?? 0,
      costUsd: row.status === 'ok' ? costOf(inTok, outTok) : 0,
      error: row.error ?? null,
    });
  } catch (err) {
    logger.warn({ err }, 'failed to record AI usage row'); // telemetry must never break a request
  }
}

export async function runStructured<T>(args: {
  kind: 'triage' | 'draft';
  ticketId: string | null;
  request: LlmRequest;
  schema: ZodType<T, ZodTypeDef, unknown>;
}): Promise<AiRunResult<T>> {
  const provider = getProvider();

  if (!provider) {
    await record({ ticketId: args.ticketId, kind: args.kind, provider: null, status: 'skipped', error: 'not_configured' });
    throw new AiUnavailableError('not_configured', 'No LLM provider is configured');
  }
  if (!breaker.allow()) {
    await record({ ticketId: args.ticketId, kind: args.kind, provider, status: 'skipped', error: 'circuit_open' });
    throw new AiUnavailableError('circuit_open', 'AI temporarily paused after repeated failures');
  }

  if (await budgetExhausted()) {
    logger.warn({ kind: args.kind }, 'daily AI budget reached — using fallback until the next UTC day');
    await record({ ticketId: args.ticketId, kind: args.kind, provider, status: 'skipped', error: 'budget_exceeded' });
    throw new AiUnavailableError('budget_exceeded', 'Daily AI budget reached');
  }

  const started = Date.now();
  let result;
  try {
    result = await withTimeout(provider.callStructured(args.request), env.AI_TIMEOUT_MS * (env.AI_MAX_RETRIES + 1) + 2000);
  } catch (err) {
    breaker.failure();
    const { reason, message } = classifyError(err);
    logger.warn({ reason, kind: args.kind, provider: provider.name }, `LLM call failed: ${message}`);
    await record({ ticketId: args.ticketId, kind: args.kind, provider, status: 'error', latencyMs: Date.now() - started, error: reason });
    throw new AiUnavailableError(reason, message);
  }

  const latencyMs = Date.now() - started;
  const parsed = args.schema.safeParse(result.data);
  if (!parsed.success) {
    // The provider answered, so it is healthy — don't trip the breaker for a bad completion.
    breaker.success();
    logger.warn({ kind: args.kind, issues: parsed.error.issues.slice(0, 3) }, 'LLM output failed validation');
    await record({
      ticketId: args.ticketId,
      kind: args.kind,
      provider,
      status: 'error',
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs,
      error: 'invalid_output',
      model: result.model,
    });
    throw new AiUnavailableError('invalid_output', 'Model returned output that did not match the expected schema');
  }

  breaker.success();
  noteSpend(costOf(result.inputTokens, result.outputTokens));
  await record({
    ticketId: args.ticketId,
    kind: args.kind,
    provider,
    status: 'ok',
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    latencyMs,
    model: result.model,
  });
  return { data: parsed.data, model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
}

export function aiStatus() {
  const p = getProvider();
  return {
    configured: Boolean(p),
    provider: p?.name ?? 'none',
    model: p?.model ?? 'none',
    circuit: breaker.state,
    retryAfterMs: breaker.retryAfterMs(),
  };
}
