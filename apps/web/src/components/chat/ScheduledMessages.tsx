'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { CalendarClock, Check, ChevronDown, Loader2, Pencil, Send, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { plainText, scheduleLabel, type ScheduledItem } from './chat-client';

// Scheduled messages (Stage 4 · 1.4): the sheet for picking when a message goes out, and the bar
// above the message box listing mine in this chat. They're sent by the 15-minute cron, so times
// are quarter hours (src/server/scheduled-messages.ts).

const QUARTER_MS = 15 * 60_000;
const MAX_AHEAD_MS = 30 * 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
/** A local date as YYYY-MM-DD (for the date field). */
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TIMES = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`);
const timeText = (hm: string) => new Date(`2000-01-01T${hm}`).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** Quick choices from `now`: in an hour, this evening, tomorrow morning, Monday morning. */
function quickPicks(now: number) {
  const at = (days: number, h: number) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return d.getTime(); };
  const picks = [{ label: 'In an hour', at: Math.ceil((now + 60 * 60_000) / QUARTER_MS) * QUARTER_MS }];
  if (at(0, 18) - now > 90 * 60_000) picks.push({ label: 'This evening', at: at(0, 18) });
  picks.push({ label: 'Tomorrow morning', at: at(1, 8) });
  const toMonday = (8 - new Date(now).getDay()) % 7 || 7;
  if (toMonday > 1) picks.push({ label: 'Monday morning', at: at(toMonday, 9) });
  return picks;
}

/** Picks when a message goes out (and lets the text be changed first). */
export function ScheduleSheet({ now, title, initialText, initialAt, onSave, onClose }: {
  /** When the sheet was opened: the quick choices are worked out from it. */
  now: number;
  title: string;
  initialText: string;
  /** Editing: the time it's set for now. */
  initialAt?: string;
  onSave: (body: string, sendAt: string) => Promise<void>;
  onClose: () => void;
}) {
  const picks = quickPicks(now);
  const first = initialAt ? new Date(initialAt) : new Date(picks.find((p) => p.label === 'Tomorrow morning')!.at + 3_600_000);
  const [text, setText] = useState(initialText);
  const [choice, setChoice] = useState<number | 'custom'>(initialAt ? 'custom' : picks[0].at);
  const [day, setDay] = useState(ymd(first));
  const [time, setTime] = useState(`${pad(first.getHours())}:${pad(Math.floor(first.getMinutes() / 15) * 15)}`);
  const [busy, setBusy] = useState(false);
  const sendAt = choice === 'custom' ? new Date(`${day}T${time}`).getTime() : choice;

  const save = async () => {
    const t = Date.now();
    if (!text.trim()) return void toast.error('Write a message to schedule.');
    if (!Number.isFinite(sendAt) || sendAt <= t) return void toast.error('That time has passed. Pick a later one.');
    if (sendAt > t + MAX_AHEAD_MS) return void toast.error('You can schedule up to 30 days ahead.');
    setBusy(true);
    try {
      await onSave(text.trim(), new Date(sendAt).toISOString());
      onClose();
    } catch (e) {
      toast.error((e as Error).message || 'Couldn’t schedule it. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px]" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape' && !busy) onClose(); }}>
      <motion.div role="dialog" aria-modal="true" aria-label={title} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 36 }}
        className="w-full sm:max-w-md max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#121830] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:pb-4 space-y-3 shadow-2xl">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><CalendarClock className="w-4 h-4 text-indigo-500" />{title}</p>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="p-1.5 rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={4000} placeholder="Write your message" aria-label="Message"
          className="w-full resize-none rounded-2xl px-3.5 py-2.5 bg-zinc-100 dark:bg-white/[0.06] border border-transparent focus:border-indigo-500/40 focus:outline-none text-[15px] text-zinc-900 dark:text-white placeholder:text-zinc-500" />
        <div role="radiogroup" aria-label="When to send" className="rounded-2xl bg-zinc-100/80 dark:bg-white/[0.04] divide-y divide-zinc-200/80 dark:divide-white/[0.06] overflow-hidden">
          {[...picks.map((p) => ({ key: p.at as number | 'custom', label: p.label, hint: scheduleLabel(new Date(p.at).toISOString()) })), { key: 'custom' as const, label: 'Pick a date and time', hint: '' }].map((o) => (
            <button key={String(o.key)} type="button" role="radio" aria-checked={choice === o.key} onClick={() => setChoice(o.key)}
              className="w-full flex items-center gap-3 px-3.5 py-3 text-left text-sm hover:bg-zinc-200/50 dark:hover:bg-white/[0.04] transition-colors">
              <span className="flex-1 min-w-0">
                <span className="block font-medium text-zinc-900 dark:text-white">{o.label}</span>
                {o.hint && <span className="block text-xs text-zinc-500">{o.hint}</span>}
              </span>
              <span className={cn('w-5 h-5 rounded-full flex items-center justify-center transition-colors', choice === o.key ? 'bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white' : 'border-2 border-zinc-300 dark:border-zinc-600')}>
                {choice === o.key && <Check className="w-3 h-3" strokeWidth={3} />}
              </span>
            </button>
          ))}
        </div>
        <AnimatePresence initial={false}>
          {choice === 'custom' && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 36 }} className="overflow-hidden">
              <div className="flex gap-2 pt-0.5">
                <input type="date" value={day} min={ymd(new Date(now))} max={ymd(new Date(now + MAX_AHEAD_MS))} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Date"
                  className="flex-1 min-w-0 h-11 px-3 rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-sm text-zinc-900 dark:text-white [color-scheme:light] dark:[color-scheme:dark]" />
                <select value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time"
                  className="w-32 h-11 px-3 rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-sm text-zinc-900 dark:text-white">
                  {TIMES.map((t) => <option key={t} value={t}>{timeText(t)}</option>)}
                </select>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <button type="button" onClick={() => void save()} disabled={busy || !text.trim()}
          className="w-full h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 disabled:opacity-50 active:scale-[0.98] transition-transform">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
          {Number.isFinite(sendAt) ? `Send ${scheduleLabel(new Date(sendAt).toISOString()).replace(/^Today/, 'today').replace(/^Tomorrow/, 'tomorrow')}` : 'Schedule'}
        </button>
      </motion.div>
    </div>,
    document.body,
  );
}

/** Above the message box: my scheduled messages here, with Send now, Edit and Delete. */
export function ScheduledBar({ items, onSendNow, onEdit, onDelete }: {
  items: ScheduledItem[];
  onSendNow: (item: ScheduledItem) => Promise<void>;
  onEdit: (item: ScheduledItem) => void;
  onDelete: (item: ScheduledItem) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (id: string, work: () => Promise<void>) => {
    setBusy(id);
    try { await work(); } finally { setBusy(null); }
  };
  if (!items.length) return null;
  return (
    <div className="px-3 md:px-4 pt-2">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="w-full flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-indigo-500/[0.08] dark:bg-indigo-400/10 text-sm text-left">
        <CalendarClock className="w-4 h-4 text-indigo-500 shrink-0" />
        <span className="font-medium text-zinc-800 dark:text-zinc-100 shrink-0">{items.length === 1 ? '1 scheduled message' : `${items.length} scheduled messages`}</span>
        <span className="text-zinc-500 truncate">· {items.length === 1 ? '' : 'next '}{scheduleLabel(items[0].sendAt)}</span>
        <ChevronDown className={cn('ml-auto w-4 h-4 text-zinc-400 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            className="overflow-hidden max-h-64 overflow-y-auto" aria-label="Scheduled messages">
            {items.map((it) => (
              <li key={it.id} className="flex items-start gap-2 px-3.5 py-2.5 border-b border-zinc-200/70 dark:border-white/[0.06] last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-300">{scheduleLabel(it.sendAt)}</p>
                  <p className="text-sm text-zinc-800 dark:text-zinc-200 line-clamp-2 break-words">{plainText(it.body)}</p>
                </div>
                {busy === it.id ? <Loader2 className="w-4 h-4 mt-2 mr-2 animate-spin text-zinc-400" /> : (
                  <div className="flex items-center shrink-0">
                    <button type="button" onClick={() => void run(it.id, () => onSendNow(it))} aria-label="Send now" title="Send now" className="p-2 rounded-full text-zinc-500 hover:text-indigo-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"><Send className="w-4 h-4" /></button>
                    <button type="button" onClick={() => onEdit(it)} aria-label="Edit" title="Edit" className="p-2 rounded-full text-zinc-500 hover:text-indigo-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"><Pencil className="w-4 h-4" /></button>
                    <button type="button" onClick={() => void run(it.id, () => onDelete(it))} aria-label="Delete" title="Delete" className="p-2 rounded-full text-zinc-500 hover:text-rose-500 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button>
                  </div>
                )}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
