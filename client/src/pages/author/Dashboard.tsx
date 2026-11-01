import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, CalendarClock, CircleDollarSign, Hourglass, Library, MessageSquarePlus, Receipt, Ticket } from 'lucide-react';
import { Card, CardHeader, EmptyState, ErrorBanner, PageHeader, Skeleton, StatTile, StatusBadge, Button } from '../../components/ui';
import { api } from '../../lib/api';
import { ago, day, firstName, inr } from '../../lib/format';
import { POLL_MS } from '../../lib/query-client';
import type { AuthorTicket, Book, Me, Page } from '../../lib/types';

export default function Dashboard() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<{ data: Me }>('/me').then((r) => r.data) });
  const tickets = useQuery({
    queryKey: ['tickets', 'recent'],
    queryFn: () => api.get<Page<AuthorTicket>>('/tickets?limit=4&sort=activity'),
    refetchInterval: POLL_MS,
  });

  const books = useQuery({ queryKey: ['books'], queryFn: () => api.get<{ data: Book[] }>('/books').then((r) => r.data) });

  if (me.isError) return <ErrorBanner message="We couldn't load your dashboard." onRetry={() => void me.refetch()} />;
  const d = me.data;

  return (
    <>
      <PageHeader
        title={d ? <>Welcome back, <span className="text-brand-500">{firstName(d.user.name)}</span></> : 'Welcome back'}
        subtitle="Your books, royalties and support requests in one place."
        action={
          <Link to="/tickets/new">
            <Button icon={<MessageSquarePlus className="size-4" />}>Submit a query</Button>
          </Link>
        }
      />

      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        {!d ? (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[92px]" />)
        ) : (
          <>
            <StatTile icon={<Library />} label="Books" value={d.books?.total ?? 0} hint={`${d.books?.live ?? 0} live · ${d.books?.inProduction ?? 0} in production`} />
            <StatTile icon={<CircleDollarSign />} label="Royalty earned" value={inr(d.royalty?.totalEarned ?? 0)} hint={`${inr(d.royalty?.totalPaid ?? 0)} paid out`} />
            <StatTile
              icon={<Hourglass />}
              label="Royalty pending"
              value={inr(d.royalty?.totalPending ?? 0)}
              tone={(d.royalty?.totalPending ?? 0) > 0 ? 'warn' : 'default'}
              hint={d.royalty?.overdueBooks ? 'Overdue — we\'re on it once you raise a query' : d.royalty?.nextPayoutDate ? `Next payout window: ${day(d.royalty.nextPayoutDate)}` : 'Nothing pending'}
            />
            <StatTile icon={<Ticket />} label="Open tickets" value={d.tickets?.active ?? 0} hint={`${d.tickets?.total ?? 0} raised in total`} />
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

      <div className="mt-6 grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
        <Card>
          <CardHeader
            title="Recent tickets"
            action={
              <Link to="/tickets" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
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
          <CardHeader
            title="Your books"
            action={
              <Link to="/books" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                Details <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          {books.isLoading ? (
            <div className="space-y-3 p-5"><Skeleton className="h-12" /></div>
          ) : books.data?.length ? (
            <ul className="divide-y divide-line">
              {books.data.slice(0, 4).map((b) => (
                <li key={b.id}>
                  <Link to="/books" className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-brand-50/50">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-100 to-brand-200 text-brand-700"><BookOpen className="size-5" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{b.title}</p>
                      <p className="truncate text-sm text-muted">{b.genre} · {b.isLive ? `${b.totalCopiesSold} copies sold` : b.production.stage}</p>
                    </div>
                    {b.isLive ? (
                      <div className="text-right">
                        <p className="flex items-center justify-end gap-1 text-[11px] font-bold tracking-wide text-muted uppercase"><Receipt className="size-3" /> Pending</p>
                        <p className={b.royaltyPending > 0 ? 'font-extrabold text-amber-ink' : 'font-extrabold'}>{inr(b.royaltyPending)}</p>
                      </div>
                    ) : (
                      <span className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">In production</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted">Your books will appear here once they are registered.</p>
          )}
        </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Quick links" />
            <div className="space-y-1 p-3">
              <Link to="/books" className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-brand-50">
                <span className="grid size-8 place-items-center rounded-full bg-brand-100 text-brand-600"><BookOpen className="size-4" /></span>
                <span className="flex-1">View my books &amp; royalties</span>
                <ArrowRight className="size-4 text-faint transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
              </Link>
              <Link to="/tickets/new" className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-brand-50">
                <span className="grid size-8 place-items-center rounded-full bg-brand-100 text-brand-600"><MessageSquarePlus className="size-4" /></span>
                <span className="flex-1">Ask a question</span>
                <ArrowRight className="size-4 text-faint transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
              </Link>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-brand-50 to-brand-100 px-5 py-4">
              <p className="flex items-center gap-2 text-sm font-extrabold text-brand-800"><CalendarClock className="size-4" /> How royalties are paid</p>
            </div>
            <ol className="space-y-3 px-5 py-4 text-sm">
              {[
                ['Quarterly', 'Royalties are calculated every quarter.'],
                ['Within 45 days', 'Paid by bank transfer after each quarter ends.'],
                ['₹1,000 minimum', 'Smaller balances roll over to the next quarter.'],
              ].map(([h, t], i) => (
                <li key={h} className="flex gap-3">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-600 text-[11px] font-extrabold text-white">{i + 1}</span>
                  <span><b className="font-extrabold">{h}.</b> <span className="text-muted">{t}</span></span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
