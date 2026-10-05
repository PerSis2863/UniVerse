'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { PRESENCE_LABEL, type Presence } from '@/lib/presence';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Your availability and custom status (Messages): Online, Busy, In class, Studying, Sleeping or
// Invisible, plus a short message with an emoji, for a while or until you change it. Busy, In class
// and Sleeping are Focus modes: calls don't ring you and notifications wait (favourites still can).

const DOT: Record<Presence, string> = { auto: 'bg-emerald-500', busy: 'bg-rose-500', in_class: 'bg-amber-500', studying: 'bg-sky-500', sleeping: 'bg-violet-500', invisible: 'bg-zinc-400' };
const HINT: Partial<Record<Presence, string>> = { busy: 'Focus: calls don’t ring', in_class: 'Focus: calls don’t ring', sleeping: 'Focus: calls don’t ring', invisible: 'You look offline' };
const EMOJIS = ['📚', '🎧', '🏫', '☕', '🏃', '🤒', '✈️', '🎉'];
const DURATIONS: [number, string][] = [[0, 'Until I change it'], [30, '30 minutes'], [60, '1 hour'], [240, '4 hours'], [-1, 'Today']];
const ORDER: Presence[] = ['auto', 'busy', 'in_class', 'studying', 'sleeping', 'invisible'];

interface Mine { presence: Presence; statusText: string | null; statusEmoji: string | null; statusUntil: string | null; effective: { presence: Presence; hidden: boolean } }

export function PresencePicker() {
  const { data, mutate } = useSWR<Mine>('/api/me/presence', authedJson, { revalidateOnFocus: false });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ presence: Presence; text: string; emoji: string; minutes: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const current: Presence = data ? (data.effective.hidden ? 'invisible' : data.effective.presence) : 'auto';

  const begin = () => {
    setDraft({ presence: current, text: data?.statusText ?? '', emoji: data?.statusEmoji ?? '', minutes: 0 });
    setOpen(true);
  };
  const save = async (clear = false) => {
    if (!draft) return;
    setBusy(true);
    const minutes = draft.minutes === -1 ? Math.max(1, Math.round((new Date().setHours(23, 59, 0, 0) - Date.now()) / 60_000)) : draft.minutes;
    try {
      await authedJson('/api/me/presence', { method: 'PATCH', body: JSON.stringify(clear ? { presence: 'auto', statusText: '', statusEmoji: '', minutes: 0 } : { presence: draft.presence, statusText: draft.text, statusEmoji: draft.emoji, minutes }) });
      await mutate();
      setOpen(false);
      toast.success(clear ? 'Status cleared' : 'Status updated');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => (open ? setOpen(false) : begin())} aria-label={`Your status: ${PRESENCE_LABEL[current]}`} title={`Your status: ${PRESENCE_LABEL[current]}`} aria-expanded={open}
        className="h-8 pl-2 pr-2.5 rounded-full bg-zinc-100 dark:bg-white/[0.06] hover:bg-zinc-200 dark:hover:bg-white/10 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 max-w-[9rem]">
        <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', DOT[current])} />
        <span className="truncate">{data?.statusEmoji ? `${data.statusEmoji} ` : ''}{data?.statusText || PRESENCE_LABEL[current]}</span>
      </button>
      <AnimatePresence>
        {open && draft && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={spring.snappy}
            className="absolute right-0 top-10 z-40 w-72 p-3 rounded-2xl bg-white dark:bg-[#161b2e] border border-zinc-200 dark:border-white/10 shadow-2xl space-y-3" role="dialog" aria-label="Set your status">
            <ul className="space-y-0.5" role="radiogroup" aria-label="Availability">{ORDER.map((p) => (
              <li key={p}>
                <button type="button" role="radio" aria-checked={draft.presence === p} onClick={() => setDraft({ ...draft, presence: p })} className={cn('w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left text-sm transition-colors', draft.presence === p ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-200' : 'hover:bg-zinc-100 dark:hover:bg-white/[0.06] text-zinc-700 dark:text-zinc-200')}>
                  <span className={cn('w-2.5 h-2.5 rounded-full', DOT[p])} />
                  <span className="flex-1">{PRESENCE_LABEL[p]}</span>
                  {HINT[p] && <span className="text-[10px] text-zinc-500">{HINT[p]}</span>}
                </button>
              </li>
            ))}</ul>
            <div className="space-y-2">
              <div className="flex gap-1">{EMOJIS.map((e) => (
                <button key={e} type="button" onClick={() => setDraft({ ...draft, emoji: draft.emoji === e ? '' : e })} aria-pressed={draft.emoji === e} className={cn('w-8 h-8 rounded-lg text-base', draft.emoji === e ? 'bg-indigo-500/15 ring-1 ring-indigo-400' : 'hover:bg-zinc-100 dark:hover:bg-white/[0.06]')}>{e}</button>
              ))}</div>
              <input value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} maxLength={80} placeholder="What are you up to? (optional)" className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40" />
              <select value={draft.minutes} onChange={(e) => setDraft({ ...draft, minutes: Number(e.target.value) })} aria-label="For how long" className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-sm text-zinc-900 dark:text-white">
                {DURATIONS.map(([m, label]) => <option key={m} value={m}>{label}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void save(true)} disabled={busy} className="btn-secondary flex-1 justify-center">Clear</button>
              <button type="button" onClick={() => void save()} disabled={busy} className="btn-primary flex-1 justify-center">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
