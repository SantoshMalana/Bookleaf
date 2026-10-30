import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, LayoutDashboard, LifeBuoy, ListChecks, LogOut, PenLine, Sparkles, Ticket } from 'lucide-react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLiveUpdates } from '../lib/realtime';
import type { Me, Role } from '../lib/types';
import { cx, LiveIndicator, Spinner } from './ui';

export function BrandMark({ light }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="8" fill={light ? '#2f8460' : '#17533e'} />
        <path d="M9 23c0-8 5-13 14-14-1 9-6 14-14 14z" fill="#b6dcc4" />
        <path d="M9 23c3-4 6-7 10-9" stroke={light ? '#2f8460' : '#17533e'} strokeWidth="1.6" strokeLinecap="round" fill="none" />
      </svg>
      <span className="font-serif text-xl leading-none font-semibold tracking-tight">BookLeaf</span>
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
}

function Shell({ items, tag, dark }: { items: NavItem[]; tag: string; dark?: boolean }) {
  const { user, logout } = useAuth();
  const live = useLiveUpdates();
  return (
    <div className="min-h-screen">
      <header className={cx('sticky top-0 z-30 border-b', dark ? 'border-leaf-900 bg-leaf-900 text-white' : 'border-line bg-white/90 backdrop-blur')}>
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 sm:px-6">
          <div className="flex shrink-0 items-center gap-3 py-3">
            <BrandMark light={dark} />
            <span className={cx('hidden rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase sm:inline', dark ? 'bg-white/10 text-leaf-200' : 'bg-leaf-50 text-leaf-700')}>{tag}</span>
          </div>
          <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label="Main">
            {items.map((i) => (
              <NavItemLink key={i.to} item={i} dark={dark} />
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <span className={dark ? 'text-leaf-200' : ''}>
              <LiveIndicator state={live} />
            </span>
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className={cx('text-xs', dark ? 'text-leaf-300' : 'text-muted')}>{user?.email}</p>
            </div>
            <button
              onClick={() => void logout()}
              className={cx('grid size-9 place-items-center rounded-lg transition-colors', dark ? 'hover:bg-white/10' : 'hover:bg-black/5')}
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
      <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-9">
        <Outlet />
      </main>
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
          'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
          dark
            ? isActive ? 'bg-white/15 text-white' : 'text-leaf-200 hover:bg-white/10 hover:text-white'
            : isActive ? 'bg-leaf-50 text-leaf-700' : 'text-muted hover:bg-black/5 hover:text-ink',
        )
      }
    >
      <span className="[&>svg]:size-4">{item.icon}</span>
      {item.label}
      {item.badge ? <span className="grid min-w-5 place-items-center rounded-full bg-leaf-600 px-1.5 text-[11px] font-semibold text-white">{item.badge}</span> : null}
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
        { to: '/tickets/new', label: 'Submit a Query', icon: <PenLine /> },
        { to: '/tickets', label: 'My Tickets', icon: <Ticket />, end: true, badge: data?.tickets?.active },
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
