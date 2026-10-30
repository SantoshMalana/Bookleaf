import { Bot, Lock, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { dateTime } from '../lib/format';
import type { Message } from '../lib/types';
import { cx } from './ui';

interface Props {
  messages: Message[];
  /** Admins see internal notes + events; authors only ever receive public messages from the API. */
  viewer: 'author' | 'admin';
  firstMessage?: { name: string; body: string; at: string };
}

/** Conversation view. Author bubbles on the left, BookLeaf replies on the right (green). */
export function TicketThread({ messages, viewer, firstMessage }: Props) {
  return (
    <ol className="space-y-4">
      {firstMessage && <Bubble role="author" name={firstMessage.name} at={firstMessage.at} body={firstMessage.body} viewer={viewer} original />}
      {messages.map((m) =>
        m.kind === 'event' ? (
          <li key={m.id} className="flex items-center gap-2 px-2 text-xs text-muted">
            <Bot className="size-3.5 shrink-0" />
            <span>{m.body}</span>
            <span className="text-faint">· {dateTime(m.createdAt)}</span>
          </li>
        ) : (
          <Bubble key={m.id} role={m.senderRole} name={m.senderName} at={m.createdAt} body={m.body} internal={m.kind === 'internal'} aiAssist={m.aiAssist} viewer={viewer} />
        ),
      )}
    </ol>
  );
}

function Bubble({ role, name, at, body, internal, original, aiAssist, viewer }: { role: Message['senderRole']; name: string; at: string; body: string; internal?: boolean; original?: boolean; aiAssist?: Message['aiAssist']; viewer: 'author' | 'admin' }) {
  const staff = role === 'admin';
  return (
    <li className={cx('flex', staff && !internal ? 'justify-end' : 'justify-start')}>
      <div
        className={cx(
          'max-w-[92%] rounded-2xl border px-4 py-3 sm:max-w-[80%]',
          internal ? 'border-dashed border-amber-line bg-amber-soft' : staff ? 'border-brand-200 bg-brand-50' : 'border-line bg-white',
        )}
      >
        <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          <span className="grid size-5 place-items-center rounded-full bg-black/5">{staff ? <ShieldCheck className="size-3 text-brand-700" /> : <UserRound className="size-3 text-muted" />}</span>
          <span className="font-semibold text-ink">{name}</span>
          {staff && viewer === 'author' && <span className="text-brand-700">BookLeaf team</span>}
          {original && <span className="rounded bg-black/5 px-1.5 py-px text-[10px] font-semibold tracking-wide text-muted uppercase">Original query</span>}
          {internal && (
            <span className="inline-flex items-center gap-1 rounded bg-amber-ink/10 px-1.5 py-px text-[10px] font-semibold tracking-wide text-amber-ink uppercase">
              <Lock className="size-2.5" /> Internal — not visible to author
            </span>
          )}
          {viewer === 'admin' && aiAssist?.fromDraft && (
            <span className="inline-flex items-center gap-1 text-[11px] text-brand-700">
              <Sparkles className="size-3" /> {aiAssist.edited ? 'AI draft, edited' : 'AI draft, sent as is'}
            </span>
          )}
          <span className="text-faint">{dateTime(at)}</span>
        </div>
        <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{body}</p>
      </div>
    </li>
  );
}
