import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CheckCheck, Clock, Lock, RefreshCw, Send, Sparkles, UserCheck, UserMinus, Wand2 } from 'lucide-react';
import { prettyDates, ProductionTracker } from '../../components/BookCard';
import { TicketThread } from '../../components/TicketThread';
import { Badge, Button, Card, CardHeader, cx, EmptyState, ErrorBanner, inputCls, PriorityBadge, Skeleton, SourceChip, StatusBadge } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { dateTime, day, inr, slaLabel } from '../../lib/format';
import { POLL_MS } from '../../lib/query-client';
import { markOwnAction } from '../../lib/realtime';
import { useToast } from '../../lib/toast';
import { CATEGORIES, PRIORITIES, STATUSES, type AdminTicket, type Book, type Category, type Draft, type Priority, type Status } from '../../lib/types';

type Tab = 'reply' | 'note';

export default function AdminTicketDetail() {
  const { ticketId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();

  const q = useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: () => api.get<{ data: AdminTicket }>(`/admin/tickets/${ticketId}`).then((r) => r.data),
    refetchInterval: POLL_MS,
    retry: false,
  });
  const t = q.data;

  const books = useQuery({
    queryKey: ['admin', 'author-books', t?.author.id],
    queryFn: () => api.get<{ data: Book[] }>(`/books?authorId=${t!.author.id}`).then((r) => r.data),
    enabled: !!t,
  });

  // ---- composer state ----
  const [tab, setTab] = useState<Tab>('reply');
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [usedDraft, setUsedDraft] = useState(false);
  const touched = useRef(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const requestedKey = useRef<string | null>(null);

  const wantDraft = !!t && t.isActive && !!t.awaitingResponseSince;

  const gen = useMutation({
    mutationFn: (force: boolean) => api.post<{ data: Draft }>(`/admin/tickets/${ticketId}/draft`, { force }).then((r) => r.data),
    onSuccess: (d, force) => {
      setDraft(d);
      setDraftError(null);
      if (force || !touched.current) {
        setReply(d.body);
        setUsedDraft(true);
        touched.current = false;
      }
    },
    onError: (e) => setDraftError(e instanceof ApiError ? e.message : 'Could not generate a draft.'),
  });

  // Reset composer when moving between tickets.
  useEffect(() => {
    setReply('');
    setNote('');
    setDraft(null);
    setDraftError(null);
    setUsedDraft(false);
    touched.current = false;
    requestedKey.current = null;
  }, [ticketId]);

  // Request a draft once per "awaiting reply" state (server dedupes + caches by conversation basis).
  useEffect(() => {
    if (!t || !wantDraft) return;
    const key = `${t.id}:${t.awaitingResponseSince}:${t.category}`;
    if (requestedKey.current === key) return;
    requestedKey.current = key;
    gen.mutate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t?.id, t?.awaitingResponseSince, t?.category, wantDraft]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['ticket', ticketId] });
    void qc.invalidateQueries({ queryKey: ['admin'] });
  };
  const onErr = (title: string) => (e: unknown) => toast.push({ tone: 'error', title, body: e instanceof ApiError ? e.message : undefined });

  const send = useMutation({
    mutationFn: (status?: 'Resolved') => api.post(`/admin/tickets/${ticketId}/replies`, { body: reply, usedDraft, ...(status ? { status } : {}) }),
    onMutate: () => markOwnAction(),
    onSuccess: (_r, status) => {
      toast.push({ tone: 'success', title: status ? 'Reply sent and ticket resolved' : 'Reply sent to the author' });
      setReply('');
      setUsedDraft(false);
      touched.current = false;
      setDraft(null);
      requestedKey.current = null;
      refresh();
    },
    onError: onErr('Could not send the reply'),
  });

  const addNote = useMutation({
    mutationFn: () => api.post(`/admin/tickets/${ticketId}/notes`, { body: note }),
    onMutate: () => markOwnAction(),
    onSuccess: () => {
      setNote('');
      toast.push({ tone: 'success', title: 'Internal note saved' });
      refresh();
    },
    onError: onErr('Could not save the note'),
  });

  const update = useMutation({
    mutationFn: (patch: { status?: Status; category?: Category; priority?: Priority }) => api.patch(`/admin/tickets/${ticketId}`, patch),
    onMutate: () => markOwnAction(),
    onSuccess: refresh,
    onError: onErr('Could not update the ticket'),
  });

  const assign = useMutation({
    mutationFn: (assignee: 'me' | 'unassigned') => api.put(`/admin/tickets/${ticketId}/assignee`, { assignee }),
    onMutate: () => markOwnAction(),
    onSuccess: refresh,
    onError: onErr('Could not change the assignee'),
  });

  const retriage = useMutation({
    mutationFn: () => api.post(`/admin/tickets/${ticketId}/triage`),
    onMutate: () => markOwnAction(),
    onSuccess: () => {
      toast.push({ tone: 'info', title: 'Triage re-run', body: 'Manual overrides are kept.' });
      refresh();
    },
    onError: onErr('Could not re-run triage'),
  });

  if (q.isError) {
    return q.error instanceof ApiError && q.error.status === 404 ? (
      <EmptyState title="Ticket not found" action={<Link to="/admin"><Button>Back to queue</Button></Link>} />
    ) : (
      <ErrorBanner message="Couldn't load this ticket." onRetry={() => void q.refetch()} />
    );
  }
  if (!t) return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64" /></div>;

  const closed = t.status === 'Closed';
  const sla = t.isActive ? slaLabel(t.slaDueAt, t.isOverdue) : null;
  const book = t.book ? books.data?.find((b) => b.id === t.book!.id) : undefined;
  const mine = books.data ?? [];

  return (
    <>
      <Link to="/admin" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"><ArrowLeft className="size-4" /> Queue</Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">{t.ticketId} · {t.author.name} · {t.book?.title ?? 'General / Account Level'} · {dateTime(t.createdAt)}</p>
          <h1 className="mt-1 text-[26px] leading-tight font-semibold">{t.subject}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PriorityBadge priority={t.priority} />
          <StatusBadge status={t.status} />
          {sla && <Badge tone={t.isOverdue ? 'clay' : 'neutral'}><Clock className="size-3" />{sla}</Badge>}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* ───────── conversation + composer ───────── */}
        <div className="min-w-0 space-y-5">
          <Card className="p-5">
            <TicketThread viewer="admin" firstMessage={{ name: t.author.name, body: t.description, at: t.createdAt }} messages={t.messages ?? []} />
            {t.attachments.length > 0 && <p className="mt-4 text-xs text-muted">Attachments (metadata only): {t.attachments.map((a) => a.name).join(', ')}</p>}
          </Card>

          <Card>
            <div className="flex items-center gap-1 border-b border-line px-3 pt-2" role="tablist">
              <TabBtn active={tab === 'reply'} onClick={() => setTab('reply')}><Send className="size-3.5" /> Reply to author</TabBtn>
              <TabBtn active={tab === 'note'} onClick={() => setTab('note')}><Lock className="size-3.5" /> Internal note</TabBtn>
            </div>

            {tab === 'reply' ? (
              <div className="space-y-3 p-5">
                {closed ? (
                  <p className="rounded-lg bg-paper px-4 py-3 text-sm text-muted">This ticket is closed. Change its status to reopen it before replying.</p>
                ) : (
                  <>
                    <DraftPanel draft={draft} loading={gen.isPending} error={draftError} wanted={wantDraft} onRegenerate={() => gen.mutate(true)} onReset={draft ? () => { setReply(draft.body); setUsedDraft(true); touched.current = false; } : undefined} />
                    <textarea
                      className={cx(inputCls, 'min-h-[200px] leading-relaxed')}
                      value={reply}
                      onChange={(e) => { setReply(e.target.value); touched.current = true; }}
                      placeholder={gen.isPending ? 'Drafting a reply…' : 'Write a reply to the author…'}
                      maxLength={8000}
                      aria-label="Reply to author"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-muted">The author sees this on their ticket immediately. Review all facts before sending.</p>
                      <div className="flex gap-2">
                        <Button variant="secondary" disabled={!reply.trim()} loading={send.isPending && send.variables === 'Resolved'} onClick={() => send.mutate('Resolved')} icon={<CheckCheck className="size-4" />}>Send &amp; resolve</Button>
                        <Button disabled={!reply.trim()} loading={send.isPending && send.variables !== 'Resolved'} onClick={() => send.mutate(undefined)} icon={<Send className="size-4" />}>Send reply</Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3 p-5">
                <p className="flex items-center gap-2 rounded-lg bg-amber-soft px-3 py-2 text-xs text-amber-ink"><Lock className="size-3.5" /> Internal notes are only visible to the BookLeaf team — never to the author.</p>
                <textarea className={inputCls} rows={5} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Checked with finance — payout batch runs on the 14th." maxLength={4000} aria-label="Internal note" />
                <div className="flex justify-end"><Button variant="secondary" disabled={!note.trim()} loading={addNote.isPending} onClick={() => addNote.mutate()}>Save note</Button></div>
              </div>
            )}
          </Card>
        </div>

        {/* ───────── sidebar ───────── */}
        <aside className="space-y-5">
          <Card>
            <CardHeader title="Triage" action={t.triage.status === 'pending' ? <SourceChip source="pending" /> : undefined} />
            <div className="space-y-4 p-5">
              <label className="block">
                <span className="mb-1 flex items-center justify-between text-xs font-medium text-muted">Category {t.triage.status !== 'pending' && <SourceChip source={t.categorySource} detail={t.triage.model ?? undefined} />}</span>
                <select className={inputCls} value={t.category ?? ''} onChange={(e) => update.mutate({ category: e.target.value as Category })} disabled={update.isPending}>
                  {!t.category && <option value="">Not classified yet</option>}
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 flex items-center justify-between text-xs font-medium text-muted">Priority {t.triage.status !== 'pending' && <SourceChip source={t.prioritySource} />}</span>
                <select className={inputCls} value={t.priority} onChange={(e) => update.mutate({ priority: e.target.value as Priority })} disabled={update.isPending}>
                  {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">Status</span>
                <select className={inputCls} value={t.status} onChange={(e) => update.mutate({ status: e.target.value as Status })} disabled={update.isPending}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>

              {(t.priorityReason || t.triage.rationale) && (
                <div className="rounded-lg bg-paper px-3 py-2.5 text-xs leading-relaxed text-muted">
                  {t.priorityReason && <p><span className="font-semibold text-ink">Priority:</span> {t.priorityReason}</p>}
                  {t.triage.rationale && <p className="mt-1"><span className="font-semibold text-ink">Category:</span> {t.triage.rationale}</p>}
                  {t.triage.confidence != null && <p className="mt-1">Model confidence: {Math.round(t.triage.confidence * 100)}%</p>}
                </div>
              )}
              {t.triage.status === 'fallback' && (
                <p className="flex items-start gap-2 text-xs text-amber-ink"><Wand2 className="mt-0.5 size-3.5 shrink-0" /> AI was unavailable, so this was classified by simple rules. Please double-check.</p>
              )}
              <Button variant="ghost" size="sm" className="-ml-2" loading={retriage.isPending} onClick={() => retriage.mutate()} icon={<RefreshCw className="size-3.5" />}>Re-run AI triage</Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Assignment" />
            <div className="space-y-3 p-5 text-sm">
              <p>{t.assignedTo ? <>Assigned to <span className="font-medium">{t.assignedTo.name}</span></> : <span className="text-muted">Unassigned</span>}</p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" icon={<UserCheck className="size-4" />} onClick={() => assign.mutate('me')} loading={assign.isPending && assign.variables === 'me'}>Assign to me</Button>
                {t.assignedTo && <Button variant="ghost" size="sm" icon={<UserMinus className="size-4" />} onClick={() => assign.mutate('unassigned')} loading={assign.isPending && assign.variables === 'unassigned'}>Unassign</Button>}
              </div>
              <dl className="space-y-1 border-t border-line pt-3 text-xs text-muted">
                <div className="flex justify-between"><dt>First response</dt><dd>{t.firstResponseAt ? dateTime(t.firstResponseAt) : 'Not yet'}</dd></div>
                {t.slaDueAt && t.isActive && <div className="flex justify-between"><dt>SLA due</dt><dd>{dateTime(t.slaDueAt)}</dd></div>}
                {t.resolvedAt && <div className="flex justify-between"><dt>Resolved</dt><dd>{dateTime(t.resolvedAt)}</dd></div>}
              </dl>
            </div>
          </Card>

          <Card>
            <CardHeader title="Author" />
            <div className="space-y-1 p-5 text-sm">
              <p className="font-medium">{t.author.name} <span className="font-normal text-muted">· {t.author.authorCode}</span></p>
              <p className="text-muted">{t.author.email}</p>
            </div>
            {mine.length > 0 && (
              <ul className="divide-y divide-line border-t border-line text-sm">
                {mine.map((b) => (
                  <li key={b.id} className={cx('px-5 py-2.5', b.id === t.book?.id && 'bg-leaf-50')}>
                    <p className="font-medium">{b.title}</p>
                    <p className="text-xs text-muted">{b.status} · pending {inr(b.royaltyPending)} · paid {inr(b.royaltyPaid)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {book && (
            <Card>
              <CardHeader title="Book context" subtitle={book.title} />
              <div className="space-y-3 p-5 text-sm">
                <dl className="grid grid-cols-2 gap-3">
                  <div><dt className="text-xs text-muted">ISBN</dt><dd className="tabular-nums">{book.isbn || '—'}</dd></div>
                  <div><dt className="text-xs text-muted">Published</dt><dd>{day(book.publicationDate)}</dd></div>
                  <div><dt className="text-xs text-muted">Copies sold</dt><dd>{book.isLive ? book.totalCopiesSold : '—'}</dd></div>
                  <div><dt className="text-xs text-muted">Print partner</dt><dd>{book.printPartner ?? '—'}</dd></div>
                </dl>
                {book.isLive ? <p className="rounded-lg bg-paper px-3 py-2 text-xs text-muted">{prettyDates(book.payout.summary)}</p> : <ProductionTracker production={book.production} />}
              </div>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button role="tab" aria-selected={active} onClick={onClick} className={cx('-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors', active ? 'border-leaf-600 text-leaf-700' : 'border-transparent text-muted hover:text-ink')}>
      {children}
    </button>
  );
}

function DraftPanel({ draft, loading, error, wanted, onRegenerate, onReset }: { draft: Draft | null; loading: boolean; error: string | null; wanted: boolean; onRegenerate: () => void; onReset?: () => void }) {
  if (!wanted && !draft) return null;
  if (loading && !draft) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-leaf-200 bg-leaf-50 px-4 py-3 text-sm text-leaf-800">
        <Sparkles className="size-4 animate-pulse" /> Drafting a reply from the knowledge base and the author&apos;s account data…
      </div>
    );
  }
  if (error && !draft) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-clay-line bg-clay-soft px-4 py-3 text-sm text-clay">
        <span>{error} You can still write a reply manually.</span>
        <Button variant="secondary" size="sm" onClick={onRegenerate}>Try again</Button>
      </div>
    );
  }
  if (!draft) return null;
  const isAi = draft.source === 'ai';
  return (
    <div className={cx('rounded-lg border px-4 py-3 text-sm', isAi ? 'border-leaf-200 bg-leaf-50' : 'border-amber-line bg-amber-soft')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={cx('flex items-center gap-2 font-medium', isAi ? 'text-leaf-800' : 'text-amber-ink')}>
          {isAi ? <Sparkles className="size-4" /> : <Wand2 className="size-4" />}
          {isAi ? 'AI-drafted reply' : 'Template reply (AI unavailable)'}
          <span className="text-xs font-normal opacity-75">Edit freely before sending</span>
        </p>
        <div className="flex gap-1">
          {onReset && <Button variant="ghost" size="sm" onClick={onReset}>Reset to draft</Button>}
          <Button variant="ghost" size="sm" loading={loading} onClick={onRegenerate} icon={<RefreshCw className="size-3.5" />}>Regenerate</Button>
        </div>
      </div>
      {draft.needsEscalation && (
        <p className="mt-2 flex items-start gap-2 rounded-md bg-clay-soft px-2.5 py-1.5 text-xs font-medium text-clay"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> Needs escalation — {draft.escalationTeam}</p>
      )}
      {draft.verifyBeforeSending.length > 0 && (
        <div className="mt-2 rounded-md bg-white/70 px-3 py-2 text-xs text-ink">
          <p className="font-semibold">Verify before sending</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted">{draft.verifyBeforeSending.map((v, i) => <li key={i}>{v}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
