import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { cx } from '../components/ui';

type Tone = 'success' | 'info' | 'error';
interface ToastItem {
  id: number;
  tone: Tone;
  title: string;
  body?: string;
}

const ToastContext = createContext<{ push: (t: Omit<ToastItem, 'id'>) => void } | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (t: Omit<ToastItem, 'id'>) => {
      const id = ++seq;
      setItems((xs) => [...xs.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), t.tone === 'error' ? 7000 : 4500);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ push }), [push]);

  const Icon = { success: CheckCircle2, info: Info, error: TriangleAlert };
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-end gap-2 p-4 sm:p-6" role="status" aria-live="polite">
        {items.map((t) => {
          const I = Icon[t.tone];
          return (
            <div
              key={t.id}
              className={cx(
                'pop-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-white p-3.5 shadow-lg shadow-black/5',
                t.tone === 'success' && 'border-ok-200',
                t.tone === 'info' && 'border-line',
                t.tone === 'error' && 'border-clay-line',
              )}
            >
              <I className={cx('mt-0.5 size-5 shrink-0', t.tone === 'success' && 'text-ok-600', t.tone === 'info' && 'text-sky-ink', t.tone === 'error' && 'text-clay')} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.title}</p>
                {t.body && <p className="mt-0.5 text-sm text-muted">{t.body}</p>}
              </div>
              <button onClick={() => dismiss(t.id)} className="rounded p-0.5 text-faint hover:text-ink" aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
