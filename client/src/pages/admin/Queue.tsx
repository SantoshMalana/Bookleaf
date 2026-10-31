import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Clock, Inbox, Search, X } from 'lucide-react';
import { Badge, Card, cx, EmptyState, ErrorBanner, inputCls, PageHeader, PriorityBadge, Skeleton, SourceChip, StatTile, StatusBadge } from '../../components/ui';
import { api, qs } from '../../lib/api';
import { age, slaLabel } from '../../lib/format';
import { POLL_MS } from '../../lib/query-client';
import { CATEGORIES, PRIORITIES, STATUSES, type AdminTicket, type Page, type QueueStats } from '../../lib/types';

const PAGE_SIZE = 20;
const FILTER_KEYS = ['status', 'category', 'priority', 'assignee', 'overdue', 'from', 'to', 'q', 'sort'] as const;

const priorityBar: Record<string, string> = { Critical: 'bg-clay', High: 'bg-[#e08a3c]', Medium: 'bg-sky-ink/50', Low: 'bg-line-strong' };

export default function Queue() {
  const [sp, setSp] = useSearchParams();
  const get = (k: string) => sp.get(k) ?? '';
  const page = Math.max(1, Number(sp.get('page')) || 1);

  function set(patch: Record<string, string | null>) {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setSp(next, { replace: true });
  }

  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, get(k)]));
  const hasFilters = FILTER_KEYS.some((k) => k !== 'sort' && get(k));

  const stats = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => api.get<{ data: QueueStats }>('/admin/stats').then((r) => r.data), refetchInterval: POLL_MS });
  const list = useQuery({
    queryKey: ['admin', 'tickets', filters, page],
    queryFn: () => api.get<Page<AdminTicket>>(`/admin/tickets${qs({ ...filters, page, limit: PAGE_SIZE })}`),
    refetchInterval: POLL_MS,
    placeholderData: (prev) => prev,
  });

  const s = stats.data;
  const isActiveView = get('status') === 'Open,In Progress';
  const critHigh = s ? s.activeByPriority.Critical + s.activeByPriority.High : 0;

  return (
    <>
      <PageHeader title="Ticket queue" subtitle="Urgent and overdue tickets float to the top. Triage is done by AI — override anything that looks off." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
        {!s ? (
          Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-[88px]" />)
        ) : (
          <>
            <StatTile label="Active" value={s.active} hint={`${s.total} total`} active={isActiveView && !hasOther(filters, ['status'])} onClick={() => set({ status: 'Open,In Progress', overdue: null, assignee: null, priority: null })} />
            <StatTile label="Critical + High" value={critHigh} tone={critHigh ? 'danger' : 'default'} hint={`${s.activeByPriority.Critical} critical`} active={get('priority') === 'Critical,High'} onClick={() => set({ status: 'Open,In Progress', priority: 'Critical,High', overdue: null, assignee: null })} />
            <StatTile label="Overdue" value={s.overdue} tone={s.overdue ? 'danger' : 'default'} hint="Past SLA, awaiting reply" active={get('overdue') === 'true'} onClick={() => set({ overdue: 'true', status: null, priority: null, assignee: null })} />
            <StatTile label="Unassigned" value={s.unassigned} tone={s.unassigned ? 'warn' : 'default'} hint="Active, no owner" active={get('assignee') === 'unassigned'} onClick={() => set({ assignee: 'unassigned', status: 'Open,In Progress', overdue: null, priority: null })} />
            <StatTile label="Assigned to me" value={s.assignedToMe} hint="Your tickets" active={get('assignee') === 'me'} onClick={() => set({ assignee: 'me', status: null, overdue: null, priority: null })} />
            <StatTile label="Avg. first reply" value={s.avgFirstResponseHours == null ? '—' : `${s.avgFirstResponseHours}h`} hint="Across replied tickets" />
            <StatTile label="Helpful rate" value={s.feedback.rated ? `${Math.round((s.feedback.helpful / s.feedback.rated) * 100)}%` : '—'} tone={s.feedback.rated ? 'good' : 'default'} hint={s.feedback.rated ? `${s.feedback.rated} author ratings` : 'No ratings yet'} />
          </>
        )}
      </div>

      <Card className="mt-5">
        <div className="space-y-3 border-b border-line p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-faint" />
            <input className={cx(inputCls, 'pl-10')} placeholder="Search subject, ticket # or author" value={get('q')} onChange={(e) => set({ q: e.target.value })} aria-label="Search tickets" />
          </div>
          <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-4 xl:grid-cols-8">
            <Select label="Status" value={get('status')} onChange={(v) => set({ status: v })} options={[['Open,In Progress', 'Active'], ...STATUSES.map((x) => [x, x] as [string, string])]} />
            <Select label="Category" value={get('category')} onChange={(v) => set({ category: v })} options={CATEGORIES.map((x) => [x, x])} />
            <Select label="Priority" value={get('priority')} onChange={(v) => set({ priority: v })} options={[['Critical,High', 'Critical + High'], ...PRIORITIES.map((x) => [x, x] as [string, string])]} />
            <Select label="Assignee" value={get('assignee')} onChange={(v) => set({ assignee: v })} options={[['me', 'Me'], ['unassigned', 'Unassigned']]} />
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-muted">From</span>
              <input type="date" className={cx(inputCls, 'w-full px-2.5 text-sm')} value={get('from')} onChange={(e) => set({ from: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-muted">To</span>
              <input type="date" className={cx(inputCls, 'w-full px-2.5 text-sm')} value={get('to')} onChange={(e) => set({ to: e.target.value })} />
            </label>
            <Select label="Sort" value={get('sort')} onChange={(v) => set({ sort: v })} blank="Urgency" options={[['oldest', 'Oldest first'], ['newest', 'Newest first'], ['activity', 'Recent activity']]} />
            {hasFilters ? (
              <button onClick={() => setSp(new URLSearchParams(), { replace: true })} className="mb-2.5 inline-flex items-center gap-1 text-sm font-bold text-brand-700 hover:underline">
                <X className="size-3.5" /> Clear filters
              </button>
            ) : <span />}
          </div>
        </div>

        {list.isError ? (
          <div className="p-4"><ErrorBanner message="Couldn't load the queue." onRetry={() => void list.refetch()} /></div>
        ) : list.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : list.data!.items.length === 0 ? (
          <EmptyState icon={<Inbox className="size-5" />} title={hasFilters ? 'No tickets match these filters' : 'The queue is empty'} body={hasFilters ? 'Try removing a filter.' : 'New author queries will appear here in real time.'} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-line bg-paper/70 text-xs tracking-wide text-muted uppercase">
                  <tr>
                    <th className="w-1.5 p-0" />
                    <th className="px-4 py-2.5 font-medium">Ticket</th>
                    <th className="px-3 py-2.5 font-medium">Category</th>
                    <th className="px-3 py-2.5 font-medium">Priority</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Age / SLA</th>
                    <th className="px-3 py-2.5 font-medium">Owner</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {list.data!.items.map((t) => (
                    <TicketRow key={t.id} t={t} />
                  ))}
                </tbody>
              </table>
            </div>
            <Pager meta={list.data!.meta} onPage={(p) => set({ page: String(p) })} />
          </>
        )}
      </Card>
    </>
  );
}

function hasOther(filters: Record<string, string>, ignore: string[]) {
  return Object.entries(filters).some(([k, v]) => v && !ignore.includes(k) && k !== 'sort');
}

function TicketRow({ t }: { t: AdminTicket }) {
  const sla = t.isActive ? slaLabel(t.slaDueAt, t.isOverdue) : null;
  return (
    <tr className="group relative transition-colors hover:bg-paper/80">
      <td className="p-0"><div className={cx('h-full min-h-[64px] w-1.5', t.isActive ? priorityBar[t.priority] : 'bg-transparent')} /></td>
      <td className="max-w-[340px] px-4 py-3">
        <Link to={`/admin/tickets/${t.id}`} className="block after:absolute after:inset-0">
          <span className="block truncate font-medium text-ink group-hover:text-brand-700">{t.subject}</span>
          <span className="block truncate text-xs text-muted">{t.ticketId} · {t.author.name} · {t.book?.title ?? 'General / Account'}</span>
        </Link>
      </td>
      <td className="px-3 py-3">
        {t.triage.status === 'pending' ? <SourceChip source="pending" /> : (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[13px] font-semibold">{t.category ?? '—'}</span>
            <SourceChip source={t.categorySource} compact />
          </div>
        )}
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <PriorityBadge priority={t.priority} />
          {t.triage.status !== 'pending' && <SourceChip source={t.prioritySource} compact />}
        </div>
      </td>
      <td className="px-3 py-3"><StatusBadge status={t.status} /></td>
      <td className="px-3 py-3">
        <p className="tabular-nums">{age(t.createdAt)}</p>
        {sla && <Badge tone={t.isOverdue ? 'clay' : 'neutral'} className="mt-1"><Clock className="size-3" />{sla}</Badge>}
      </td>
      <td className="px-3 py-3 text-[13px]">{t.assignedTo?.name ?? <span className="text-faint">Unassigned</span>}</td>
    </tr>
  );
}

function Select({ label, value, onChange, options, blank = 'All' }: { label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]>; blank?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-muted">{label}</span>
      <select className={cx(inputCls, 'w-full pr-8')} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{blank}</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function Pager({ meta, onPage }: { meta: Page<unknown>['meta']; onPage: (p: number) => void }) {
  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.total, meta.page * meta.limit);
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-muted">
      <span>{from}–{to} of {meta.total}</span>
      <div className="flex items-center gap-1">
        <button className="grid size-8 place-items-center rounded-lg hover:bg-black/5 disabled:opacity-40" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></button>
        <span className="px-2 tabular-nums">Page {meta.page} / {meta.totalPages}</span>
        <button className="grid size-8 place-items-center rounded-lg hover:bg-black/5 disabled:opacity-40" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)} aria-label="Next page"><ChevronRight className="size-4" /></button>
      </div>
    </div>
  );
}
