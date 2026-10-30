import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CircleCheck, MessageSquarePlus, Printer, Info } from 'lucide-react';
import { day, inr, num } from '../lib/format';
import type { Book } from '../lib/types';
import { Badge, cx } from './ui';

/** Segmented progress for books that are not live yet: one segment per stage, current stage spelled out. */
export function ProductionTracker({ production }: { production: Book['production'] }) {
  const total = production.stages.length;
  const next = production.stages[production.stageIndex + 1];
  return (
    <div>
      <p className="text-sm">
        <span className="font-semibold">{production.stage}</span>
        <span className="text-muted"> · stage {production.stageIndex + 1} of {total}</span>
      </p>
      <ol className="mt-2 flex gap-1" aria-label="Production progress">
        {production.stages.map((s) => (
          <li
            key={s.name}
            title={`${s.name}${s.state === 'done' ? ' (done)' : s.state === 'current' ? ' (current)' : ''}`}
            className={cx('h-2 flex-1 rounded-full', s.state === 'done' && 'bg-brand-500', s.state === 'current' && 'bg-brand-300 ring-2 ring-brand-100', s.state === 'upcoming' && 'bg-line')}
          />
        ))}
      </ol>
      {next && <p className="mt-2 text-xs text-muted">Next: {next.name}</p>}
      {production.commonDelayStage && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-soft px-3 py-2 text-xs text-amber-ink">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          This stage is where books most often take a little longer — we&apos;ll keep you posted.
        </p>
      )}
    </div>
  );
}

function RoyaltyBar({ paid, pending }: { paid: number; pending: number }) {
  const total = paid + pending;
  if (total <= 0) return null;
  return (
    <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-line" role="img" aria-label={`${inr(paid)} paid, ${inr(pending)} pending`}>
      <div className="bg-ok-500" style={{ width: `${(paid / total) * 100}%` }} />
      <div className="bg-amber-ink/50" style={{ width: `${(pending / total) * 100}%` }} />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
      {sub && <dd className="text-xs text-faint">{sub}</dd>}
    </div>
  );
}

export function BookCard({ book }: { book: Book }) {
  const live = book.isLive;
  const hasRoyalty = book.totalRoyaltyEarned > 0;
  const p = book.payout;

  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-card shadow-[0_2px_12px_-4px_rgba(47,46,46,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-4">
        <div className="min-w-0">
          <h3 className="text-xl leading-snug font-extrabold">{book.title}</h3>
          <p className="mt-1 text-sm text-muted">
            {book.genre} · <span className="tabular-nums">{book.isbn || 'ISBN not assigned'}</span>
          </p>
        </div>
        <Badge tone={live ? 'ok' : 'amber'}>
          {live ? <CircleCheck className="size-3" /> : <Printer className="size-3" />}
          {book.status}
        </Badge>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 text-sm sm:grid-cols-4">
        <Stat label="Published" value={day(book.publicationDate)} />
        <Stat label="MRP" value={inr(book.mrp)} sub={book.royaltyPerCopy != null ? `${inr(book.royaltyPerCopy)} royalty / copy` : undefined} />
        <Stat label="Copies sold" value={live ? num(book.totalCopiesSold) : '—'} />
        <Stat label="Available on" value={book.availableOn.length ? book.availableOn.join(', ') : '—'} />
      </dl>

      <div className="mt-4 border-t border-line bg-paper/60 px-5 py-4">
        {live ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Money label="Earned" value={book.totalRoyaltyEarned} />
              <Money label="Paid" value={book.royaltyPaid} tone="good" sub={book.lastRoyaltyPayoutDate ? `Last: ${day(book.lastRoyaltyPayoutDate)}` : undefined} />
              <Money label="Pending" value={book.royaltyPending} tone={book.royaltyPending > 0 ? 'warn' : undefined} />
            </div>
            <RoyaltyBar paid={book.royaltyPaid} pending={book.royaltyPending} />
            {!hasRoyalty ? (
              <p className="mt-3 text-sm text-muted">No royalties yet — they appear here as soon as copies are sold.</p>
            ) : (
              <PayoutNote payout={p} />
            )}
          </>
        ) : (
          <>
            <ProductionTracker production={book.production} />
            <p className="mt-3 text-sm text-muted">Royalties start accruing once your book is live. Earned so far: {inr(0)}.</p>
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
        <span className="text-muted">{book.printPartner ? `Printed by ${book.printPartner}` : live ? '' : 'Not yet sent to print'}</span>
        <Link to={`/tickets/new?bookId=${book.id}`} className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:text-brand-800 hover:underline">
          <MessageSquarePlus className="size-4" /> Ask about this book
        </Link>
      </div>
    </article>
  );
}

function Money({ label, value, tone, sub }: { label: string; value: number; tone?: 'good' | 'warn'; sub?: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={cx('mt-0.5 text-xl font-extrabold tabular-nums', tone === 'good' && 'text-ok-700', tone === 'warn' && 'text-amber-ink')}>{inr(value)}</p>
      {sub && <p className="text-xs text-faint">{sub}</p>}
    </div>
  );
}

/** "2024-11-14" → "14 Nov 2024" inside server-written sentences. */
export const prettyDates = (text: string) => text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (d) => day(d));

function PayoutNote({ payout }: { payout: Book['payout'] }) {
  const summary =
    payout.state === 'overdue' && payout.overdueSince
      ? `Your first payout was due by ${day(payout.overdueSince)} and hasn't been made yet. Please raise a query and we'll look into it.`
      : prettyDates(payout.summary);
  if (payout.state === 'not_applicable' || payout.state === 'settled') {
    return (
      <p className="mt-3 flex items-start gap-2 text-sm text-ok-700">
        <CircleCheck className="mt-0.5 size-4 shrink-0" />
        {summary}
      </p>
    );
  }
  const overdue = payout.state === 'overdue';
  return (
    <p className={cx('mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm', overdue ? 'bg-clay-soft text-clay' : 'bg-amber-soft text-amber-ink')}>
      {overdue ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <CalendarClock className="mt-0.5 size-4 shrink-0" />}
      <span>{summary}</span>
    </p>
  );
}
