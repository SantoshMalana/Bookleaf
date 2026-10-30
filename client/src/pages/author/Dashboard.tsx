import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, MessageSquarePlus } from 'lucide-react';
import { Card, CardHeader, EmptyState, ErrorBanner, PageHeader, Skeleton, StatTile, StatusBadge, Button } from '../../components/ui';
import { api } from '../../lib/api';
import { ago, day, firstName, inr } from '../../lib/format';
import { POLL_MS } from '../../lib/query-client';
import type { AuthorTicket, Me, Page } from '../../lib/types';

export default function Dashboard() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<{ data: Me }>('/me').then((r) => r.data) });
  const tickets = useQuery({
    queryKey: ['tickets', 'recent'],
    queryFn: () => api.get<Page<AuthorTicket>>('/tickets?limit=4&sort=activity'),
    refetchInterval: POLL_MS,
  });

  if (me.isError) return <ErrorBanner message="We couldn't load your dashboard." onRetry={() => void me.refetch()} />;
  const d = me.data;

  return (
    <>
      <PageHeader
        title={d ? `Welcome back, ${firstName(d.user.name)}` : 'Welcome back'}
        subtitle="Your books, royalties and support requests in one place."
        action={
          <Link to="/tickets/new">
            <Button icon={<MessageSquarePlus className="size-4" />}>Submit a query</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {!d ? (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[92px]" />)
        ) : (
          <>
            <StatTile label="Books" value={d.books?.total ?? 0} hint={`${d.books?.live ?? 0} live · ${d.books?.inProduction ?? 0} in production`} />
            <StatTile label="Royalty earned" value={inr(d.royalty?.totalEarned ?? 0)} hint={`${inr(d.royalty?.totalPaid ?? 0)} paid out`} />
            <StatTile
              label="Royalty pending"
              value={inr(d.royalty?.totalPending ?? 0)}
              tone={(d.royalty?.totalPending ?? 0) > 0 ? 'warn' : 'default'}
              hint={d.royalty?.nextPayoutDate ? `Next payout window: ${day(d.royalty.nextPayoutDate)}` : 'Nothing pending'}
            />
            <StatTile label="Open tickets" value={d.tickets?.active ?? 0} hint={`${d.tickets?.total ?? 0} raised in total`} />
          </>
        )}
      </div>

      {d?.royalty?.belowThreshold && (
        <p className="mt-4 rounded-lg bg-amber-soft px-4 py-3 text-sm text-amber-ink">
          Your combined pending royalty is below the ₹1,000 minimum payout threshold, so it carries forward to the next payout cycle.
        </p>
      )}
      {!!d?.royalty?.overdueBooks && (
        <p className="mt-4 rounded-lg bg-clay-soft px-4 py-3 text-sm text-clay">
          {d.royalty.overdueBooks === 1 ? 'One of your books has' : `${d.royalty.overdueBooks} of your books have`} a royalty payout that looks overdue.{' '}
          <Link to="/tickets/new" className="font-semibold underline">Raise a query</Link> and we&apos;ll look into it.
        </p>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader
            title="Recent tickets"
            action={
              <Link to="/tickets" className="inline-flex items-center gap-1 text-sm font-medium text-leaf-700 hover:underline">
                View all <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          {tickets.isLoading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : tickets.data?.items.length ? (
            <ul className="divide-y divide-line">
              {tickets.data.items.map((t) => (
                <li key={t.id}>
                  <Link to={`/tickets/${t.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-paper">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{t.subject}</p>
                      <p className="text-sm text-muted">
                        {t.ticketId} · {t.book?.title ?? 'General / Account'} · {ago(t.lastActivityAt)}
                      </p>
                    </div>
                    <StatusBadge status={t.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<MessageSquarePlus className="size-5" />} title="No tickets yet" body="Have a question about royalties, your ISBN or your book's progress? Ask us — replies show up here." action={<Link to="/tickets/new"><Button>Submit your first query</Button></Link>} />
          )}
        </Card>

        <Card>
          <CardHeader title="Quick links" />
          <div className="space-y-1 p-3">
            <Link to="/books" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-paper">
              <BookOpen className="size-4 text-leaf-600" /> View my books &amp; royalties
            </Link>
            <Link to="/tickets/new" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-paper">
              <MessageSquarePlus className="size-4 text-leaf-600" /> Ask a question
            </Link>
          </div>
          <p className="border-t border-line px-5 py-3 text-xs text-muted">Royalties are paid within 45 days of each quarter end, once your balance reaches ₹1,000.</p>
        </Card>
      </div>
    </>
  );
}
