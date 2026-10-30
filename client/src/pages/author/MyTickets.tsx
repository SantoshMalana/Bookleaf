import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MessageSquarePlus, MessagesSquare } from 'lucide-react';
import { Badge, Button, Card, cx, EmptyState, ErrorBanner, PageHeader, Skeleton, StatusBadge } from '../../components/ui';
import { api, qs } from '../../lib/api';
import { ago } from '../../lib/format';
import { POLL_MS } from '../../lib/query-client';
import type { AuthorTicket, Page } from '../../lib/types';

const TABS = [
  { key: '', label: 'All' },
  { key: 'Open,In Progress', label: 'Active' },
  { key: 'Resolved,Closed', label: 'Resolved' },
] as const;

export default function MyTickets() {
  const [status, setStatus] = useState<string>('');
  const q = useQuery({
    queryKey: ['tickets', 'list', status],
    queryFn: () => api.get<Page<AuthorTicket>>(`/tickets${qs({ status, limit: 50, sort: 'activity' })}`),
    refetchInterval: POLL_MS,
    placeholderData: (prev) => prev,
  });

  return (
    <>
      <PageHeader
        title="My Tickets"
        subtitle="Every query you've raised and where it stands."
        action={<Link to="/tickets/new"><Button icon={<MessageSquarePlus className="size-4" />}>New query</Button></Link>}
      />
      <div className="mb-4 inline-flex rounded-lg border border-line bg-white p-1" role="tablist">
        {TABS.map((t) => (
          <button key={t.label} role="tab" aria-selected={status === t.key} onClick={() => setStatus(t.key)} className={cx('rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors', status === t.key ? 'bg-leaf-600 text-white' : 'text-muted hover:text-ink')}>
            {t.label}
          </button>
        ))}
      </div>

      {q.isError ? (
        <ErrorBanner message="We couldn't load your tickets." onRetry={() => void q.refetch()} />
      ) : q.isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : q.data!.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MessagesSquare className="size-5" />}
            title={status ? 'Nothing here' : 'You haven’t raised any tickets yet'}
            body={status ? 'No tickets match this view.' : 'When you submit a query, you can follow every reply right here.'}
            action={!status ? <Link to="/tickets/new"><Button>Submit a query</Button></Link> : undefined}
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {q.data!.items.map((t) => (
            <li key={t.id}>
              <Link to={`/tickets/${t.id}`} className="block rounded-xl border border-line bg-card p-4 shadow-[0_1px_2px_rgba(28,36,32,0.04)] transition hover:border-leaf-300 hover:shadow-md hover:shadow-black/5 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{t.subject}</p>
                    <p className="mt-0.5 text-sm text-muted">{t.ticketId} · {t.book?.title ?? 'General / Account Level'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.replyCount > 0 && t.status !== 'Closed' && <Badge tone="leaf">{t.replyCount} {t.replyCount === 1 ? 'reply' : 'replies'}</Badge>}
                    <StatusBadge status={t.status} />
                  </div>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-muted">{t.description}</p>
                <p className="mt-2 text-xs text-faint">Updated {ago(t.lastActivityAt)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
