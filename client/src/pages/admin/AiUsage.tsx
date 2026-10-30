import { useQuery } from '@tanstack/react-query';
import { Bot, Zap } from 'lucide-react';
import { Badge, Card, CardHeader, ErrorBanner, PageHeader, Skeleton, StatTile } from '../../components/ui';
import { api } from '../../lib/api';
import { num } from '../../lib/format';
import type { AiUsage } from '../../lib/types';

const usd = (n: number) => `$${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`;

export default function AiUsagePage() {
  const q = useQuery({ queryKey: ['admin', 'ai-usage'], queryFn: () => api.get<{ data: AiUsage }>('/admin/ai/usage').then((r) => r.data) });
  if (q.isError) return <ErrorBanner message="Couldn't load AI usage." onRetry={() => void q.refetch()} />;
  const u = q.data;

  return (
    <>
      <PageHeader title="AI usage & health" subtitle={`Cost, latency and fallbacks over the last ${u?.windowDays ?? 30} days. Triage and drafting are tracked separately.`} />
      {!u ? (
        <div className="grid gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <div className="space-y-5">
          <Card>
            <CardHeader title="Provider" action={<Badge tone={u.config.configured ? 'ok' : 'amber'}>{u.config.configured ? 'Configured' : 'Not configured — fallback mode'}</Badge>} />
            <dl className="grid gap-4 p-5 text-sm sm:grid-cols-4">
              <div><dt className="text-xs text-muted">Provider</dt><dd className="mt-0.5 font-medium">{u.config.provider}</dd></div>
              <div><dt className="text-xs text-muted">Model</dt><dd className="mt-0.5 font-medium">{u.config.model}</dd></div>
              <div><dt className="text-xs text-muted">Circuit breaker</dt><dd className="mt-0.5"><Badge tone={u.config.circuit === 'closed' ? 'ok' : 'clay'}>{u.config.circuit}</Badge></dd></div>
              <div><dt className="text-xs text-muted">List price (per M tokens)</dt><dd className="mt-0.5 font-medium tabular-nums">${u.config.priceInPerMTok} in / ${u.config.priceOutPerMTok} out</dd></div>
            </dl>
          </Card>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Successful calls" value={num(u.totals.successfulCalls)} />
            <StatTile label="Input tokens" value={num(u.totals.inputTokens)} />
            <StatTile label="Output tokens" value={num(u.totals.outputTokens)} />
            <StatTile label="Estimated cost" value={usd(u.totals.costUsd)} tone="good" />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Auto-triage" subtitle="Category + priority on ticket creation" action={<Zap className="size-4 text-brand-600" />} />
              <Rows rows={[
                ['Classified by AI', num(u.triage.aiClassified)],
                ['Rule-based fallback', `${num(u.triage.fallbackClassified)} (${Math.round(u.triage.fallbackRate * 100)}%)`],
                ['Pending now', num(u.triage.pending)],
                ['Successful / failed / skipped calls', `${u.triage.successfulCalls} / ${u.triage.failedCalls} / ${u.triage.skippedCalls}`],
                ['Avg tokens in / out', `${num(Math.round(u.triage.avgInputTokens))} / ${num(Math.round(u.triage.avgOutputTokens))}`],
                ['Avg latency', `${Math.round(u.triage.avgLatencyMs)} ms`],
                ['Cost', usd(u.triage.costUsd)],
              ]} />
            </Card>
            <Card>
              <CardHeader title="Draft replies" subtitle="Generated when an admin opens a ticket" action={<Bot className="size-4 text-brand-600" />} />
              <Rows rows={[
                ['Sent as drafted', num(u.draft.repliesSentAsIs)],
                ['Sent after editing', num(u.draft.repliesSentEdited)],
                ['Written manually', num(u.draft.repliesWrittenManually)],
                ['Successful / failed / skipped calls', `${u.draft.successfulCalls} / ${u.draft.failedCalls} / ${u.draft.skippedCalls}`],
                ['Avg tokens in / out', `${num(Math.round(u.draft.avgInputTokens))} / ${num(Math.round(u.draft.avgOutputTokens))}`],
                ['Avg latency', `${Math.round(u.draft.avgLatencyMs)} ms`],
                ['Cost', usd(u.draft.costUsd)],
              ]} />
            </Card>
          </div>

          <Card>
            <CardHeader title="Failure reasons" />
            {u.failureReasons.length === 0 ? (
              <p className="p-5 text-sm text-muted">No AI failures recorded in this window.</p>
            ) : (
              <ul className="divide-y divide-line">{u.failureReasons.map((f) => <li key={f.reason} className="flex justify-between px-5 py-3 text-sm"><span>{f.reason}</span><span className="tabular-nums text-muted">{f.count}</span></li>)}</ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

function Rows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="divide-y divide-line">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 px-5 py-2.5 text-sm"><dt className="text-muted">{k}</dt><dd className="font-medium tabular-nums">{v}</dd></div>
      ))}
    </dl>
  );
}
