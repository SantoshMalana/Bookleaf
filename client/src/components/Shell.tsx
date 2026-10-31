import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, LayoutDashboard, LifeBuoy, ListChecks, LogOut, MessageCircleQuestion, PenLine, Sparkles, Ticket } from 'lucide-react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLiveUpdates } from '../lib/realtime';
import type { Me, Role } from '../lib/types';
import { CloudBackdrop } from './Decor';
import { cx, LiveIndicator, Spinner } from './ui';

/** Stacked light wordmark in the style of the BookLeaf Publishing logo. */
export function BrandMark({ light, size = 'md' }: { light?: boolean; size?: 'md' | 'lg' }) {
  return (
    <span className={cx('inline-flex flex-col leading-[1.02] select-none', light ? 'text-white' : 'text-ink')} aria-label="BookLeaf Publishing">
      <span className={cx('font-light tracking-tight', size === 'lg' ? 'text-[34px]' : 'text-[24px]')}>BookLeaf</span>
      <span className={cx('font-light tracking-tight', size === 'lg' ? 'text-[28px]' : 'text-[19px]', light ? 'text-white/80' : 'text-ink/75')}>Publishing</span>
    </span>
  );
}

/** Redirects to /login unless signed in with the required role (wrong role → their own home). */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner className="size-7" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/'} replace />;
  return <>{children}</>;
}

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
  badge?: number;
  /** Filled call-to-action pill, like "Publish My Book" on the main site. */
  cta?: boolean;
}

function Shell({ items, tag, dark }: { items: NavItem[]; tag: string; dark?: boolean }) {
  const { user, logout } = useAuth();
  const live = useLiveUpdates();
  const { pathname } = useLocation();
  const showHelp = !dark && !pathname.startsWith('/tickets/new');

  return (
    <div className={cx('flex min-h-screen flex-col', dark ? 'bg-[#f6f6f8]' : 'bg-white')}>
      <header className={cx('sticky top-0 z-30', dark ? 'bg-navy-900 text-white' : 'border-b border-line bg-white/95 backdrop-blur')}>
        <div className="mx-auto flex max-w-6xl items-center gap-5 px-4 sm:px-6">
          <Link to={dark ? '/admin' : '/'} className="flex shrink-0 items-center gap-3 py-3">
            <BrandMark light={dark} />
            {dark && <span className="hidden rounded-full bg-brand-500 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-white uppercase sm:inline">{tag}</span>}
          </Link>
          <nav className="hidden flex-1 items-center justify-center gap-1 md:flex" aria-label="Main">
            {items.map((i) => (
              <NavItemLink key={i.to} item={i} dark={dark} />
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 md:ml-0">
            <span className={dark ? 'text-white/70' : ''}>
              <LiveIndicator state={live} />
            </span>
            <div className="flex items-center gap-2.5">
              <span className={cx('grid size-9 place-items-center rounded-full text-sm font-extrabold', dark ? 'bg-white/10 text-white' : 'bg-brand-100 text-brand-700')} aria-hidden>
                {user?.name.charAt(0)}
              </span>
              <div className="hidden text-left leading-tight lg:block">
                <p className="text-sm font-bold">{user?.name}</p>
                <p className={cx('text-xs', dark ? 'text-white/60' : 'text-muted')}>{user?.email}</p>
              </div>
            </div>
            <button
              onClick={() => void logout()}
              className={cx('grid size-9 place-items-center rounded-full transition-colors', dark ? 'hover:bg-white/10' : 'text-muted hover:bg-brand-50 hover:text-brand-700')}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="size-[18px]" />
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden" aria-label="Main (mobile)">
          {items.map((i) => (
            <NavItemLink key={i.to} item={i} dark={dark} />
          ))}
        </nav>
      </header>

      <div className="relative flex-1">
        {!dark && <CloudBackdrop className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[320px] w-full [mask-image:linear-gradient(to_bottom,#000_65%,transparent)]" />}
        <main className="relative mx-auto max-w-6xl px-4 py-8 pb-24 sm:px-6 sm:py-10">
          <div key={pathname} className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>

      <footer className={cx('border-t', dark ? 'border-line bg-white' : 'border-line bg-white')}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted sm:px-6 sm:pr-40">
          <div className="flex items-center gap-4">
            <BrandMark />
            <span className="hidden border-l border-line pl-4 sm:block">Publishing Made Easy</span>
          </div>
          <p>
            © BookLeaf Publishing ·{' '}
            <a href="https://www.bookleafpub.in" target="_blank" rel="noreferrer" className="font-semibold text-brand-700 hover:underline">
              bookleafpub.in
            </a>
          </p>
        </div>
      </footer>

      {showHelp && (
        <Link
          to="/tickets/new"
          className="fixed right-5 bottom-5 z-30 flex items-center gap-2 rounded-full bg-brand-600 px-4 py-3 text-sm font-bold text-white shadow-[0_10px_24px_-6px_rgba(214,59,82,0.65)] transition hover:-translate-y-0.5 hover:bg-brand-700"
          aria-label="Ask a question"
        >
          <MessageCircleQuestion className="size-5" />
          <span className="hidden sm:inline">Need help?</span>
        </Link>
      )}
    </div>
  );
}

function NavItemLink({ item, dark }: { item: NavItem; dark?: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cx(
          'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold whitespace-nowrap transition-colors',
          item.cta
            ? 'bg-brand-600 text-white shadow-[0_4px_14px_-4px_rgba(214,59,82,0.55)] hover:bg-brand-700'
            : dark
              ? isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
              : isActive ? 'bg-brand-100 text-brand-700' : 'text-ink/80 hover:bg-brand-50 hover:text-brand-700',
        )
      }
    >
      <span className="[&>svg]:size-4">{item.icon}</span>
      {item.label}
      {item.badge ? <span className={cx('grid min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-extrabold', dark ? 'bg-brand-500 text-white' : 'bg-brand-600 text-white')}>{item.badge}</span> : null}
    </NavLink>
  );
}

export function AuthorLayout() {
  const { data } = useQuery({ queryKey: ['me'], queryFn: () => api.get<{ data: Me }>('/me').then((r) => r.data) });
  return (
    <Shell
      tag="Author portal"
      items={[
        { to: '/', label: 'Dashboard', icon: <LayoutDashboard />, end: true },
        { to: '/books', label: 'My Books', icon: <BookOpen /> },
        { to: '/tickets', label: 'My Tickets', icon: <Ticket />, end: true, badge: data?.tickets?.active },
        { to: '/tickets/new', label: 'Submit a Query', icon: <PenLine />, cta: true },
      ]}
    />
  );
}

export function AdminLayout() {
  return (
    <Shell
      dark
      tag="Ops console"
      items={[
        { to: '/admin', label: 'Ticket queue', icon: <ListChecks />, end: true },
        { to: '/admin/ai', label: 'AI usage', icon: <Sparkles /> },
        { to: '/admin/docs', label: 'API docs', icon: <LifeBuoy /> },
      ]}
    />
  );
}
