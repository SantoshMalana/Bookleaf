import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx, { type ClassValue } from 'clsx';
import { Bot, CircleDot, Loader2, Sparkles, UserRound, Wand2 } from 'lucide-react';
import type { LiveState } from '../lib/realtime';
import type { Priority, Source, Status } from '../lib/types';

export const cx = (...v: ClassValue[]) => clsx(v);

// ───────────── buttons ─────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-[0_4px_14px_-4px_rgba(214,59,82,0.55)] hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300 disabled:shadow-none',
  secondary: 'bg-white text-brand-700 border border-brand-300 hover:bg-brand-50 hover:border-brand-500 disabled:text-faint disabled:border-line-strong disabled:hover:bg-white',
  ghost: 'text-muted hover:bg-brand-50 hover:text-brand-700 disabled:text-faint',
  danger: 'bg-clay text-white hover:bg-[#9b3626] disabled:opacity-50',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, children, className, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full font-bold whitespace-nowrap transition-colors disabled:cursor-not-allowed',
        size === 'sm' ? 'h-8 px-4 text-sm' : 'h-11 px-6 text-[15px]',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

// ───────────── layout atoms ─────────────

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('rounded-2xl border border-line bg-card shadow-[0_2px_12px_-4px_rgba(47,46,46,0.08)]', className)}>{children}</section>;
}

export function CardHeader({ title, action, subtitle }: { title: ReactNode; action?: ReactNode; subtitle?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
      <div>
        <h2 className="font-sans text-[15px] font-bold tracking-normal">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function PageHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[30px] leading-tight font-extrabold">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatTile({ label, value, hint, tone = 'default', onClick, active, icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'warn' | 'danger' | 'good'; onClick?: () => void; active?: boolean; icon?: ReactNode }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cx(
        'rounded-2xl border bg-card px-4 py-3.5 text-left shadow-[0_2px_12px_-4px_rgba(47,46,46,0.08)]',
        onClick && 'transition hover:border-brand-300 hover:shadow-md hover:shadow-brand-500/10',
        active ? 'border-brand-500 ring-2 ring-brand-200' : 'border-line',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold tracking-wide text-muted uppercase">{label}</p>
        {icon && <span className="grid size-8 place-items-center rounded-full bg-brand-100 text-brand-600 [&>svg]:size-4">{icon}</span>}
      </div>
      <p className={cx('mt-1 text-[28px] leading-none font-extrabold', tone === 'danger' && 'text-clay', tone === 'warn' && 'text-amber-ink', tone === 'good' && 'text-ok-700')}>{value}</p>
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </Tag>
  );
}

// ───────────── badges ─────────────

type Tone = 'neutral' | 'sky' | 'amber' | 'brand' | 'ok' | 'clay' | 'orange' | 'ink';
const tones: Record<Tone, string> = {
  neutral: 'bg-[#f5f1f1] text-muted border-line',
  sky: 'bg-sky-soft text-sky-ink border-[#c8def5]',
  amber: 'bg-amber-soft text-amber-ink border-amber-line',
  brand: 'bg-brand-50 text-brand-700 border-brand-200',
  ok: 'bg-ok-50 text-ok-700 border-ok-200',
  clay: 'bg-clay-soft text-clay border-clay-line',
  orange: 'bg-[#fff1e3] text-[#a4500a] border-[#f6cfa5]',
  ink: 'bg-ink text-white border-ink',
};

export function Badge({ tone = 'neutral', children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', tones[tone], className)}>
      {children}
    </span>
  );
}

const statusTone: Record<Status, Tone> = { Open: 'sky', 'In Progress': 'amber', Resolved: 'ok', Closed: 'neutral' };
export const StatusBadge = ({ status }: { status: Status }) => (
  <Badge tone={statusTone[status]}>
    <CircleDot className="size-3" />
    {status}
  </Badge>
);

const priorityTone: Record<Priority, Tone> = { Critical: 'clay', High: 'orange', Medium: 'sky', Low: 'neutral' };
export const PriorityBadge = ({ priority }: { priority: Priority }) => (
  <Badge tone={priorityTone[priority]} className={priority === 'Critical' ? 'font-semibold' : ''}>
    {priority}
  </Badge>
);

/** Where a category/priority value came from: AI, rule-based fallback, an admin override, or a seeded preset. */
export function SourceChip({ source, detail }: { source: Source; detail?: string }) {
  const map: Record<Source, { label: string; icon: ReactNode; tone: Tone; title: string }> = {
    ai: { label: 'AI', icon: <Sparkles className="size-3" />, tone: 'brand', title: detail ?? 'Classified by the AI model' },
    fallback: { label: 'Rules', icon: <Wand2 className="size-3" />, tone: 'amber', title: 'AI was unavailable — rule-based guess, please review' },
    admin: { label: 'Manual', icon: <UserRound className="size-3" />, tone: 'ink', title: 'Set manually by an admin' },
    seed: { label: 'Preset', icon: <Bot className="size-3" />, tone: 'neutral', title: 'Preset demo value' },
    pending: { label: 'Triaging…', icon: <Loader2 className="size-3 animate-spin" />, tone: 'sky', title: 'AI triage in progress' },
  };
  const m = map[source];
  return (
    <Badge tone={m.tone} title={m.title}>
      {m.icon}
      {m.label}
    </Badge>
  );
}

// ───────────── feedback ─────────────

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cx('size-5 animate-spin text-brand-600', className)} />;

export const Skeleton = ({ className }: { className?: string }) => <div className={cx('skeleton', className)} />;

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="mb-3 grid size-14 place-items-center rounded-full bg-brand-100 text-brand-600">{icon}</div>}
      <h3 className="font-sans text-base font-bold">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-clay-line bg-clay-soft px-4 py-3 text-sm text-clay">
      <span>{message}</span>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function LiveIndicator({ state }: { state: LiveState }) {
  const cfg = {
    live: { dot: 'bg-ok-500 live-dot', text: 'Live', title: 'Real-time updates are on' },
    connecting: { dot: 'bg-amber-ink/60', text: 'Connecting', title: 'Connecting to live updates…' },
    offline: { dot: 'bg-faint', text: 'Polling', title: 'Live stream unavailable — refreshing every 30 seconds' },
  }[state];
  return (
    <span title={cfg.title} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
      <span className={cx('size-2 rounded-full', cfg.dot)} />
      {cfg.text}
    </span>
  );
}

// ───────────── forms ─────────────

export const inputCls =
  'block w-full rounded-xl border border-line-strong bg-white px-3.5 py-2.5 text-[15px] text-ink placeholder:text-faint transition-colors focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:bg-paper disabled:text-faint';

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-bold">
        {label}
      </label>
      {children}
      {error ? <p className="mt-1.5 text-sm text-clay">{error}</p> : hint ? <p className="mt-1.5 text-sm text-muted">{hint}</p> : null}
    </div>
  );
}
