import { useQuery } from '@tanstack/react-query';
import { BookOpen } from 'lucide-react';
import { BookCard } from '../../components/BookCard';
import { EmptyState, ErrorBanner, PageHeader, Skeleton } from '../../components/ui';
import { api } from '../../lib/api';
import type { Book } from '../../lib/types';

export default function Books() {
  const q = useQuery({ queryKey: ['books'], queryFn: () => api.get<{ data: Book[] }>('/books').then((r) => r.data) });

  if (q.isError) return <ErrorBanner message="We couldn't load your books." onRetry={() => void q.refetch()} />;
  const books = q.data ?? [];
  const live = books.filter((b) => b.isLive);
  const inProduction = books.filter((b) => !b.isLive);

  return (
    <>
      <PageHeader title="My Books" subtitle="Publication details, sales and royalty status for each of your titles." />
      {q.isLoading ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : books.length === 0 ? (
        <EmptyState icon={<BookOpen className="size-5" />} title="No books on your account yet" body="Once your book is registered with BookLeaf it will appear here." />
      ) : (
        <div className="space-y-9">
          {live.length > 0 && (
            <section>
              <h2 className="mb-3 font-sans text-sm font-semibold tracking-wide text-muted uppercase">Published &amp; live · {live.length}</h2>
              <div className="grid gap-5 lg:grid-cols-2">{live.map((b) => <BookCard key={b.id} book={b} />)}</div>
            </section>
          )}
          {inProduction.length > 0 && (
            <section>
              <h2 className="mb-3 font-sans text-sm font-semibold tracking-wide text-muted uppercase">In production · {inProduction.length}</h2>
              <div className="grid gap-5 lg:grid-cols-2">{inProduction.map((b) => <BookCard key={b.id} book={b} />)}</div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
