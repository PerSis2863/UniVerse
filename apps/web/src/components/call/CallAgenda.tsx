'use client';

import { useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ListOrdered, Pencil, Play, Plus, Square, Trash2, X } from 'lucide-react';
import { agendaClock, clockText, MEETING_TEMPLATES, totalMinutes, type Agenda, type AgendaItem } from '@/lib/call-agenda';
import { useTick } from '@/lib/use-now';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// The call's agenda (Stage 5 · B8.3; src/lib/call-agenda.ts): a bar on the call with the item
// running and its time left (amber in the last minute, red when it runs over), the hosts' buttons
// to move on, and the hosts' editor (with meeting templates, B8.2).

export function AgendaBar({ agenda, skew, canRun, onGo, onEdit }: { agenda: Agenda | null; skew: number; canRun: boolean; onGo: (n: number) => void; onEdit: () => void }) {
  const running = !!agenda && agenda.current !== null;
  const now = useTick(running) + skew;
  if (!agenda) return null;
  const c = agendaClock(agenda, now);
  if (!c) {
    return canRun ? (
      <div className="pointer-events-auto mx-auto rounded-full bg-black/45 backdrop-blur-xl border border-white/10 pl-3 pr-1 py-1 flex items-center gap-2 text-xs">
        <ListOrdered className="w-3.5 h-3.5 text-sky-300" aria-hidden />
        <span className="text-zinc-200">Agenda ready · {agenda.items.length} items · {totalMinutes(agenda.items)} min</span>
        <button type="button" onClick={() => onGo(0)} className="h-7 px-3 rounded-full bg-white text-zinc-900 font-semibold inline-flex items-center gap-1"><Play className="w-3 h-3" />Start</button>
        <button type="button" onClick={onEdit} aria-label="Edit the agenda" className="p-1.5 rounded-full hover:bg-white/10"><Pencil className="w-3.5 h-3.5" /></button>
      </div>
    ) : null;
  }
  const total = c.item.minutes * 60;
  const pct = Math.min(100, (c.elapsed / total) * 100);
  return (
    <div role="timer" aria-live="off" aria-label={`${c.item.title}: ${c.overrun ? `over by ${clockText(c.left)}` : `${clockText(c.left)} left`}`}
      className={cn('pointer-events-auto rounded-2xl backdrop-blur-xl border px-3 py-2 shadow-xl', c.overrun ? 'bg-rose-950/70 border-rose-400/40' : c.soon ? 'bg-amber-950/60 border-amber-400/40' : 'bg-black/50 border-white/10')}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wide text-zinc-400">{c.index + 1} of {agenda.items.length}{c.item.who ? ` · ${c.item.who}` : ''}</p>
          <p className="text-sm font-semibold truncate">{c.item.title}</p>
        </div>
        <p className={cn('text-lg font-bold tabular-nums shrink-0', c.overrun ? 'text-rose-300' : c.soon ? 'text-amber-300' : 'text-white')}>{c.overrun ? `+${clockText(c.left)}` : clockText(c.left)}</p>
        {canRun && (
          <div className="flex items-center shrink-0">
            <button type="button" onClick={() => onGo(c.index - 1)} disabled={c.index === 0} aria-label="Previous item" className="p-1.5 rounded-full hover:bg-white/10 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
            {c.last
              ? <button type="button" onClick={() => onGo(-1)} className="h-7 px-2.5 rounded-full bg-white text-zinc-900 text-xs font-semibold">Finish</button>
              : <button type="button" onClick={() => onGo(c.index + 1)} aria-label={`Next: ${c.next?.title ?? ''}`} className="p-1.5 rounded-full hover:bg-white/10"><ChevronRight className="w-4 h-4" /></button>}
            {!c.last && <button type="button" onClick={() => onGo(-1)} aria-label="Stop the agenda" className="p-1.5 rounded-full hover:bg-white/10"><Square className="w-3.5 h-3.5" /></button>}
            <button type="button" onClick={onEdit} aria-label="Edit the agenda" className="p-1.5 rounded-full hover:bg-white/10"><Pencil className="w-3.5 h-3.5" /></button>
          </div>
        )}
      </div>
      <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden" aria-hidden>
        <div className={cn('h-full transition-[width] duration-500', c.overrun ? 'bg-rose-400' : c.soon ? 'bg-amber-400' : 'bg-sky-400')} style={{ width: `${pct}%` }} />
      </div>
      {c.overrun && <p className="mt-1 text-[11px] text-rose-200">Over time{c.next ? ` · next: ${c.next.title}` : ''}</p>}
      {c.soon && <p className="mt-1 text-[11px] text-amber-200">Less than a minute left{c.next ? ` · next: ${c.next.title}` : ''}</p>}
    </div>
  );
}

export function AgendaEditor({ open, agenda, canRun, onClose, onSave, onClear }: {
  open: boolean; agenda: Agenda | null; canRun: boolean; onClose: () => void;
  onSave: (items: AgendaItem[], start: boolean) => void; onClear: () => void;
}) {
  const [items, setItems] = useState<AgendaItem[]>(() => agenda?.items ?? []);
  const [seen, setSeen] = useState(agenda);
  // The agenda changed in the room (another host): start from that.
  if (agenda !== seen) { setSeen(agenda); setItems(agenda?.items ?? []); }
  const set = (i: number, patch: Partial<AgendaItem>) => setItems((l) => l.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => setItems((l) => { const n = l.slice(); const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const clean = items.map((i) => ({ ...i, title: i.title.trim(), who: i.who?.trim() || null })).filter((i) => i.title);
  const running = agenda?.current !== null && agenda?.current !== undefined;
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 z-30 bg-black/40" aria-hidden />
          <motion.div key="agenda" role="dialog" aria-label="Agenda" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 28 }} transition={spring.smooth}
            className="absolute z-40 inset-x-0 bottom-0 max-h-[85vh] rounded-t-3xl sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:bottom-auto sm:top-[calc(env(safe-area-inset-top)+4.5rem)] sm:w-[30rem] sm:max-h-[calc(100%-11rem)] sm:rounded-3xl bg-[#121830]/95 backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] sm:pb-0">
            <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2">
              <div>
                <p className="font-semibold flex items-center gap-1.5"><ListOrdered className="w-4 h-4 text-sky-300" aria-hidden />Agenda</p>
                <p className="text-[11px] text-zinc-400">{canRun ? 'Everyone sees the item running and its time left.' : 'Set by the hosts.'}</p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-2">
              {canRun && (
                <label className="block text-xs text-zinc-400">Start from a template
                  <select defaultValue="" onChange={(e) => { const t = MEETING_TEMPLATES.find((x) => x.id === e.target.value); if (t) setItems(t.agenda.map((i) => ({ ...i }))); e.target.value = ''; }} className="mt-1 w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white">
                    <option value="" disabled>Choose…</option>
                    {MEETING_TEMPLATES.map((t) => <option key={t.id} value={t.id} className="text-zinc-900">{t.name}: {t.hint}</option>)}
                  </select>
                </label>
              )}
              {!items.length && <p className="text-sm text-zinc-400 py-3">No agenda yet.{canRun ? ' Add items, or start from a template.' : ''}</p>}
              <ol className="space-y-2">
                {items.map((it, i) => (
                  <li key={i} className={cn('rounded-2xl bg-white/[0.06] p-2.5', agenda?.current === i && 'ring-1 ring-sky-400/60')}>
                    {canRun ? (
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <input value={it.title} onChange={(e) => set(i, { title: e.target.value.slice(0, 80) })} aria-label={`Item ${i + 1}`} placeholder="What happens" className="rounded-lg bg-white/10 px-2.5 py-1.5 text-sm" />
                        <label className="flex items-center gap-1 text-xs text-zinc-400"><input type="number" min={1} max={240} value={it.minutes} onChange={(e) => set(i, { minutes: Math.max(1, Math.min(240, Number(e.target.value) || 1)) })} aria-label={`Minutes for item ${i + 1}`} className="w-14 rounded-lg bg-white/10 px-2 py-1.5 text-sm text-white tabular-nums" />min</label>
                        <input value={it.who ?? ''} onChange={(e) => set(i, { who: e.target.value.slice(0, 60) })} aria-label={`Who leads item ${i + 1}`} placeholder="Who (optional)" className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs" />
                        <div className="flex items-center justify-end gap-0.5">
                          <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move item ${i + 1} up`} className="p-1 rounded-md hover:bg-white/10 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                          <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Move item ${i + 1} down`} className="p-1 rounded-md hover:bg-white/10 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                          <button type="button" onClick={() => setItems((l) => l.filter((_, k) => k !== i))} aria-label={`Remove item ${i + 1}`} className="p-1 rounded-md hover:bg-white/10 hover:text-rose-300"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm flex justify-between gap-2"><span className="min-w-0 truncate">{i + 1}. {it.title}{it.who ? <span className="text-zinc-400"> · {it.who}</span> : null}</span><span className="tabular-nums text-zinc-400 shrink-0">{it.minutes} min</span></p>
                    )}
                  </li>
                ))}
              </ol>
              {canRun && items.length < 20 && <button type="button" onClick={() => setItems((l) => [...l, { title: '', minutes: 5, who: null }])} className="w-full h-9 rounded-full border border-dashed border-white/20 text-xs font-semibold text-zinc-300 hover:bg-white/5 inline-flex items-center justify-center gap-1"><Plus className="w-3.5 h-3.5" />Add an item</button>}
            </div>
            {canRun && (
              <div className="p-3 border-t border-white/[0.06] flex items-center gap-2">
                <span className="text-xs text-zinc-400 flex-1 tabular-nums">{clean.length} items · {totalMinutes(clean)} min</span>
                {agenda && <button type="button" onClick={onClear} className="h-9 px-3 rounded-full text-xs font-semibold text-rose-300 hover:bg-rose-500/10">Clear</button>}
                {running ? (
                  <button type="button" disabled={!clean.length} onClick={() => onSave(clean, false)} className="h-9 px-4 rounded-full bg-white text-zinc-900 text-xs font-bold disabled:opacity-40">Save</button>
                ) : (
                  <>
                    <button type="button" disabled={!clean.length} onClick={() => onSave(clean, false)} className="h-9 px-3 rounded-full bg-white/10 hover:bg-white/20 text-xs font-semibold disabled:opacity-40">Save</button>
                    <button type="button" disabled={!clean.length} onClick={() => onSave(clean, true)} className="h-9 px-3 rounded-full bg-white text-zinc-900 text-xs font-bold disabled:opacity-40 inline-flex items-center gap-1"><Play className="w-3 h-3" />Save and start</button>
                  </>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
