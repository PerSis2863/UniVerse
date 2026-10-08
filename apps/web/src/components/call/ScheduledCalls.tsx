'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { format, formatDistanceToNowStrict, isToday, isTomorrow } from 'date-fns';
import { CalendarClock, CalendarPlus, Loader2, Phone, Trash2, Users, Video, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { useLiveInterval } from '@/lib/realtime-client';
import { useNow } from '@/lib/use-now';
import { confirmDialog } from '@/components/ui/Dialogs';
import { fadeUp, list, spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Scheduled calls on the Calls page (src/server/scheduled-calls.ts): what's coming up, a Join
// button from 10 minutes before, and a sheet to book one for a class, group or chat.

interface Upcoming {
  id: string; title: string; kind: 'audio' | 'video'; startAt: string; durationMin: number; room: 'class' | 'group' | 'chat'; roomName: string;
  path: string | null; conversationId: string | null; canCancel: boolean;
}
interface Rooms { classes: { id: string; name: string }[]; groups: { id: string; name: string }[]; chats: { id: string; name: string }[] }

const JOIN_EARLY_MS = 10 * 60_000;

function when(d: Date) {
  const day = isToday(d) ? 'Today' : isTomorrow(d) ? 'Tomorrow' : format(d, 'EEE d MMM');
  return `${day} · ${format(d, 'HH:mm')}`;
}

/** Local date-time for <input aria-label="Date and time" type="datetime-local">, rounded up to the next quarter hour. */
function nextQuarter() {
  const d = new Date(Date.now() + 15 * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduledCalls({ role }: { role?: string }) {
  const router = useRouter();
  const now = useNow();
  // Live updates refresh this when a call is scheduled or cancelled; poll slowly only without them.
  const poll = useLiveInterval(120_000, 0);
  const { data, mutate } = useSWR<Upcoming[]>('/api/calls/scheduled', authedJson, { refreshInterval: poll });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const join = async (c: Upcoming) => {
    if (c.path) return router.push(c.path);
    setBusy(c.id);
    try {
      const r = await authedJson<{ path: string | null; conversationId?: string; kind?: string }>(`/api/calls/scheduled/${c.id}/join`, { method: 'POST' });
      if (r.path) return router.push(r.path);
      const msg = await authedJson<{ id: string }>(`/api/chat/conversations/${r.conversationId}/messages`, { method: 'POST', body: JSON.stringify({ type: 'CALL', kind: r.kind, scheduledId: c.id }) });
      router.push(`/call/${msg.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  };

  const cancel = async (c: Upcoming) => {
    if (!(await confirmDialog({ title: 'Cancel this call?', message: `“${c.title}” will be removed for everyone.`, confirmLabel: 'Cancel call', cancelLabel: 'Keep', destructive: true }))) return;
    await mutate((d) => d?.filter((x) => x.id !== c.id), { revalidate: false });
    try {
      await authedJson(`/api/calls/scheduled/${c.id}`, { method: 'DELETE' });
    } catch (e) {
      toast.error((e as Error).message);
      void mutate();
    }
  };

  const rows = data ?? [];
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5"><CalendarClock className="w-4 h-4" />Upcoming</h2>
        <motion.button whileTap={{ scale: 0.94 }} type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-600/20 transition-colors">
          <CalendarPlus className="w-4 h-4" />Schedule
        </motion.button>
      </div>
      {data && rows.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing scheduled. Book a call for your {role === 'TEACHER' ? 'class' : 'study group'} and everyone gets a reminder.</p>
      ) : !data ? (
        <div className="h-16 rounded-2xl skeleton" />
      ) : (
        <motion.ul variants={list} initial="hidden" animate="show" className={`panel divide-y divide-zinc-200/80 dark:divide-white/[0.06] overflow-hidden`}>
          <AnimatePresence initial={false}>
            {rows.map((c) => {
              const start = new Date(c.startAt);
              const live = now >= start.getTime() && now < start.getTime() + c.durationMin * 60_000;
              const joinable = now >= start.getTime() - JOIN_EARLY_MS && now < start.getTime() + c.durationMin * 60_000;
              const Icon = c.kind === 'video' ? Video : Phone;
              return (
                <motion.li key={c.id} layout variants={fadeUp} exit={{ opacity: 0, height: 0 }} transition={spring.smooth} className="flex items-center gap-3 p-4">
                  <span className={cn('w-11 h-11 rounded-2xl flex items-center justify-center shrink-0', live ? 'bg-emerald-500/15 text-emerald-500' : 'bg-indigo-500/10 text-indigo-500')}><Icon className="w-5 h-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-zinc-900 dark:text-white truncate">{c.title}</span>
                    <span className="block text-xs text-zinc-500 truncate">
                      {live ? <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Happening now</span> : when(start)} · {c.durationMin} min · {c.room === 'class' ? '🎓' : c.room === 'group' ? <Users className="inline w-3 h-3 -mt-0.5" /> : '💬'} {c.roomName}
                    </span>
                  </span>
                  {joinable ? (
                    <motion.button whileTap={{ scale: 0.92 }} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.snappy} type="button" disabled={busy === c.id} onClick={() => void join(c)} className="px-4 py-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-bold shadow-lg shadow-emerald-500/25 transition-colors shrink-0">
                      {busy === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Join'}
                    </motion.button>
                  ) : (
                    <span className="text-xs text-zinc-500 shrink-0 hidden sm:block">in {formatDistanceToNowStrict(start)}</span>
                  )}
                  {c.canCancel && !live && (
                    <button type="button" onClick={() => void cancel(c)} aria-label={`Cancel ${c.title}`} className="p-2 rounded-full text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors shrink-0"><Trash2 className="w-4 h-4" /></button>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </motion.ul>
      )}
      <AnimatePresence>{open && <ScheduleSheet onClose={() => setOpen(false)} onDone={(c) => { void mutate((d) => [...(d ?? []), c].sort((a, b) => a.startAt.localeCompare(b.startAt)), { revalidate: false }); setOpen(false); }} />}</AnimatePresence>
    </section>
  );
}

function ScheduleSheet({ onClose, onDone }: { onClose: () => void; onDone: (c: Upcoming) => void }) {
  const { data: rooms } = useSWR<Rooms>('/api/calls/scheduled?rooms=1', authedJson, { revalidateOnFocus: false });
  const options = useMemo(() => [
    ...(rooms?.classes ?? []).map((r) => ({ value: `class:${r.id}`, label: `🎓 ${r.name}` })),
    ...(rooms?.groups ?? []).map((r) => ({ value: `group:${r.id}`, label: `👥 ${r.name}` })),
    ...(rooms?.chats ?? []).map((r) => ({ value: `chat:${r.id}`, label: `💬 ${r.name}` })),
  ], [rooms]);
  const [room, setRoom] = useState('');
  const [title, setTitle] = useState('');
  const [startAt, setStartAt] = useState(nextQuarter);
  const [durationMin, setDuration] = useState(60);
  const [kind, setKind] = useState<'video' | 'audio'>('video');
  const [saving, setSaving] = useState(false);
  const chosen = room || options[0]?.value || '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen) return toast.error('Join a class, group or chat first.');
    const [kindOfRoom, roomId] = chosen.split(':');
    setSaving(true);
    try {
      const c = await authedJson<Upcoming>('/api/calls/scheduled', { method: 'POST', body: JSON.stringify({ room: kindOfRoom, roomId, title, startAt: new Date(startAt).toISOString(), durationMin, kind }) });
      toast.success(`Scheduled for ${when(new Date(c.startAt))}. Everyone gets a reminder 15 minutes before.`);
      onDone(c);
    } catch (err) {
      toast.error((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-[120] bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <motion.form data-sheet onSubmit={submit} initial={{ y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 40, opacity: 0, scale: 0.98 }} transition={spring.smooth} role="dialog" aria-modal="true" aria-labelledby="schedule-title" className="w-full sm:max-w-md rounded-3xl glass-sidebar border border-zinc-200 dark:border-white/10 shadow-2xl p-5 sheet-safe-bottom sm:pb-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 id="schedule-title" className="text-lg font-bold text-zinc-900 dark:text-white">Schedule a call</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-500"><X className="w-5 h-5" /></button>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-zinc-500">Where</span>
          {!rooms ? <div className="h-10 rounded-xl skeleton" /> : (
            <select value={chosen} onChange={(e) => setRoom(e.target.value)} className="input">
              {options.length === 0 && <option value="">No classes, groups or chats yet</option>}
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-zinc-500">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={chosen.startsWith('class:') ? 'Class call' : 'Study session'} className="input" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5 col-span-2 sm:col-span-1">
            <span className="text-xs font-semibold text-zinc-500">Starts</span>
            <input type="datetime-local" required value={startAt} onChange={(e) => setStartAt(e.target.value)} className="input" />
          </label>
          <label className="block space-y-1.5 col-span-2 sm:col-span-1">
            <span className="text-xs font-semibold text-zinc-500">Length</span>
            <select value={durationMin} onChange={(e) => setDuration(Number(e.target.value))} className="input">
              {[15, 30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`}</option>)}
            </select>
          </label>
        </div>
        <div className="flex gap-2" role="radiogroup" aria-label="Call type">
          {(['video', 'audio'] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={cn('relative flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors', kind === k ? 'text-white' : 'text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-white/[0.05]')}>
              {kind === k && <motion.span layoutId="schedule-kind" className="absolute inset-0 rounded-xl bg-indigo-600" transition={spring.snappy} />}
              <span className="relative inline-flex items-center gap-1.5">{k === 'video' ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}{k === 'video' ? 'Video' : 'Voice'}</span>
            </button>
          ))}
        </div>
        <motion.button whileTap={{ scale: 0.97 }} type="submit" disabled={saving || !chosen} className="btn-primary w-full justify-center">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus className="w-4 h-4" />}Schedule
        </motion.button>
        <p className="text-[11px] text-zinc-500 text-center">Members get an in-app and push reminder 15 minutes before. Class calls also appear on the class calendar.</p>
      </motion.form>
    </motion.div>
  );
}
