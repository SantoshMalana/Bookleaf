import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Paperclip, Send } from 'lucide-react';
import { TicketThread } from '../../components/TicketThread';
import { Button, Card, CardHeader, EmptyState, ErrorBanner, inputCls, Skeleton, StatusBadge } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { dateTime, fileSize } from '../../lib/format';
import { POLL_MS } from '../../lib/query-client';
import { markOwnAction } from '../../lib/realtime';
import { useToast } from '../../lib/toast';
import type { AuthorTicket } from '../../lib/types';

export default function TicketDetail() {
  const { ticketId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [body, setBody] = useState('');

  const q = useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: () => api.get<{ data: AuthorTicket }>(`/tickets/${ticketId}`).then((r) => r.data),
    refetchInterval: POLL_MS,
    retry: false,
  });

  const send = useMutation({
    mutationFn: () => api.post(`/tickets/${ticketId}/messages`, { body }),
    onMutate: () => markOwnAction(),
    onSuccess: () => {
      setBody('');
      void qc.invalidateQueries({ queryKey: ['ticket', ticketId] });
      void qc.invalidateQueries({ queryKey: ['tickets'] });
    },
    onError: (e) => toast.push({ tone: 'error', title: 'Could not send your message', body: e instanceof ApiError ? e.message : undefined }),
  });

  if (q.isError) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return notFound ? (
      <EmptyState title="Ticket not found" body="It may not exist, or it may belong to a different account." action={<Link to="/tickets"><Button>Back to my tickets</Button></Link>} />
    ) : (
      <ErrorBanner message="We couldn't load this ticket." onRetry={() => void q.refetch()} />
    );
  }
  if (q.isLoading || !q.data) return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-40" /></div>;

  const t = q.data;
  const closed = t.status === 'Closed';
  const awaiting = !t.messages?.some((m) => m.senderRole === 'admin');

  return (
    <>
      <Link to="/tickets" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> My tickets
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">{t.ticketId} · {t.book?.title ?? 'General / Account Level'} · Opened {dateTime(t.createdAt)}</p>
          <h1 className="mt-1 text-[26px] leading-tight font-semibold">{t.subject}</h1>
        </div>
        <StatusBadge status={t.status} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-5">
          <Card className="p-5">
            <TicketThread viewer="author" firstMessage={{ name: 'You', body: t.description, at: t.createdAt }} messages={t.messages ?? []} />
            {awaiting && t.status === 'Open' && (
              <p className="mt-5 rounded-lg bg-sky-soft px-4 py-3 text-sm text-sky-ink">We&apos;ve received your query. A member of the team will reply here — you don&apos;t need to refresh this page.</p>
            )}
          </Card>

          {closed ? (
            <p className="rounded-lg bg-paper px-4 py-3 text-sm text-muted">This ticket is closed. <Link to="/tickets/new" className="font-medium text-leaf-700 underline">Raise a new ticket</Link> if you need more help.</p>
          ) : (
            <Card>
              <CardHeader title={t.status === 'Resolved' ? 'Not fully resolved? Reply to reopen' : 'Add a follow-up'} />
              <form
                className="space-y-3 p-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (body.trim()) send.mutate();
                }}
              >
                <textarea className={inputCls} rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" maxLength={4000} aria-label="Follow-up message" />
                <div className="flex justify-end">
                  <Button type="submit" loading={send.isPending} disabled={!body.trim()} icon={<Send className="size-4" />}>Send</Button>
                </div>
              </form>
            </Card>
          )}
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title="Details" />
            <dl className="space-y-3 p-5 text-sm">
              <div><dt className="text-xs text-muted">Status</dt><dd className="mt-0.5"><StatusBadge status={t.status} /></dd></div>
              <div><dt className="text-xs text-muted">Book</dt><dd className="mt-0.5 font-medium">{t.book?.title ?? 'General / Account Level'}</dd></div>
              <div><dt className="text-xs text-muted">Last updated</dt><dd className="mt-0.5">{dateTime(t.lastActivityAt)}</dd></div>
              {t.attachments.length > 0 && (
                <div>
                  <dt className="text-xs text-muted">Attachments</dt>
                  {t.attachments.map((a, i) => (
                    <dd key={i} className="mt-1 flex items-center gap-1.5 text-muted"><Paperclip className="size-3.5" />{a.name} · {fileSize(a.size)}</dd>
                  ))}
                </div>
              )}
            </dl>
          </Card>
        </aside>
      </div>
    </>
  );
}
