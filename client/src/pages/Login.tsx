import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Eye, EyeOff, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { HeroArt } from '../components/Decor';
import { BrandMark } from '../components/Shell';
import { Badge, Button, cx, Field, inputCls, Spinner } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { DemoAccounts } from '../lib/types';

export default function Login() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const demo = useQuery({
    queryKey: ['demo-accounts'],
    queryFn: () => api.get<{ data: DemoAccounts }>('/auth/demo-accounts').then((r) => r.data),
    retry: false,
    staleTime: Infinity,
  });

  if (!loading && user) return <Navigate to={from ?? (user.role === 'admin' ? '/admin' : '/')} replace />;

  async function signIn(e: string, p: string, label = 'form') {
    setError(null);
    setBusy(label);
    try {
      const u = await login(e, p);
      navigate(from ?? (u.role === 'admin' ? '/admin' : '/'), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setBusy(null);
    }
  }

  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    void signIn(email, password);
  };

  const admins = demo.data?.accounts.filter((a) => a.role === 'admin') ?? [];
  const authors = demo.data?.accounts.filter((a) => a.role === 'author') ?? [];

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-50 via-brand-100 to-brand-200 p-12 lg:flex lg:flex-col lg:justify-between">
        <HeroArt className="pointer-events-none absolute inset-0 h-full w-full" />
        <div className="relative">
          <BrandMark size="lg" />
        </div>
        <div className="relative max-w-lg">
          <p className="text-sm font-extrabold tracking-[0.14em] text-brand-700 uppercase">Author portal</p>
          <h1 className="mt-3 text-[52px] leading-[1.05] font-extrabold text-brand-500">Author Support,<br />Made Easy</h1>
          <p className="mt-5 text-[19px] leading-relaxed font-medium text-[#44474d]">
            Track your books and royalties, ask us anything, and get answers right here — no more waiting on email threads.
          </p>
          <ul className="mt-8 space-y-3.5 text-[16px] font-semibold text-ink">
            {[
              [Zap, 'Replies show up the moment our team sends them'],
              [Sparkles, 'Smart triage so urgent issues are seen first'],
              [ShieldCheck, 'You only ever see your own books and tickets'],
            ].map(([Icon, text]) => {
              const I = Icon as typeof Zap;
              return (
                <li key={text as string} className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-full bg-white text-brand-600 shadow-sm">
                    <I className="size-[18px]" />
                  </span>
                  {text as string}
                </li>
              );
            })}
          </ul>
        </div>
        <p className="relative text-sm font-semibold text-brand-800/80">© BookLeaf Publishing · Publishing Made Easy</p>
      </aside>

      <main className="flex items-center justify-center bg-white px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <BrandMark />
          </div>
          <h2 className="text-[32px] font-extrabold">Welcome back</h2>
          <p className="mt-1 text-[15px] text-muted">Sign in with your BookLeaf email and password.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <Field label="Email" htmlFor="email">
              <input id="email" type="email" autoComplete="username" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
            </Field>
            <Field label="Password" htmlFor="password">
              <div className="relative">
                <input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" className={cx(inputCls, 'pr-11')} value={password} onChange={(e) => setPassword(e.target.value)} required />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-faint hover:text-brand-700" aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
            {error && (
              <p role="alert" className="rounded-xl border border-clay-line bg-clay-soft px-3.5 py-2.5 text-sm text-clay">
                {error}
              </p>
            )}
            <Button type="submit" loading={busy === 'form'} className="w-full" icon={<ArrowRight className="size-4" />} disabled={!email || !password}>
              Sign in
            </Button>
          </form>

          {demo.isLoading && (
            <div className="mt-8 flex justify-center">
              <Spinner />
            </div>
          )}

          {demo.data && (
            <section className="mt-8 rounded-2xl border border-dashed border-brand-300 bg-brand-50/60 p-4" aria-label="Demo accounts">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold">Demo accounts</h3>
                <Badge tone="amber">Reviewer shortcut</Badge>
              </div>
              <p className="mt-1 text-sm text-muted">
                One click signs you in. Passwords — authors: <code className="rounded bg-white px-1.5 py-0.5 text-[13px]">{demo.data.authorPassword}</code>, admins: <code className="rounded bg-white px-1.5 py-0.5 text-[13px]">{demo.data.adminPassword}</code>
              </p>

              <p className="mt-4 text-xs font-extrabold tracking-wide text-muted uppercase">Admin / operations</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {admins.map((a) => (
                  <DemoButton key={a.email} name={a.name} sub={a.email} busy={busy === a.email} onClick={() => void signIn(a.email, demo.data!.adminPassword, a.email)} dark />
                ))}
              </div>

              <p className="mt-4 text-xs font-extrabold tracking-wide text-muted uppercase">Authors</p>
              <div className="mt-2 grid max-h-52 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {authors.map((a) => (
                  <DemoButton key={a.email} name={a.name} sub={a.city ?? a.email} busy={busy === a.email} onClick={() => void signIn(a.email, demo.data!.authorPassword, a.email)} />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function DemoButton({ name, sub, onClick, busy, dark }: { name: string; sub: string; onClick: () => void; busy: boolean; dark?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cx(
        'flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-60',
        dark ? 'border-navy-800 bg-navy-800 text-white hover:bg-navy-900' : 'border-line bg-white hover:border-brand-300 hover:bg-brand-50',
      )}
    >
      <span className={cx('grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold', dark ? 'bg-brand-500 text-white' : 'bg-brand-100 text-brand-700')}>
        {busy ? <Spinner className={cx('size-3.5', dark && 'text-white')} /> : name.charAt(0)}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className={cx('block truncate text-xs', dark ? 'text-white/65' : 'text-muted')}>{sub}</span>
      </span>
    </button>
  );
}
