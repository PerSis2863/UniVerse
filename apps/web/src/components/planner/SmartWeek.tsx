'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { format } from 'date-fns';
import { AnimatePresence, LayoutGroup, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { CalendarClock, Check, Info, Layers, ListChecks, Loader2, NotebookPen, Settings2, Target } from 'lucide-react';
import Link from '@/components/ui/Link';
import { authedJson } from '@/lib/authed-fetch';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Study planner → "Your week, scheduled" (upgrade 6). Sessions are placed in free time around
// classes and calendar events by a plain scheduler on the server (no AI); the page re-plans by
// itself when something changed. Tick sessions off; drag one to another day (or "Move to" on a
// phone) and it stays there.

interface Block { id: string; date: string; start: string; end: string; kind: string; title: string; courseCode: string | null; done: boolean; pinned: boolean; movedFrom: string | null }
interface Week { prefs: { capMin: number; start: string; end: string; ical: boolean }; note: string | null; days: { date: string; busy: { start: string; end: string }[]; blocks: Block[] }[] }

const KIND: Record<string, { label: string; icon: typeof Target; cls: string }> = {
  DEADLINE: { label: 'Assignment', icon: NotebookPen, cls: 'from-indigo-500/15 to-indigo-500/5 border-indigo-500/25 text-indigo-700 dark:text-indigo-300' },
  QUIZ: { label: 'Quiz prep', icon: ListChecks, cls: 'from-sky-500/15 to-sky-500/5 border-sky-500/25 text-sky-700 dark:text-sky-300' },
  EXAM: { label: 'Exam prep', icon: Target, cls: 'from-rose-500/15 to-rose-500/5 border-rose-500/25 text-rose-700 dark:text-rose-300' },
  FLASHCARDS: { label: 'Flashcards', icon: Layers, cls: 'from-amber-500/15 to-amber-500/5 border-amber-500/25 text-amber-700 dark:text-amber-300' },
  TASK: { label: 'Task', icon: ListChecks, cls: 'from-fuchsia-500/15 to-fuchsia-500/5 border-fuchsia-500/25 text-fuchsia-700 dark:text-fuchsia-300' },
  REVIEW: { label: 'Review', icon: NotebookPen, cls: 'from-emerald-500/15 to-emerald-500/5 border-emerald-500/25 text-emerald-700 dark:text-emerald-300' },
};
const dayLabel = (d: string, today: string) => (d === today ? 'Today' : format(new Date(`${d}T12:00:00`), 'EEE d'));
const mins = (b: { start: string; end: string }) => (Number(b.end.slice(0, 2)) * 60 + Number(b.end.slice(3))) - (Number(b.start.slice(0, 2)) * 60 + Number(b.start.slice(3)));

export function SmartWeek({ today, tz }: { today: string; tz: string }) {
  const key = `/api/student/smart-plan?today=${today}&tz=${encodeURIComponent(tz)}`;
  const { data, mutate, isLoading } = useSWR<Week>(key, authedJson, { revalidateOnFocus: false });
  const [settings, setSettings] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const patchBlock = async (b: Block, body: Record<string, unknown>, optimistic: (w: Week) => Week) => {
    await mutate((w) => (w ? optimistic(w) : w), { revalidate: false });
    try { await authedJson(`/api/student/smart-plan/blocks/${b.id}`, { method: 'PATCH', body: JSON.stringify(body) }); }
    catch (e) { toast.error((e as Error).message); }
    void mutate();
  };
  const tick = (b: Block) => patchBlock(b, { done: !b.done }, (w) => ({ ...w, days: w.days.map((d) => ({ ...d, blocks: d.blocks.map((x) => (x.id === b.id ? { ...x, done: !b.done } : x)) })) }));
  const move = (b: Block, date: string) => {
    if (date === b.date) return;
    void patchBlock(b, { date, start: b.start }, (w) => ({ ...w, days: w.days.map((d) => ({ ...d, blocks: d.date === date ? [...d.blocks, { ...b, date, pinned: true }].sort((x, y) => x.start.localeCompare(y.start)) : d.blocks.filter((x) => x.id !== b.id) })) }));
    toast.success(`Moved to ${dayLabel(date, today)}. It stays there when your plan updates.`);
  };
  const savePrefs = async (patch: Partial<Week['prefs']>) => {
    setSaving(true);
    try {
      await authedJson('/api/student/smart-plan', { method: 'PATCH', body: JSON.stringify(patch) });
      await mutate();
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };

  const total = data?.days.reduce((n, d) => n + d.blocks.length, 0) ?? 0;
  const doneCount = data?.days.reduce((n, d) => n + d.blocks.filter((b) => b.done).length, 0) ?? 0;

  return (
    <section className="rounded-3xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white flex items-center justify-center shrink-0"><CalendarClock className="w-5 h-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-zinc-900 dark:text-white">Your week, scheduled</h2>
          <p className="text-xs text-zinc-500">Study sessions in your free time, around your classes and events{data ? ` · up to ${data.prefs.capMin} min a day · ${doneCount}/${total} done` : ''}</p>
        </div>
        <button type="button" onClick={() => setSettings((v) => !v)} aria-expanded={settings} className="btn-secondary btn-sm rounded-full inline-flex"><Settings2 className="w-3.5 h-3.5" /> Settings</button>
      </div>

      <AnimatePresence initial={false}>
        {settings && data && (
          <motion.div key="settings" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.smooth} className="overflow-hidden">
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-2xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/70 dark:border-white/[0.06] p-3 text-sm">
              <label className="space-y-1"><span className="block text-xs font-semibold text-zinc-500">Most study a day</span>
                <select value={data.prefs.capMin} disabled={saving} onChange={(e) => void savePrefs({ capMin: Number(e.target.value) })} className="w-full rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 px-3 py-2">
                  {[60, 90, 120, 150, 180, 240].map((m) => <option key={m} value={m}>{m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}` : `${m} min`}</option>)}
                </select>
              </label>
              <label className="space-y-1"><span className="block text-xs font-semibold text-zinc-500">Study between</span>
                <span className="flex items-center gap-2">
                  <input type="time" value={data.prefs.start} disabled={saving} onChange={(e) => e.target.value && void savePrefs({ start: e.target.value })} className="w-full rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 px-2 py-2" />
                  <span className="text-zinc-400">–</span>
                  <input type="time" value={data.prefs.end} disabled={saving} onChange={(e) => e.target.value && void savePrefs({ end: e.target.value })} className="w-full rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 px-2 py-2" />
                </span>
              </label>
              <label className="flex items-start gap-2 sm:pt-5 cursor-pointer">
                <input type="checkbox" checked={data.prefs.ical} disabled={saving} onChange={(e) => void savePrefs({ ical: e.target.checked })} className="mt-0.5 w-4 h-4 accent-emerald-500" />
                <span className="text-xs text-zinc-600 dark:text-zinc-300">Add study sessions to my phone calendar (with the <Link href="/student/calendar" className="text-indigo-500 hover:underline">calendar feed</Link>)</span>
              </label>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {data?.note && (
          <motion.p key={data.note} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring.smooth} role="status"
            className="mt-4 text-sm rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-800 dark:text-sky-200 px-3 py-2 flex items-center gap-2"><Info className="w-4 h-4 shrink-0" /> {data.note}</motion.p>
        )}
      </AnimatePresence>

      {isLoading || !data ? (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-7 gap-2">{Array.from({ length: 7 }, (_, i) => <div key={i} className="h-32 rounded-2xl skeleton" />)}</div>
      ) : (
        <LayoutGroup>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-7 gap-2">
            {data.days.map((d) => {
              const planned = d.blocks.reduce((n, b) => n + mins(b), 0);
              return (
                <div key={d.date}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(d.date); }} onDragLeave={() => setDragOver((x) => (x === d.date ? null : x))}
                  onDrop={(e) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData('text/plain'); const b = data.days.flatMap((x) => x.blocks).find((x) => x.id === id); if (b) move(b, d.date); }}
                  className={cn('min-w-0 rounded-2xl border p-2 transition-colors', d.date === today ? 'border-indigo-500/30 bg-indigo-500/[0.04]' : 'border-zinc-200/70 dark:border-white/[0.06]', dragOver === d.date && 'border-emerald-500/60 bg-emerald-500/[0.06]')}>
                  <p className="px-1 flex items-baseline justify-between gap-1">
                    <span className={cn('text-xs font-bold', d.date === today ? 'text-indigo-600 dark:text-indigo-300' : 'text-zinc-700 dark:text-zinc-200')}>{dayLabel(d.date, today)}</span>
                    {planned > 0 && <span className="text-[10px] text-zinc-500">{planned} min</span>}
                  </p>
                  <div className="mt-1.5 space-y-1.5">
                    {d.busy.length > 0 && <p className="px-1 text-[10px] text-zinc-400 truncate" title={d.busy.map((x) => `${x.start}–${x.end}`).join(', ')}>Busy {d.busy.slice(0, 2).map((x) => `${x.start}–${x.end}`).join(', ')}{d.busy.length > 2 ? '…' : ''}</p>}
                    {d.blocks.length === 0 && <p className="px-1 py-3 text-[11px] text-zinc-400 text-center">Free</p>}
                    <AnimatePresence initial={false}>
                      {d.blocks.map((b) => {
                        const k = KIND[b.kind] ?? KIND.REVIEW;
                        return (
                          <motion.div key={b.id} layout layoutId={b.id} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={spring.smooth}
                            draggable onDragStart={(e) => (e as unknown as React.DragEvent).dataTransfer?.setData('text/plain', b.id)}
                            className={cn('rounded-xl border bg-gradient-to-br p-2 cursor-grab active:cursor-grabbing', k.cls, b.done && 'opacity-60')}>
                            <div className="flex items-start gap-1.5">
                              <button type="button" onClick={() => void tick(b)} aria-pressed={b.done} aria-label={b.done ? 'Mark not done' : 'Mark done'}
                                className={cn('mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors', b.done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-current/40 bg-white/60 dark:bg-white/10')}>
                                {b.done && <Check className="w-2.5 h-2.5" />}
                              </button>
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-semibold tabular-nums">{b.start}–{b.end}</p>
                                <p className={cn('text-xs font-medium text-zinc-900 dark:text-white break-words', b.done && 'line-through')}>{b.title}</p>
                                <p className="text-[10px] opacity-80">{k.label}{b.courseCode ? ` · ${b.courseCode}` : ''}{b.pinned ? ' · moved by you' : ''}</p>
                              </div>
                            </div>
                            <select aria-label="Move to another day" value="" onChange={(e) => e.target.value && move(b, e.target.value)} className="md:hidden mt-1.5 w-full text-[11px] rounded-lg bg-white/70 dark:bg-white/10 border border-black/5 dark:border-white/10 px-2 py-1">
                              <option value="">Move to…</option>
                              {data.days.filter((x) => x.date !== d.date).map((x) => <option key={x.date} value={x.date}>{dayLabel(x.date, today)}</option>)}
                            </select>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </div>
              );
            })}
          </div>
        </LayoutGroup>
      )}
      {saving && <p className="mt-2 text-xs text-zinc-500 inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Updating your plan…</p>}
      <p className="mt-3 text-[11px] text-zinc-500">Drag a session to another day (or use “Move to” on a phone). New deadlines and missed sessions update the plan by themselves next time you open it.</p>
    </section>
  );
}
