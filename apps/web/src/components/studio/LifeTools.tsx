'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { m as motion } from 'framer-motion';
import { Pause, Play, Plus, SkipForward, Trash2 } from 'lucide-react';
import { celebrate } from '@/lib/celebrate';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Ring } from '@/components/instruments/parts';
import { Btn, CopyBtn, Field } from './QuickTools';
import { today, uid, useKept } from './kept';
import { ask, BRANCH, MONEY, nf, Stat } from './bits';

// Collaborate → Create → Plan and organise, fifth set (M75): a Kanban board, an event planner, a
// trip planner, routines, a day planner, a RACI chart, a sleep log, OKRs and birthdays. Kept on the
// device; Save puts them on the account.

export type LifeId = 'kanban' | 'event' | 'trip' | 'routine' | 'dayplan' | 'raci' | 'sleep' | 'okr' | 'birthdays';

export function LifeTool({ id }: { id: LifeId }) {
  const T = { kanban: Kanban, event: EventPlan, trip: Trip, routine: Routine, dayplan: DayPlan, raci: Raci, sleep: Sleep, okr: Okr, birthdays: Birthdays }[id];
  return <T />;
}

interface Card { id: string; text: string; tag: number }
const COLS = ['To do', 'Doing', 'Done'];
/** Kanban: cards in columns; drag them along (or use the arrows); a limit on Doing. */
function Kanban() {
  const [b, setB] = useKept('uv-kanban', () => ({ cols: COLS, cards: [[{ id: uid(), text: 'Plan the poster', tag: 0 }, { id: uid(), text: 'Find three sources', tag: 1 }], [{ id: uid(), text: 'Write the intro', tag: 2 }], []] as Card[][], limit: 3 }));
  const [text, setText] = useState(''), [over, setOver] = useState<number | null>(null);
  const move = (id: string, to: number, at?: number) => {
    const card = b.cards.flat().find((c) => c.id === id); if (!card) return;
    const cards = b.cards.map((c) => c.filter((x) => x.id !== id));
    cards[to] = [...cards[to]]; cards[to].splice(at ?? cards[to].length, 0, card);
    setB({ ...b, cards });
    if (to === b.cols.length - 1) celebrate();
  };
  return (
    <div className="space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; setB({ ...b, cards: b.cards.map((c, i) => (i === 0 ? [...c, { id: uid(), text: text.trim(), tag: b.cards.flat().length % BRANCH.length }] : c)) }); setText(''); }} className="flex gap-2">
        <input className="input flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="A new card for “To do”" aria-label="New card" />
        <button type="submit" className="btn-primary btn-sm"><Plus className="w-4 h-4" aria-hidden />Add</button>
        <Btn onClick={() => { const n = window.prompt('Name of the new column'); if (n?.trim()) setB({ ...b, cols: [...b.cols.slice(0, -1), n.trim().slice(0, 30), b.cols[b.cols.length - 1]], cards: [...b.cards.slice(0, -1), [], b.cards[b.cards.length - 1]] }); }}>Column</Btn>
      </form>
      <div tabIndex={0} role="region" aria-label="Board" className="relative overflow-x-auto pb-2 focus-visible:outline-2 focus-visible:outline-pink-500">
        <div className="grid gap-3 min-w-[720px]" style={{ gridTemplateColumns: `repeat(${b.cols.length}, minmax(0, 1fr))` }}>
          {b.cols.map((col, ci) => { const full = ci === 1 && b.cards[ci].length > b.limit; return (
            <section key={ci} aria-label={col} onDragOver={(e) => { if (e.dataTransfer.types.includes('text/x-uv-card')) { e.preventDefault(); setOver(ci); } }} onDragLeave={() => setOver(null)} onDrop={(e) => { setOver(null); const id = e.dataTransfer.getData('text/x-uv-card'); if (id) move(id, ci); }}
              className={cn('rounded-2xl p-2 space-y-2 min-h-40 transition-colors ring-1', over === ci ? 'bg-pink-500/10 ring-pink-500/50' : full ? 'bg-rose-500/10 ring-rose-500/40' : 'bg-zinc-100/70 dark:bg-white/[0.04] ring-zinc-200 dark:ring-white/10')}>
              <h3 className="px-1 text-sm font-bold text-zinc-900 dark:text-white flex justify-between">{col}<span className="font-mono tabular-nums font-normal text-zinc-600 dark:text-zinc-300">{b.cards[ci].length}{ci === 1 ? `/${b.limit}` : ''}</span></h3>
              <ul className="space-y-1.5">
                {b.cards[ci].map((c) => (
                  <motion.li key={c.id} layout transition={spring.smooth}>
                    <div draggable onDragStart={(e) => { e.dataTransfer.setData('text/x-uv-card', c.id); e.dataTransfer.effectAllowed = 'move'; }} className="group rounded-xl bg-white dark:bg-indigo-900/60 p-2.5 shadow-sm ring-1 ring-black/5 dark:ring-white/10 cursor-grab active:cursor-grabbing border-s-4" style={{ borderInlineStartColor: BRANCH[c.tag % BRANCH.length] }}>
                      <p className="text-sm text-zinc-900 dark:text-white break-words" translate="no">{c.text}</p>
                      <div className="mt-1 flex gap-1 justify-end">
                        {ci > 0 && <button type="button" onClick={() => move(c.id, ci - 1)} className="rounded px-1.5 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10" aria-label={`Move “${c.text}” back`}>‹</button>}
                        {ci < b.cols.length - 1 && <button type="button" onClick={() => move(c.id, ci + 1)} className="rounded px-1.5 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10" aria-label={`Move “${c.text}” on`}>›</button>}
                        <button type="button" onClick={() => setB({ ...b, cards: b.cards.map((x) => x.filter((y) => y.id !== c.id)) })} aria-label={`Delete “${c.text}”`} className="rounded px-1 text-zinc-500 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" aria-hidden /></button>
                      </div>
                    </div>
                  </motion.li>
                ))}
              </ul>
            </section>
          ); })}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">Most cards in “{b.cols[1]}” at once<input type="number" min={1} max={20} className="input w-20" value={b.limit} onChange={(e) => setB({ ...b, limit: Math.max(1, Math.min(20, +e.target.value || 3)) })} /></label>
    </div>
  );
}

interface Guest { id: string; name: string; rsvp: 'yes' | 'no' | 'maybe' | '?' }
interface Cost { id: string; what: string; amount: number }
/** Event planner: guest list with replies, a budget, and a to-do list. */
function EventPlan() {
  const [e, setE] = useKept('uv-event', () => ({ name: 'Class party', date: '', place: '', cur: '₹', budget: 5000, guests: [] as Guest[], costs: [] as Cost[], todo: '' }));
  const [g, setG] = useState(''), [w, setW] = useState(''), [a, setA] = useState('');
  const spent = e.costs.reduce((x, c) => x + c.amount, 0), count = (r: Guest['rsvp']) => e.guests.filter((x) => x.rsvp === r).length;
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-4"><Field label="Event"><input className="input" value={e.name} onChange={(x) => setE({ ...e, name: x.target.value })} /></Field><Field label="Date"><input type="date" className="input" value={e.date} onChange={(x) => setE({ ...e, date: x.target.value })} /></Field><Field label="Place"><input className="input" value={e.place} onChange={(x) => setE({ ...e, place: x.target.value })} /></Field><Field label="Budget"><input className="input font-mono" inputMode="numeric" value={e.budget} onChange={(x) => setE({ ...e, budget: Math.max(0, +x.target.value || 0) })} /></Field></div>
      <dl className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm"><Stat k="Invited" v={e.guests.length} /><Stat k="Coming" v={count('yes')} /><Stat k="Maybe" v={count('maybe')} /><Stat k="Spent" v={`${e.cur}${nf(spent, 0)}`} /><Stat k="Left" v={<span className={cn(spent > e.budget && 'text-rose-600 dark:text-rose-300')}>{e.cur}{nf(e.budget - spent, 0)}</span>} /></dl>
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Guests" className="space-y-2">
          <h3 className="font-bold text-zinc-900 dark:text-white">Guests</h3>
          <form onSubmit={(x) => { x.preventDefault(); const names = g.split(/[\n,]/).map((n) => n.trim()).filter(Boolean); if (names.length) { setE({ ...e, guests: [...e.guests, ...names.map((name) => ({ id: uid(), name, rsvp: '?' as const }))] }); setG(''); } }} className="flex gap-2"><input className="input" value={g} onChange={(x) => setG(x.target.value)} placeholder="Names, split by commas" aria-label="Add guests" /><button type="submit" className="btn-secondary btn-sm"><Plus className="w-4 h-4" aria-hidden />Add</button></form>
          <ul className="divide-y divide-zinc-200 dark:divide-white/10">{e.guests.map((x) => (
            <li key={x.id} className="flex items-center gap-2 py-1.5"><span className="flex-1 text-sm text-zinc-900 dark:text-white" translate="no">{x.name}</span>
              {(['yes', 'maybe', 'no'] as const).map((r) => <button key={r} type="button" onClick={() => setE({ ...e, guests: e.guests.map((y) => (y.id === x.id ? { ...y, rsvp: y.rsvp === r ? '?' : r } : y)) })} aria-pressed={x.rsvp === r} className={cn('rounded-full px-2 py-0.5 text-xs font-semibold ring-1', x.rsvp === r ? (r === 'yes' ? 'bg-emerald-600 text-white ring-emerald-600' : r === 'no' ? 'bg-rose-600 text-white ring-rose-600' : 'bg-amber-400 text-zinc-900 ring-amber-400') : 'ring-zinc-300 dark:ring-white/20 text-zinc-700 dark:text-zinc-200')}>{r}</button>)}
              <button type="button" onClick={() => setE({ ...e, guests: e.guests.filter((y) => y.id !== x.id) })} aria-label={`Remove ${x.name}`} className="btn-ghost btn-icon"><Trash2 className="w-4 h-4" aria-hidden /></button></li>
          ))}</ul>
        </section>
        <section aria-label="Costs" className="space-y-2">
          <h3 className="font-bold text-zinc-900 dark:text-white">Costs</h3>
          <form onSubmit={(x) => { x.preventDefault(); const n = Number(a); if (w.trim() && n > 0) { setE({ ...e, costs: [...e.costs, { id: uid(), what: w.trim(), amount: n }] }); setW(''); setA(''); } }} className="flex gap-2"><input className="input" value={w} onChange={(x) => setW(x.target.value)} placeholder="What" aria-label="Cost" /><input className="input w-28 font-mono" inputMode="decimal" value={a} onChange={(x) => setA(x.target.value)} placeholder="Amount" aria-label="Amount" /><button type="submit" className="btn-secondary btn-sm"><Plus className="w-4 h-4" aria-hidden /><span className="sr-only">Add the cost</span></button></form>
          <ul className="divide-y divide-zinc-200 dark:divide-white/10">{e.costs.map((c) => <li key={c.id} className="flex items-center gap-2 py-1.5 text-sm"><span className="flex-1 text-zinc-900 dark:text-white">{c.what}</span><span className="font-mono tabular-nums text-zinc-900 dark:text-white">{e.cur}{nf(c.amount, 0)}</span><button type="button" onClick={() => setE({ ...e, costs: e.costs.filter((y) => y.id !== c.id) })} aria-label={`Remove ${c.what}`} className="btn-ghost btn-icon"><Trash2 className="w-4 h-4" aria-hidden /></button></li>)}</ul>
          <Field label="Money sign"><select className="input w-auto!" value={e.cur} onChange={(x) => setE({ ...e, cur: x.target.value })}>{MONEY.map((m) => <option key={m}>{m}</option>)}</select></Field>
        </section>
      </div>
      <Field label="To do (one a line)"><textarea className="input min-h-[90px]" value={e.todo} onChange={(x) => setE({ ...e, todo: x.target.value })} /></Field>
    </div>
  );
}

interface Stop { id: string; day: number; time: string; what: string; cost: number }
/** Trip planner: a day-by-day plan with times and costs, and the total. */
function Trip() {
  const [t, setT] = useKept('uv-trip', () => ({ name: 'School trip', start: today(), days: 2, cur: '₹', stops: [{ id: uid(), day: 1, time: '09:00', what: 'Leave school', cost: 0 }, { id: uid(), day: 1, time: '11:00', what: 'Science museum', cost: 150 }] as Stop[] }));
  const add = (day: number) => setT({ ...t, stops: [...t.stops, { id: uid(), day, time: '12:00', what: '', cost: 0 }] });
  const put = (id: string, p: Partial<Stop>) => setT({ ...t, stops: t.stops.map((s) => (s.id === id ? { ...s, ...p } : s)) });
  const total = t.stops.reduce((a, s) => a + (s.cost || 0), 0);
  const text = Array.from({ length: t.days }, (_, d) => `Day ${d + 1}\n${t.stops.filter((s) => s.day === d + 1).sort((a, b) => a.time.localeCompare(b.time)).map((s) => `  ${s.time}  ${s.what}${s.cost ? ` (${t.cur}${s.cost})` : ''}`).join('\n')}`).join('\n\n');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2"><Field label="Trip"><input className="input" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} /></Field><Field label="First day"><input type="date" className="input" value={t.start} onChange={(e) => setT({ ...t, start: e.target.value })} /></Field><Field label="Days"><input type="number" min={1} max={30} className="input w-20" value={t.days} onChange={(e) => setT({ ...t, days: Math.max(1, Math.min(30, +e.target.value || 1)) })} /></Field><CopyBtn text={`${t.name}\n\n${text}\n\nTotal: ${t.cur}${total}`} label="Copy the plan" /></div>
      {Array.from({ length: t.days }, (_, d) => { const day = d + 1, date = new Date(Date.parse(`${t.start}T12:00:00Z`) + d * 86_400_000); return (
        <section key={day} aria-label={`Day ${day}`} className="rounded-2xl ring-1 ring-zinc-200 dark:ring-white/10 p-3 space-y-2">
          <h3 className="font-bold text-zinc-900 dark:text-white">Day {day} <span className="font-normal text-sm text-zinc-600 dark:text-zinc-300">{Number.isNaN(+date) ? '' : date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })}</span></h3>
          {t.stops.filter((s) => s.day === day).sort((a, b) => a.time.localeCompare(b.time)).map((s) => (
            <div key={s.id} className="grid grid-cols-[100px_1fr_100px_auto] gap-2"><input type="time" className="input py-1.5" aria-label="Time" value={s.time} onChange={(e) => put(s.id, { time: e.target.value })} /><input className="input py-1.5" aria-label="What" value={s.what} onChange={(e) => put(s.id, { what: e.target.value })} /><input className="input py-1.5 font-mono" inputMode="decimal" aria-label="Cost" value={s.cost} onChange={(e) => put(s.id, { cost: Math.max(0, +e.target.value || 0) })} /><button type="button" onClick={() => setT({ ...t, stops: t.stops.filter((x) => x.id !== s.id) })} aria-label={`Remove ${s.what}`} className="btn-ghost btn-icon"><Trash2 className="w-4 h-4" aria-hidden /></button></div>
          ))}
          <Btn onClick={() => add(day)}><Plus className="w-3.5 h-3.5" aria-hidden />Add a stop</Btn>
        </section>
      ); })}
      <p className="text-lg font-bold text-zinc-900 dark:text-white">Total: <span className="font-mono">{t.cur}{nf(total, 0)}</span></p>
    </div>
  );
}

/** Routines: steps with minutes, then run them as a guided timer. */
function Routine() {
  const [r, setR] = useKept('uv-routine', () => ({ name: 'Morning', steps: [{ id: uid(), what: 'Stretch', min: 3 }, { id: uid(), what: 'Shower', min: 8 }, { id: uid(), what: 'Breakfast', min: 15 }, { id: uid(), what: 'Pack my bag', min: 4 }] }));
  const [at, setAt] = useState(-1), [from, setFrom] = useState(0), [now, setNow] = useState(0), [paused, setPaused] = useState<number | null>(null);
  useEffect(() => { if (at < 0 || paused !== null) return; const i = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(i); }, [at, paused]);
  const cur = r.steps[at], left = cur ? cur.min * 60 - ((paused ?? now) - from) / 1000 : 0;
  const next = () => { if (at + 1 >= r.steps.length) { setAt(-1); celebrate(); toast.success(`${r.name} routine done!`); } else { setAt(at + 1); const n = Date.now(); setFrom(n); setNow(n); setPaused(null); } };
  const ended = at >= 0 && left <= 0 && paused === null;
  useEffect(() => { if (ended) { try { navigator.vibrate?.(200); } catch { /* no vibration */ } } }, [ended]);
  const total = r.steps.reduce((a, s) => a + s.min, 0);
  if (at >= 0 && cur) return (
    <div className="space-y-4 text-center">
      <p className="text-sm text-zinc-600 dark:text-zinc-300 tabular-nums">Step {at + 1} of {r.steps.length}</p>
      <p className="text-3xl font-bold text-zinc-900 dark:text-white" translate="no">{cur.what}</p>
      <div className="flex justify-center text-pink-600 dark:text-pink-300"><Ring pct={Math.max(0, Math.min(100, 100 - (left / (cur.min * 60)) * 100))} label={left > 0 ? `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}` : 'time'} size={160} /></div>
      {r.steps[at + 1] && <p className="text-zinc-600 dark:text-zinc-300">Next: <span translate="no">{r.steps[at + 1].what}</span></p>}
      <div className="flex justify-center gap-2">
        <button type="button" onClick={() => { if (paused !== null) { setFrom(from + Date.now() - paused); setPaused(null); } else setPaused(Date.now()); }} className="btn-secondary">{paused !== null ? <Play className="w-4 h-4" aria-hidden /> : <Pause className="w-4 h-4" aria-hidden />}{paused !== null ? 'Go on' : 'Pause'}</button>
        <button type="button" onClick={next} className="btn-primary"><SkipForward className="w-4 h-4" aria-hidden />{at + 1 < r.steps.length ? 'Done, next' : 'Finish'}</button>
        <button type="button" onClick={() => setAt(-1)} className="btn-secondary">Stop</button>
      </div>
    </div>
  );
  return (
    <div className="space-y-3">
      <Field label="Routine"><input className="input" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></Field>
      <ol className="space-y-2">{r.steps.map((s, i) => (
        <li key={s.id} className="grid grid-cols-[auto_1fr_90px_auto] gap-2 items-center"><span className="w-6 text-sm font-mono text-zinc-600 dark:text-zinc-300">{i + 1}</span><input className="input py-1.5" aria-label={`Step ${i + 1}`} value={s.what} onChange={(e) => setR({ ...r, steps: r.steps.map((x) => (x.id === s.id ? { ...x, what: e.target.value } : x)) })} /><label className="flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-300"><input className="input py-1.5" inputMode="numeric" aria-label={`Minutes for ${s.what}`} value={s.min} onChange={(e) => setR({ ...r, steps: r.steps.map((x) => (x.id === s.id ? { ...x, min: Math.max(1, Math.min(180, +e.target.value || 1)) } : x)) })} />min</label><button type="button" onClick={() => setR({ ...r, steps: r.steps.filter((x) => x.id !== s.id) })} aria-label={`Remove ${s.what}`} className="btn-ghost btn-icon"><Trash2 className="w-4 h-4" aria-hidden /></button></li>
      ))}</ol>
      <div className="flex flex-wrap items-center gap-2"><Btn onClick={() => setR({ ...r, steps: [...r.steps, { id: uid(), what: 'New step', min: 5 }] })}><Plus className="w-3.5 h-3.5" aria-hidden />Add a step</Btn><button type="button" disabled={!r.steps.length} onClick={() => { setAt(0); const n = Date.now(); setFrom(n); setNow(n); setPaused(null); }} className="btn-primary btn-sm"><Play className="w-4 h-4" aria-hidden />Start</button><span className="text-sm text-zinc-600 dark:text-zinc-300 tabular-nums">{total} minutes in all</span></div>
    </div>
  );
}

/** Day planner: half-hour blocks from morning to night; type what each is for. */
function DayPlan() {
  const [d, setD] = useKept<Record<string, Record<string, string>>>('uv-dayplan', {});
  const [day, setDay] = useState(() => today()), [from, setFrom] = useKept('uv-dayplan-from', 7), [to, setTo] = useKept('uv-dayplan-to', 22);
  const slots = Array.from({ length: (to - from) * 2 }, (_, i) => { const m = from * 60 + i * 30; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; });
  const plan = d[day] ?? {}, filled = Object.values(plan).filter((v) => v.trim()).length;
  const [nowMin, setNowMin] = useState(() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); });
  useEffect(() => { const i = setInterval(() => { const n = new Date(); setNowMin(n.getHours() * 60 + n.getMinutes()); }, 60000); return () => clearInterval(i); }, []);
  const isToday = day === today();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2"><Field label="Day"><input type="date" className="input" value={day} onChange={(e) => setDay(e.target.value)} /></Field><Field label="From"><select className="input w-auto!" value={from} onChange={(e) => setFrom(+e.target.value)}>{Array.from({ length: 12 }, (_, h) => <option key={h} value={h + 4}>{h + 4}:00</option>)}</select></Field><Field label="To"><select className="input w-auto!" value={to} onChange={(e) => setTo(Math.max(from + 1, +e.target.value))}>{Array.from({ length: 10 }, (_, h) => <option key={h} value={h + 15}>{h + 15}:00</option>)}</select></Field><span className="pb-2 text-sm text-zinc-600 dark:text-zinc-300 tabular-nums">{filled} of {slots.length} half-hours planned</span></div>
      <ol className="rounded-2xl ring-1 ring-zinc-200 dark:ring-white/10 divide-y divide-zinc-200 dark:divide-white/10 overflow-hidden">
        {slots.map((s) => { const m = +s.slice(0, 2) * 60 + +s.slice(3), live = isToday && nowMin >= m && nowMin < m + 30; return (
          <li key={s} className={cn('flex items-center gap-2 px-2', live && 'bg-pink-500/10')}><span className={cn('w-14 shrink-0 font-mono text-xs tabular-nums', s.endsWith(':00') ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400')}>{s}</span><input className="flex-1 bg-transparent py-2 text-sm text-zinc-900 dark:text-white outline-none" aria-label={`Plan for ${s}`} value={plan[s] ?? ''} onChange={(e) => setD({ ...d, [day]: { ...plan, [s]: e.target.value } })} placeholder={live ? 'Now' : ''} /></li>
        ); })}
      </ol>
    </div>
  );
}

const ROLES = ['', 'R', 'A', 'C', 'I'] as const;
const ROLE_TXT: Record<string, string> = { R: 'Does it', A: 'Answers for it (one only)', C: 'Asked before', I: 'Told after' };
/** RACI chart: who does, owns, is asked and is told, for each task. */
function Raci() {
  const [r, setR] = useKept('uv-raci', () => ({ people: ['Asha', 'Ben', 'Teacher'], tasks: ['Research', 'Slides', 'Present'], cells: {} as Record<string, string> }));
  const cycle = (k: string) => { const i = ROLES.indexOf((r.cells[k] ?? '') as (typeof ROLES)[number]); setR({ ...r, cells: { ...r.cells, [k]: ROLES[(i + 1) % ROLES.length] } }); };
  const issues = r.tasks.map((t, ti) => { const roles = r.people.map((_, pi) => r.cells[`${ti}-${pi}`] ?? ''); const a = roles.filter((x) => x === 'A').length; return !roles.includes('R') ? `“${t}” has no one doing it.` : a !== 1 ? `“${t}” needs exactly one A.` : ''; }).filter(Boolean);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2"><Btn onClick={() => { const n = window.prompt('Person'); if (n?.trim()) setR({ ...r, people: [...r.people, n.trim()] }); }}><Plus className="w-3.5 h-3.5" aria-hidden />Person</Btn><Btn onClick={() => { const n = window.prompt('Task'); if (n?.trim()) setR({ ...r, tasks: [...r.tasks, n.trim()] }); }}><Plus className="w-3.5 h-3.5" aria-hidden />Task</Btn></div>
      <div tabIndex={0} role="region" aria-label="RACI chart" className="relative overflow-x-auto focus-visible:outline-2 focus-visible:outline-pink-500">
        <table className="text-sm min-w-[420px]">
          <thead><tr><th className="p-2 text-start text-xs text-zinc-600 dark:text-zinc-300">Task</th>{r.people.map((p, pi) => <th key={pi} className="p-1"><input className="input py-1 text-center font-bold w-24" aria-label={`Person ${pi + 1}`} value={p} onChange={(e) => setR({ ...r, people: r.people.map((x, k) => (k === pi ? e.target.value : x)) })} /></th>)}</tr></thead>
          <tbody>{r.tasks.map((t, ti) => (
            <tr key={ti}><td className="p-1"><input className="input py-1 font-semibold" aria-label={`Task ${ti + 1}`} value={t} onChange={(e) => setR({ ...r, tasks: r.tasks.map((x, k) => (k === ti ? e.target.value : x)) })} /></td>
              {r.people.map((p, pi) => { const v = r.cells[`${ti}-${pi}`] ?? ''; return <td key={pi} className="p-1 text-center"><button type="button" onClick={() => cycle(`${ti}-${pi}`)} aria-label={`${t}, ${p}: ${v ? ROLE_TXT[v] : 'nothing'}`} className={cn('w-10 h-10 rounded-xl font-bold transition-[background-color,transform] active:scale-90', v === 'R' ? 'bg-pink-500 text-[#171f44]' : v === 'A' ? 'bg-indigo-600 text-white dark:bg-aqua-300 dark:text-[#171f44]' : v === 'C' ? 'bg-amber-300 text-zinc-900' : v === 'I' ? 'bg-zinc-300 text-zinc-900' : 'bg-zinc-100 dark:bg-white/10')}>{v}</button></td>; })}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">Tap a box to cycle: R does it · A answers for it · C asked before · I told after.</p>
      {issues.length > 0 && <div role="status"><ul className="text-sm text-amber-800 dark:text-amber-200 list-disc ps-5">{issues.map((x) => <li key={x}>{x}</li>)}</ul></div>}
    </div>
  );
}

/** Sleep log: bedtime and waking time each night; the hours, the average and a chart. */
function Sleep() {
  const [log, setLog] = useKept<Record<string, { bed: string; up: string }>>('uv-sleep', {});
  const [day, setDay] = useState(() => today()), [bed, setBed] = useState('22:30'), [up, setUp] = useState('06:30'), [goal, setGoal] = useKept('uv-sleep-goal', 8);
  const hrs = (b: string, u: string) => { const m = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3); return ((m(u) - m(b) + 1440) % 1440) / 60; };
  const t0 = useMemo(() => today(), []);
  const days = Array.from({ length: 14 }, (_, i) => new Date(Date.parse(`${t0}T00:00:00Z`) - (13 - i) * 86_400_000).toISOString().slice(0, 10));
  const vals = days.map((d) => (log[d] ? hrs(log[d].bed, log[d].up) : null)), got = vals.filter((v): v is number => v !== null);
  const avg = got.length ? got.reduce((a, b) => a + b, 0) / got.length : 0;
  return (
    <div className="space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); setLog({ ...log, [day]: { bed, up } }); }} className="flex flex-wrap items-end gap-2">
        <Field label="Morning of"><input type="date" className="input" value={day} onChange={(e) => setDay(e.target.value)} /></Field><Field label="Went to bed"><input type="time" className="input" value={bed} onChange={(e) => setBed(e.target.value)} /></Field><Field label="Woke up"><input type="time" className="input" value={up} onChange={(e) => setUp(e.target.value)} /></Field>
        <button type="submit" className="btn-primary btn-sm">Log {nf(hrs(bed, up), 1)} h</button>
      </form>
      <dl className="grid grid-cols-3 gap-2 text-sm"><Stat big k="Average (2 weeks)" v={got.length ? `${nf(avg, 1)} h` : '—'} /><Stat big k="Nights logged" v={got.length} /><div className="rounded-xl bg-zinc-100/70 dark:bg-white/[0.05] px-3 py-2"><dt className="text-[11px] text-zinc-600 dark:text-zinc-300">Goal</dt><dd><select className="bg-transparent font-mono text-xl font-bold text-zinc-900 dark:text-white" aria-label="Goal hours" value={goal} onChange={(e) => setGoal(+e.target.value)}>{[6, 7, 8, 9, 10].map((h) => <option key={h} value={h}>{h} h</option>)}</select></dd></div></dl>
      <div className="flex items-end gap-1 h-40 rounded-2xl ring-1 ring-zinc-200 dark:ring-white/10 p-3 relative" role="img" aria-label={`Sleep over two weeks, average ${nf(avg, 1)} hours`}>
        <span className="absolute inset-x-3 border-t border-dashed border-pink-500" style={{ bottom: `calc(${(goal / 12) * 100}% * 0.8 + 12px)` }} aria-hidden />
        {vals.map((v, i) => <div key={days[i]} className="flex-1 flex flex-col items-center gap-1"><motion.div className={cn('w-full rounded-t-md', v === null ? 'bg-transparent' : v >= goal ? 'bg-emerald-500' : 'bg-amber-400')} initial={{ height: 0 }} animate={{ height: `${v === null ? 0 : Math.min(12, v) / 12 * 100 * 0.8}%` }} transition={spring.smooth} /><span className="text-[11px] font-mono text-zinc-600 dark:text-zinc-300">{+days[i].slice(8)}</span></div>)}
      </div>
    </div>
  );
}

interface Kr { id: string; text: string; now: number; target: number }
/** OKRs: an objective and measurable key results, with progress. */
function Okr() {
  const [list, setList] = useKept('uv-okr', () => [{ id: uid(), obj: 'Make our club known across school', krs: [{ id: uid(), text: 'New members', now: 6, target: 20 }, { id: uid(), text: 'Posters up', now: 4, target: 10 }] as Kr[] }]);
  const put = (id: string, krs: Kr[]) => setList(list.map((o) => (o.id === id ? { ...o, krs } : o)));
  return (
    <div className="space-y-4">
      <Btn onClick={() => setList([...list, { id: uid(), obj: 'New objective', krs: [] }])}><Plus className="w-3.5 h-3.5" aria-hidden />Objective</Btn>
      {list.map((o) => { const pct = o.krs.length ? o.krs.reduce((a, k) => a + Math.min(1, k.target ? k.now / k.target : 0), 0) / o.krs.length * 100 : 0; return (
        <section key={o.id} aria-label={o.obj} className="rounded-2xl ring-1 ring-zinc-200 dark:ring-white/10 p-4 space-y-2">
          <div className="flex items-center gap-3"><div className="text-indigo-700 dark:text-aqua-300"><Ring pct={pct} label="done" size={76} /></div><input className="input font-bold flex-1" aria-label="Objective" value={o.obj} onChange={(e) => setList(list.map((x) => (x.id === o.id ? { ...x, obj: e.target.value } : x)))} /><button type="button" onClick={() => ask(`Delete “${o.obj}”?`, () => setList(list.filter((x) => x.id !== o.id)))} aria-label={`Delete ${o.obj}`} className="btn-ghost btn-icon"><Trash2 className="w-4 h-4" aria-hidden /></button></div>
          {o.krs.map((k) => (
            <div key={k.id} className="grid grid-cols-[1fr_70px_auto_70px_auto] gap-2 items-center">
              <input className="input py-1.5" aria-label="Key result" value={k.text} onChange={(e) => put(o.id, o.krs.map((x) => (x.id === k.id ? { ...x, text: e.target.value } : x)))} />
              <input className="input py-1.5 font-mono" inputMode="decimal" aria-label="Now" value={k.now} onChange={(e) => put(o.id, o.krs.map((x) => (x.id === k.id ? { ...x, now: +e.target.value || 0 } : x)))} />
              <span className="text-sm text-zinc-600 dark:text-zinc-300">of</span>
              <input className="input py-1.5 font-mono" inputMode="decimal" aria-label="Target" value={k.target} onChange={(e) => put(o.id, o.krs.map((x) => (x.id === k.id ? { ...x, target: +e.target.value || 0 } : x)))} />
              <button type="button" onClick={() => put(o.id, o.krs.filter((x) => x.id !== k.id))} aria-label={`Remove ${k.text}`} className="btn-ghost btn-icon"><Trash2 className="w-4 h-4" aria-hidden /></button>
              <div className="col-span-5 h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden"><motion.div className="h-full bg-pink-500" initial={false} animate={{ width: `${Math.min(100, k.target ? (k.now / k.target) * 100 : 0)}%` }} transition={spring.smooth} /></div>
            </div>
          ))}
          <Btn onClick={() => put(o.id, [...o.krs, { id: uid(), text: '', now: 0, target: 10 }])}><Plus className="w-3.5 h-3.5" aria-hidden />Key result</Btn>
        </section>
      ); })}
    </div>
  );
}

/** Birthdays: who's next, how old they'll be, and a reminder to copy. */
function Birthdays() {
  const [list, setList] = useKept<{ id: string; name: string; date: string }[]>('uv-birthdays', []);
  const [name, setName] = useState(''), [date, setDate] = useState('');
  const t0 = useMemo(() => today(), []);
  const next = (d: string) => { const [, m, dd] = d.split('-').map(Number), y = +t0.slice(0, 4); let n = Date.UTC(y, m - 1, dd); if (n < Date.parse(`${t0}T00:00:00Z`)) n = Date.UTC(y + 1, m - 1, dd); return { in: Math.round((n - Date.parse(`${t0}T00:00:00Z`)) / 86_400_000), turns: new Date(n).getUTCFullYear() - +d.slice(0, 4) }; };
  const sorted = list.map((b) => ({ ...b, ...next(b.date) })).sort((a, b) => a.in - b.in);
  return (
    <div className="space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); if (name.trim() && date) { setList([...list, { id: uid(), name: name.trim(), date }]); setName(''); setDate(''); } }} className="flex flex-wrap items-end gap-2"><Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Birthday"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field><button type="submit" className="btn-primary btn-sm"><Plus className="w-4 h-4" aria-hidden />Add</button></form>
      {sorted.length ? <ul className="space-y-2">{sorted.map((b, i) => (
        <motion.li key={b.id} layout transition={spring.smooth} className={cn('flex items-center gap-3 rounded-2xl p-3 ring-1', i === 0 ? 'bg-pink-500/10 ring-pink-500/40' : 'ring-zinc-200 dark:ring-white/10')}>
          <span className="w-14 text-center"><span className="block font-mono text-2xl font-bold text-zinc-900 dark:text-white">{b.in}</span><span className="text-[11px] text-zinc-600 dark:text-zinc-300">{b.in === 1 ? 'day' : 'days'}</span></span>
          <span className="flex-1 min-w-0"><span className="block font-semibold text-zinc-900 dark:text-white" translate="no">{b.name}{b.in === 0 ? ' 🎉' : ''}</span><span className="text-sm text-zinc-600 dark:text-zinc-300">{new Date(`${b.date}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', timeZone: 'UTC' })} · turns {b.turns}</span></span>
          <button type="button" onClick={() => setList(list.filter((x) => x.id !== b.id))} aria-label={`Remove ${b.name}`} className="btn-ghost btn-icon"><Trash2 className="w-4 h-4" aria-hidden /></button>
        </motion.li>
      ))}</ul> : <p className="text-sm text-zinc-600 dark:text-zinc-300">Add birthdays to see who’s next. Kept on this device (or your account, with Save).</p>}
    </div>
  );
}
