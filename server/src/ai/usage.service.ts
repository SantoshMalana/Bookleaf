import { AiCall, Message, Ticket } from '../models/index.js';
import { aiStatus } from './ai-client.js';
import { env } from '../config/env.js';

/** Aggregates behind the admin "AI usage" page — evidence of cost awareness and degradation behaviour. */
export async function getAiUsage(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);

  const [byKind, failureReasons, triageSources, draftUse] = await Promise.all([
    AiCall.aggregate<{ _id: { kind: string; status: string }; calls: number; inputTokens: number; outputTokens: number; costUsd: number; avgLatencyMs: number }>([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { kind: '$kind', status: '$status' },
          calls: { $sum: 1 },
          inputTokens: { $sum: '$inputTokens' },
          outputTokens: { $sum: '$outputTokens' },
          costUsd: { $sum: '$costUsd' },
          avgLatencyMs: { $avg: '$latencyMs' },
        },
      },
    ]),
    AiCall.aggregate<{ _id: string; count: number }>([
      { $match: { createdAt: { $gte: since }, status: { $in: ['error', 'skipped'] } } },
      { $group: { _id: '$error', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Ticket.aggregate<{ _id: string; count: number }>([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$triage.status', count: { $sum: 1 } } },
    ]),
    Message.aggregate<{ _id: { fromDraft: boolean | null; edited: boolean | null }; count: number }>([
      { $match: { createdAt: { $gte: since }, kind: 'public', senderRole: 'admin' } },
      { $group: { _id: { fromDraft: '$aiAssist.fromDraft', edited: '$aiAssist.edited' }, count: { $sum: 1 } } },
    ]),
  ]);

  const okRows = byKind.filter((r) => r._id.status === 'ok');
  const sum = (rows: typeof byKind, f: 'calls' | 'inputTokens' | 'outputTokens' | 'costUsd') => rows.reduce((s, r) => s + r[f], 0);

  const kindSummary = (kind: 'triage' | 'draft') => {
    const rows = byKind.filter((r) => r._id.kind === kind);
    const ok = rows.filter((r) => r._id.status === 'ok');
    const calls = sum(ok, 'calls');
    return {
      successfulCalls: calls,
      failedCalls: sum(rows.filter((r) => r._id.status === 'error'), 'calls'),
      skippedCalls: sum(rows.filter((r) => r._id.status === 'skipped'), 'calls'),
      avgInputTokens: calls ? Math.round(sum(ok, 'inputTokens') / calls) : 0,
      avgOutputTokens: calls ? Math.round(sum(ok, 'outputTokens') / calls) : 0,
      avgLatencyMs: calls ? Math.round(ok.reduce((s, r) => s + r.avgLatencyMs * r.calls, 0) / calls) : 0,
      costUsd: sum(ok, 'costUsd'),
    };
  };

  const triageCount = (s: string) => triageSources.find((r) => r._id === s)?.count ?? 0;
  const triagedTotal = triageSources.reduce((s, r) => s + r.count, 0);

  let sentAsIs = 0;
  let edited = 0;
  let manual = 0;
  for (const r of draftUse) {
    if (r._id.fromDraft) (r._id.edited ? (edited += r.count) : (sentAsIs += r.count));
    else manual += r.count;
  }

  return {
    windowDays: days,
    config: { ...aiStatus(), priceInPerMTok: env.llm.priceInPerMTok, priceOutPerMTok: env.llm.priceOutPerMTok },
    totals: {
      successfulCalls: sum(okRows, 'calls'),
      inputTokens: sum(okRows, 'inputTokens'),
      outputTokens: sum(okRows, 'outputTokens'),
      costUsd: sum(okRows, 'costUsd'),
    },
    triage: {
      ...kindSummary('triage'),
      aiClassified: triageCount('done'),
      fallbackClassified: triageCount('fallback'),
      pending: triageCount('pending'),
      fallbackRate: triagedTotal ? (triageCount('fallback') / triagedTotal) : 0,
    },
    draft: {
      ...kindSummary('draft'),
      repliesSentAsIs: sentAsIs,
      repliesSentEdited: edited,
      repliesWrittenManually: manual,
    },
    failureReasons: failureReasons.map((r) => ({ reason: r._id ?? 'unknown', count: r.count })),
  };
}
