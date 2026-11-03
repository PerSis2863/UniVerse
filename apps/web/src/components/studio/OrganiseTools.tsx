'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { m as motion } from 'framer-motion';
import { ArrowRight, BookOpen, ChevronLeft, ChevronRight, Download, Flag, Minus, Pause, Play, Plus, Printer, RotateCcw, SkipForward, Trash2 } from 'lucide-react';
import { celebrate } from '@/lib/celebrate';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Ring } from '@/components/instruments/parts';
import { Btn, CopyBtn, Field, save } from './QuickTools';
import { printOnly, today, uid, useKept } from './kept';
import { ask, BRANCH, FullBtn, Segments, Stat, useFull } from './bits';

// Collaborate → Create → Plan and organise, and Present (M74): a priority matrix, countdowns, meeting
// notes, checklists, goals, a week planner, SWOT, pros and cons, a reading list, a stopwatch, a room
// poll and an agenda timer. All kept on this device.

export type OrganiseId = 'matrix' | 'countdowns' | 'meeting' | 'checklists' | 'goals' | 'week' | 'swot' | 'proscons' | 'reading' | 'stopwatch' | 'poll' | 'agenda';

export function OrganiseTool({ id }: { id: OrganiseId }) {
  const T = { matrix: Matrix, countdowns: Countdowns, meeting: Meeting, checklists: Checklists, goals: Goals, week: Week, swot: Swot, proscons: ProsCons, reading: Reading, stopwatch: Stopwatch, poll: Poll, agenda: Agenda }[id];
  return <T />;
}

interface Task { id: string; text: string; done?: boolean }
/** A small list with add, tick and remove; items can be dragged out to another list. */
function List({ items, onChange, placeholder, label, dragGroup, onDropItem }: { items: Task[]; onChange: (t: Task[]) => void; placeholder: string; label: string; dragGroup?: string; onDropItem?: (t: Task) => void }) {
  const [t, setT] = useState('');
  const [over, setOver] = useState(false);
  return (
    <div onDragOver={(e) => { if (dragGroup && e.dataTransfer.types.includes(dragGroup)) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { setOver(false); const raw = dragGroup && e.dataTransfer.getData(dragGroup); if (raw && onDropItem) onDropItem(JSON.parse(raw) as Task); }}
      className={cn('space-y-1.5 rounded-xl transition-colors', over && 'bg-pink-500/10 ring-2 ring-pink-500/50')}>
      <ul className="space-y-1" aria-label={label}>
        {items.map((it) => (
          <motion.li key={it.id} layout="position" transition={spring.snappy}>
            <div draggable={!!dragGroup} onDragStart={(e) => { if (dragGroup) { e.dataTransfer.setData(dragGroup, JSON.stringify(it)); e.dataTransfer.effectAllowed = 'move'; } }}
              className={cn('group flex items-center gap-2 rounded-lg px-2 py-1 bg-white/60 dark:bg-white/[0.04]', dragGroup && 'cursor-grab active:cursor-grabbing')}>
            <input type="checkbox" checked={!!it.done} onChange={(e) => onChange(items.map((x) => (x.id === it.id ? { ...x, done: e.target.checked } : x)))} aria-label={`Done: ${it.text}`} className="accent-pink-500 w-4 h-4 shrink-0" />
            <span className={cn('flex-1 min-w-0 text-sm text-zinc-900 dark:text-white break-words', it.done && 'line-through text-zinc-500 dark:text-zinc-400')} translate="no">{it.text}</span>
            <button type="button" onClick={() => onChange(items.filter((x) => x.id !== it.id))} aria-label={`Remove ${it.text}`} className="p-1 text-zinc-500 dark:text-zinc-400 opacity-60 hover:opacity-100 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus:opacity-100"><Trash2 className="w-3.5 h-3.5" aria-hidden /></button>
            </div>
          </motion.li>
        ))}
      </ul>
      <form onSubmit={(e) => { e.preventDefault(); if (t.trim()) { onChange([...items, { id: uid(), text: t.trim() }]); setT(''); } }}>
        <input className="input py-1.5 text-sm" value={t} onChange={(e) => setT(e.target.value)} placeholder={placeholder} aria-label={`Add to ${label}`} />
      </form>
    </div>
  );
}

const QUADS = [
  { k: 'do', t: 'Do now', s: 'Urgent and important', c: 'bg-rose-500/10 ring-rose-500/30' },
  { k: 'plan', t: 'Plan it', s: 'Important, not urgent', c: 'bg-indigo-500/10 ring-indigo-500/30 dark:bg-aqua-300/10 dark:ring-aqua-300/30' },
  { k: 'pass', t: 'Hand it on', s: 'Urgent, not important', c: 'bg-amber-500/10 ring-amber-500/30' },
  { k: 'drop', t: 'Drop it', s: 'Neither', c: 'bg-zinc-500/10 ring-zinc-500/30' },
] as const;
/** Priority matrix (Eisenhower): sort what's on your plate; drag between boxes. */
function Matrix() {
  const [m, setM] = useKept<Record<string, Task[]>>('uv-matrix', () => ({ do: [{ id: uid(), text: 'Finish the lab report' }], plan: [{ id: uid(), text: 'Start revision for finals' }], pass: [{ id: uid(), text: 'Reply to the group chat' }], drop: [] }));
  const moveTo = (k: string, t: Task) => setM(Object.fromEntries(QUADS.map((q) => [q.k, q.k === k ? [...(m[q.k] ?? []).filter((x) => x.id !== t.id), t] : (m[q.k] ?? []).filter((x) => x.id !== t.id)])));
  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2">
        {QUADS.map((q) => (
          <section key={q.k} aria-labelledby={`q-${q.k}`} className={cn('rounded-2xl ring-1 p-3 space-y-2', q.c)}>
            <h3 id={`q-${q.k}`} className="font-bold text-zinc-900 dark:text-white">{q.t} <span className="text-xs font-normal text-zinc-600 dark:text-zinc-300">· {q.s}</span></h3>
            <List label={q.t} items={m[q.k] ?? []} onChange={(t) => setM({ ...m, [q.k]: t })} placeholder="Add a task…" dragGroup="text/x-uv-task" onDropItem={(t) => moveTo(q.k, t)} />
          </section>
        ))}
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">Drag a task to another box. Kept on this device.</p>
    </div>
  );
}

const left = (to: number, now: number) => { const s = Math.round((to - now) / 1000), a = Math.abs(s); return { past: s < 0, d: Math.floor(a / 86400), h: Math.floor((a % 86400) / 3600), m: Math.floor((a % 3600) / 60), s: a % 60 }; };
/** Countdowns to the days that matter: exams, trips, birthdays. */
function Countdowns() {
  const [list, setList] = useKept<{ id: string; name: string; at: string }[]>('uv-countdowns', () => [{ id: uid(), name: 'End of term', at: `${new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10)}T15:00` }]);
  const [name, setName] = useState(''), [at, setAt] = useState(''), [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const sorted = [...list].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return (
    <div className="space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); if (name.trim() && at) { setList([...list, { id: uid(), name: name.trim(), at }]); setName(''); setAt(''); } }} className="flex flex-wrap items-end gap-2">
        <Field label="What"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Maths exam" /></Field>
        <Field label="When"><input type="datetime-local" className="input" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
        <button type="submit" className="btn-primary btn-sm"><Plus className="w-4 h-4" aria-hidden />Add</button>
      </form>
      <ul className="grid gap-3 sm:grid-cols-2">
        {sorted.map((c, i) => { const l = left(Date.parse(c.at), now); return (
          <motion.li key={c.id} layout transition={spring.smooth} className="relative rounded-2xl p-4 text-white" style={{ background: `linear-gradient(135deg, ${BRANCH[i % BRANCH.length]}, #171f44)` }}>
            <p className="font-semibold pe-8" translate="no">{c.name}</p>
            <p className="text-xs opacity-90">{new Date(c.at).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
            {l.past ? <p className="mt-2 text-lg font-bold">{l.d} days ago</p> : (
              <p className="mt-2 flex gap-3 font-mono tabular-nums">{[[l.d, 'days'], [l.h, 'hrs'], [l.m, 'min'], [l.s, 'sec']].map(([v, k]) => <span key={k}><span className="block text-2xl font-bold">{v}</span><span className="text-[11px] font-sans opacity-90">{k}</span></span>)}</p>
            )}
            <button type="button" onClick={() => setList(list.filter((x) => x.id !== c.id))} aria-label={`Remove ${c.name}`} className="absolute top-3 end-3 p-1 opacity-80 hover:opacity-100"><Trash2 className="w-4 h-4" aria-hidden /></button>
          </motion.li>
        ); })}
      </ul>
    </div>
  );
}

interface Action { id: string; what: string; who: string; when: string; done?: boolean }
interface Notes { id: string; title: string; date: string; people: string; agenda: string; notes: string; decisions: string; actions: Action[] }
const blankNotes = (): Notes => ({ id: uid(), title: 'Team meeting', date: today(), people: '', agenda: '', notes: '', decisions: '', actions: [] });
/** Meeting notes: who came, what was said and decided, who does what by when. */
function Meeting() {
  const [all, setAll] = useKept<Notes[]>('uv-meetings', () => [blankNotes()]);
  const [at, setAt] = useState(0);
  const n = all[Math.min(at, all.length - 1)] ?? blankNotes();
  const put = (p: Partial<Notes>) => setAll(all.map((x) => (x.id === n.id ? { ...x, ...p } : x)));
  const md = `# ${n.title}\n${n.date}${n.people ? `\n**People:** ${n.people}` : ''}\n\n## Agenda\n${n.agenda}\n\n## Notes\n${n.notes}\n\n## Decisions\n${n.decisions}\n\n## Actions\n${n.actions.map((a) => `- [${a.done ? 'x' : ' '}] ${a.what}${a.who ? ` (${a.who}` : ''}${a.when ? `${a.who ? ', ' : ' ('}by ${a.when}` : ''}${a.who || a.when ? ')' : ''}`).join('\n')}`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Meeting"><select className="input" value={at} onChange={(e) => setAt(+e.target.value)}>{all.map((x, i) => <option key={x.id} value={i}>{x.date} · {x.title}</option>)}</select></Field>
        <Btn onClick={() => { setAll([blankNotes(), ...all]); setAt(0); }}><Plus className="w-3.5 h-3.5" aria-hidden />New meeting</Btn>
        <CopyBtn text={md} label="Copy as Markdown" />
        <Btn onClick={() => save(`${n.title.replace(/\W+/g, '-').toLowerCase()}-${n.date}.md`, md, 'text/markdown')}><Download className="w-3.5 h-3.5" aria-hidden />Download</Btn>
        {all.length > 1 && <Btn onClick={() => ask(`Delete “${n.title}”?`, () => { setAll(all.filter((x) => x.id !== n.id)); setAt(0); })}><Trash2 className="w-3.5 h-3.5" aria-hidden />Delete</Btn>}
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_160px]"><Field label="Title"><input className="input" value={n.title} onChange={(e) => put({ title: e.target.value })} /></Field><Field label="Date"><input type="date" className="input" value={n.date} onChange={(e) => put({ date: e.target.value })} /></Field></div>
      <Field label="People there"><input className="input" value={n.people} onChange={(e) => put({ people: e.target.value })} placeholder="Names, split by commas" /></Field>
      <div className="grid gap-2 lg:grid-cols-3">
        <Field label="Agenda"><textarea className="input min-h-[120px]" value={n.agenda} onChange={(e) => put({ agenda: e.target.value })} /></Field>
        <Field label="Notes"><textarea className="input min-h-[120px]" value={n.notes} onChange={(e) => put({ notes: e.target.value })} /></Field>
        <Field label="Decisions"><textarea className="input min-h-[120px]" value={n.decisions} onChange={(e) => put({ decisions: e.target.value })} /></Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-bold text-zinc-900 dark:text-white">Actions <span className="font-normal text-zinc-600 dark:text-zinc-300 tabular-nums">· {n.actions.filter((a) => a.done).length}/{n.actions.length} done</span></legend>
        {n.actions.map((a) => (
          <div key={a.id} className="grid grid-cols-[auto_1fr_120px_140px_auto] gap-2 items-center">
            <input type="checkbox" checked={!!a.done} onChange={(e) => put({ actions: n.actions.map((x) => (x.id === a.id ? { ...x, done: e.target.checked } : x)) })} aria-label={`Done: ${a.what}`} className="accent-pink-500 w-4 h-4" />
            <input className="input py-1.5" aria-label="What" value={a.what} onChange={(e) => put({ actions: n.actions.map((x) => (x.id === a.id ? { ...x, what: e.target.value } : x)) })} />
            <input className="input py-1.5" aria-label="Who" placeholder="Who" value={a.who} onChange={(e) => put({ actions: n.actions.map((x) => (x.id === a.id ? { ...x, who: e.target.value } : x)) })} />
            <input type="date" className="input py-1.5" aria-label="By when" value={a.when} onChange={(e) => put({ actions: n.actions.map((x) => (x.id === a.id ? { ...x, when: e.target.value } : x)) })} />
            <button type="button" onClick={() => put({ actions: n.actions.filter((x) => x.id !== a.id) })} aria-label={`Remove ${a.what}`} className="btn-ghost btn-icon"><Trash2 className="w-4 h-4" aria-hidden /></button>
          </div>
        ))}
        <Btn onClick={() => put({ actions: [...n.actions, { id: uid(), what: '', who: '', when: '' }] })}><Plus className="w-3.5 h-3.5" aria-hidden />Add an action</Btn>
      </fieldset>
    </div>
  );
}

const TEMPLATES: Record<string, string[]> = {
  'Exam day': ['ID card', 'Pens (two)', 'Pencil and eraser', 'Calculator', 'Water bottle', 'Watch (no smart watch)', 'Hall ticket', 'Leave 30 minutes early'],
  'Packing for a trip': ['Passport or ID', 'Tickets', 'Phone charger', 'Medicines', 'Toothbrush', 'Clothes for each day', 'Rain jacket', 'Some cash'],
  'Starting a project': ['Write down the goal', 'List who is involved', 'Agree on a deadline', 'Split the work', 'Set a check-in date', 'Choose where files live'],
  'Planning an event': ['Pick a date', 'Book the place', 'Make a guest list', 'Send invitations', 'Food and drinks', 'Decorations', 'Thank-you messages'],
  'Moving house': ['Give notice', 'Change your address', 'Book movers', 'Pack room by room', 'Read the meters', 'Clean the old place', 'Set up internet'],
};
/** Checklists from templates or your own, ticked off. */
function Checklists() {
  const [lists, setLists] = useKept<{ id: string; name: string; items: Task[] }[]>('uv-checklists', () => [{ id: uid(), name: 'Exam day', items: TEMPLATES['Exam day'].map((text) => ({ id: uid(), text })) }]);
  const [at, setAt] = useState(0);
  const l = lists[Math.min(at, lists.length - 1)];
  const done = l ? l.items.filter((i) => i.done).length : 0;
  const put = (items: Task[]) => { if (!l) return; const was = l.items.length > 0 && l.items.every((i) => i.done); setLists(lists.map((x) => (x.id === l.id ? { ...x, items } : x))); if (!was && items.length && items.every((i) => i.done)) celebrate(); };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="List"><select className="input" value={at} onChange={(e) => setAt(+e.target.value)}>{lists.map((x, i) => <option key={x.id} value={i}>{x.name}</option>)}</select></Field>
        <Field label="New from a template"><select className="input" value="" onChange={(e) => { const k = e.target.value; if (!k) return; setLists([...lists, { id: uid(), name: k, items: (TEMPLATES[k] ?? []).map((text) => ({ id: uid(), text })) }]); setAt(lists.length); }}><option value="">Choose…</option><option value="Blank">Blank list</option>{Object.keys(TEMPLATES).map((k) => <option key={k}>{k}</option>)}</select></Field>
        {l && <Btn onClick={() => put(l.items.map((i) => ({ ...i, done: false })))}><RotateCcw className="w-3.5 h-3.5" aria-hidden />Untick all</Btn>}
        {l && lists.length > 1 && <Btn onClick={() => ask(`Delete “${l.name}”?`, () => { setLists(lists.filter((x) => x.id !== l.id)); setAt(0); })}><Trash2 className="w-3.5 h-3.5" aria-hidden />Delete</Btn>}
      </div>
      {l && (
        <>
          <input className="input font-bold" aria-label="List name" value={l.name} onChange={(e) => setLists(lists.map((x) => (x.id === l.id ? { ...x, name: e.target.value } : x)))} />
          <div className="flex items-center gap-3"><span className="flex-1 h-2.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden"><motion.span className="block h-full bg-pink-500 rounded-full" initial={false} animate={{ width: `${l.items.length ? (done / l.items.length) * 100 : 0}%` }} transition={spring.smooth} /></span><span className="text-sm font-mono tabular-nums text-zinc-900 dark:text-white">{done}/{l.items.length}</span></div>
          <List label={l.name} items={l.items} onChange={put} placeholder="Add an item…" />
        </>
      )}
    </div>
  );
}

interface Goal { id: string; title: string; why: string; due: string; steps: Task[] }
/** Goals broken into steps, with progress. */
function Goals() {
  const [goals, setGoals] = useKept<Goal[]>('uv-goals', () => [{ id: uid(), title: 'Read 12 books this year', why: 'To think more widely', due: `${new Date().getFullYear()}-12-31`, steps: [{ id: uid(), text: 'Pick the first three', done: true }, { id: uid(), text: 'Join the library' }, { id: uid(), text: 'Read 20 minutes a day' }] }]);
  const put = (id: string, p: Partial<Goal>) => setGoals(goals.map((g) => (g.id === id ? { ...g, ...p } : g)));
  return (
    <div className="space-y-3">
      <Btn onClick={() => setGoals([{ id: uid(), title: 'New goal', why: '', due: '', steps: [] }, ...goals])}><Plus className="w-3.5 h-3.5" aria-hidden />Add a goal</Btn>
      <ul className="grid gap-3 lg:grid-cols-2">
        {goals.map((g) => { const d = g.steps.filter((s) => s.done).length, pct = g.steps.length ? (d / g.steps.length) * 100 : 0; return (
          <motion.li key={g.id} layout transition={spring.smooth} className="rounded-2xl ring-1 ring-zinc-200 dark:ring-white/10 p-4 space-y-2">
            <div className="flex gap-3">
              <div className="text-indigo-700 dark:text-aqua-300 shrink-0"><Ring pct={pct} label="done" size={84} /></div>
              <div className="flex-1 min-w-0 space-y-1">
                <input aria-label="Goal" className="input py-1.5 font-bold" value={g.title} onChange={(e) => put(g.id, { title: e.target.value })} />
                <input aria-label="Why it matters" className="input py-1.5 text-sm" placeholder="Why it matters" value={g.why} onChange={(e) => put(g.id, { why: e.target.value })} />
                <div className="flex items-center gap-2"><Flag className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-300" aria-hidden /><input aria-label="By when" type="date" className="input py-1 text-sm w-auto!" value={g.due} onChange={(e) => put(g.id, { due: e.target.value })} />
                  <button type="button" onClick={() => ask(`Delete “${g.title}”?`, () => setGoals(goals.filter((x) => x.id !== g.id)))} aria-label={`Delete ${g.title}`} className="btn-ghost btn-icon ms-auto"><Trash2 className="w-4 h-4" aria-hidden /></button></div>
              </div>
            </div>
            <List label={`Steps for ${g.title}`} items={g.steps} onChange={(steps) => { const was = g.steps.length > 0 && g.steps.every((s) => s.done); put(g.id, { steps }); if (!was && steps.length && steps.every((s) => s.done)) celebrate(); }} placeholder="Add a step…" />
          </motion.li>
        ); })}
      </ul>
    </div>
  );
}

const monday = (d: Date) => { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x; };
/** This week's plan: a column a day, tick things off, move between weeks. */
function Week() {
  const [weeks, setWeeks] = useKept<Record<string, Task[]>>('uv-week-planner', {});
  const [start, setStart] = useState(() => monday(new Date()).toISOString().slice(0, 10));
  const t0 = useMemo(() => today(), []);
  const days = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(`${start}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));
  const move = (n: number) => setStart(new Date(Date.parse(`${start}T00:00:00Z`) + n * 7 * 86_400_000).toISOString().slice(0, 10));
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => move(-1)} aria-label="Previous week" className="btn-ghost btn-icon"><ChevronLeft className="w-4 h-4 rtl:rotate-180" aria-hidden /></button>
        <p className="font-bold text-zinc-900 dark:text-white tabular-nums">Week of {new Date(`${start}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', timeZone: 'UTC' })}</p>
        <button type="button" onClick={() => move(1)} aria-label="Next week" className="btn-ghost btn-icon"><ChevronRight className="w-4 h-4 rtl:rotate-180" aria-hidden /></button>
        <Btn onClick={() => setStart(monday(new Date()).toISOString().slice(0, 10))}>This week</Btn>
      </div>
      <div tabIndex={0} role="region" aria-label="Days of the week" className="relative overflow-x-auto pb-2 focus-visible:outline-2 focus-visible:outline-pink-500">
        <div className="grid grid-cols-7 gap-2 min-w-[980px]">
          {days.map((d) => (
            <section key={d} aria-label={d} className={cn('rounded-2xl ring-1 p-2 space-y-2', d === t0 ? 'ring-pink-500 bg-pink-500/5' : 'ring-zinc-200 dark:ring-white/10')}>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">{new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', timeZone: 'UTC' })}</h3>
              <List label={d} items={weeks[d] ?? []} onChange={(t) => setWeeks({ ...weeks, [d]: t })} placeholder="Add…" dragGroup="text/x-uv-day" onDropItem={(t) => setWeeks(Object.fromEntries([...Object.entries(weeks).map(([k, v]) => [k, v.filter((x) => x.id !== t.id)]), [d, [...(weeks[d] ?? []).filter((x) => x.id !== t.id), t]]]))} />
            </section>
          ))}
        </div>
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">Drag a task to another day. Kept on this device.</p>
    </div>
  );
}

const SWOT = [{ k: 's', t: 'Strengths', c: 'bg-emerald-500/10 ring-emerald-500/30' }, { k: 'w', t: 'Weaknesses', c: 'bg-rose-500/10 ring-rose-500/30' }, { k: 'o', t: 'Opportunities', c: 'bg-sky-500/10 ring-sky-500/30' }, { k: 't', t: 'Threats', c: 'bg-amber-500/10 ring-amber-500/30' }] as const;
/** SWOT analysis: strengths, weaknesses, opportunities, threats. */
function Swot() {
  const [s, setS] = useKept<{ title: string } & Record<string, Task[] | string>>('uv-swot', () => ({ title: 'Our school club', s: [], w: [], o: [], t: [] }));
  const md = `# SWOT: ${s.title}\n\n${SWOT.map((q) => `## ${q.t}\n${((s[q.k] as Task[]) ?? []).map((x) => `- ${x.text}`).join('\n')}`).join('\n\n')}`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2"><Field label="About"><input className="input" value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} /></Field><CopyBtn text={md} label="Copy as Markdown" /><Btn onClick={() => printOnly('swot-sheet')}><Printer className="w-3.5 h-3.5" aria-hidden />Print</Btn></div>
      <div id="swot-sheet" className="grid gap-3 sm:grid-cols-2">
        {SWOT.map((q) => <section key={q.k} aria-labelledby={`sw-${q.k}`} className={cn('rounded-2xl ring-1 p-3 space-y-2', q.c)}><h3 id={`sw-${q.k}`} className="font-bold text-zinc-900 dark:text-white">{q.t}</h3><List label={q.t} items={(s[q.k] as Task[]) ?? []} onChange={(t) => setS({ ...s, [q.k]: t })} placeholder="Add a point…" /></section>)}
      </div>
    </div>
  );
}

interface Weighed { id: string; text: string; w: number }
/** Pros and cons, weighed. */
function ProsCons() {
  const [d, setD] = useKept<{ q: string; pros: Weighed[]; cons: Weighed[] }>('uv-proscons', () => ({ q: 'Should I join the robotics club?', pros: [{ id: uid(), text: 'Learn to code', w: 3 }], cons: [{ id: uid(), text: 'Less free time', w: 2 }] }));
  const sum = (l: Weighed[]) => l.reduce((a, x) => a + x.w, 0), p = sum(d.pros), c = sum(d.cons), share = p + c ? (p / (p + c)) * 100 : 50;
  const col = (k: 'pros' | 'cons', title: string) => {
    const l = d[k];
    return (
      <section aria-labelledby={`pc-${k}`} className={cn('rounded-2xl ring-1 p-3 space-y-2', k === 'pros' ? 'bg-emerald-500/10 ring-emerald-500/30' : 'bg-rose-500/10 ring-rose-500/30')}>
        <h3 id={`pc-${k}`} className="font-bold text-zinc-900 dark:text-white">{title} <span className="font-mono text-sm tabular-nums">{sum(l)}</span></h3>
        {l.map((x) => (
          <div key={x.id} className="flex items-center gap-2">
            <input className="input py-1.5 flex-1" aria-label={title} value={x.text} onChange={(e) => setD({ ...d, [k]: l.map((y) => (y.id === x.id ? { ...y, text: e.target.value } : y)) })} />
            <select className="input py-1.5 w-auto!" aria-label="How much it matters" value={x.w} onChange={(e) => setD({ ...d, [k]: l.map((y) => (y.id === x.id ? { ...y, w: +e.target.value } : y)) })}><option value={1}>A little</option><option value={2}>Some</option><option value={3}>A lot</option></select>
            <button type="button" onClick={() => setD({ ...d, [k]: l.filter((y) => y.id !== x.id) })} aria-label={`Remove ${x.text}`} className="btn-ghost btn-icon"><Trash2 className="w-4 h-4" aria-hidden /></button>
          </div>
        ))}
        <Btn onClick={() => setD({ ...d, [k]: [...l, { id: uid(), text: '', w: 2 }] })}><Plus className="w-3.5 h-3.5" aria-hidden />Add</Btn>
      </section>
    );
  };
  return (
    <div className="space-y-3">
      <Field label="The question"><input className="input font-bold" value={d.q} onChange={(e) => setD({ ...d, q: e.target.value })} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">{col('pros', 'For')}{col('cons', 'Against')}</div>
      <div className="space-y-1">
        <div className="h-4 rounded-full bg-rose-400/70 overflow-hidden"><motion.div className="h-full bg-emerald-500" initial={false} animate={{ width: `${share}%` }} transition={spring.smooth} /></div>
        <p className="text-sm font-semibold text-zinc-900 dark:text-white" role="status">{p === c ? 'Evenly balanced: trust your gut, or add more points.' : p > c ? `Leaning towards yes (${Math.round(share)}% for).` : `Leaning towards no (${Math.round(100 - share)}% against).`}</p>
      </div>
    </div>
  );
}

interface Book { id: string; title: string; author: string; pages: number; read: number; status: 'want' | 'reading' | 'done'; stars: number }
/** Reading list: what you want to read, are reading and have read. */
function Reading() {
  const [books, setBooks] = useKept<Book[]>('uv-reading', () => [{ id: uid(), title: 'Wings of Fire', author: 'A. P. J. Abdul Kalam', pages: 180, read: 60, status: 'reading', stars: 0 }]);
  const [f, setF] = useState<'all' | Book['status']>('all');
  const [title, setTitle] = useState(''), [author, setAuthor] = useState(''), [pages, setPages] = useState('');
  const put = (id: string, p: Partial<Book>) => setBooks(books.map((b) => (b.id === id ? { ...b, ...p, ...(p.read !== undefined && p.read >= b.pages ? { status: 'done' as const } : {}) } : b)));
  const shown = books.filter((b) => f === 'all' || b.status === f);
  return (
    <div className="space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); if (!title.trim()) return; setBooks([{ id: uid(), title: title.trim(), author: author.trim(), pages: Math.max(1, +pages || 200), read: 0, status: 'want', stars: 0 }, ...books]); setTitle(''); setAuthor(''); setPages(''); }} className="grid gap-2 sm:grid-cols-[1fr_1fr_90px_auto] items-end">
        <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Author"><input className="input" value={author} onChange={(e) => setAuthor(e.target.value)} /></Field>
        <Field label="Pages"><input className="input" inputMode="numeric" value={pages} onChange={(e) => setPages(e.target.value)} /></Field>
        <button type="submit" className="btn-primary btn-sm"><Plus className="w-4 h-4" aria-hidden />Add</button>
      </form>
      <dl className="grid grid-cols-3 gap-2 text-sm"><Stat k="Books read" v={books.filter((b) => b.status === 'done').length} /><Stat k="Reading now" v={books.filter((b) => b.status === 'reading').length} /><Stat k="Pages read" v={books.reduce((a, b) => a + Math.min(b.read, b.pages), 0).toLocaleString()} /></dl>
      <Segments label="Show" value={f} onChange={setF} options={[['all', 'All'], ['want', 'Want to read'], ['reading', 'Reading'], ['done', 'Read']] as const} />
      <ul className="space-y-2">
        {shown.map((b) => (
          <motion.li key={b.id} layout transition={spring.smooth} className="rounded-2xl ring-1 ring-zinc-200 dark:ring-white/10 p-3 flex gap-3 items-start">
            <BookOpen className="w-5 h-5 mt-0.5 shrink-0 text-indigo-600 dark:text-aqua-300" aria-hidden />
            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="font-bold text-zinc-900 dark:text-white" translate="no">{b.title} <span className="font-normal text-sm text-zinc-600 dark:text-zinc-300">{b.author}</span></p>
              <div className="flex items-center gap-2"><span className="flex-1 h-2 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden"><motion.span className="block h-full bg-pink-500" initial={false} animate={{ width: `${Math.min(100, (b.read / b.pages) * 100)}%` }} transition={spring.smooth} /></span>
                <label className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300">Page<input className="input py-0.5 px-1.5 w-16! text-xs" inputMode="numeric" aria-label={`Page reached in ${b.title}`} value={b.read} onChange={(e) => put(b.id, { read: Math.max(0, Math.min(b.pages, +e.target.value || 0)), status: b.status === 'want' ? 'reading' : b.status })} />/ {b.pages}</label></div>
              <div className="flex flex-wrap items-center gap-2">
                <select className="input py-1 text-sm w-auto!" aria-label="Status" value={b.status} onChange={(e) => put(b.id, { status: e.target.value as Book['status'] })}><option value="want">Want to read</option><option value="reading">Reading</option><option value="done">Read</option></select>
                {b.status === 'done' && <span role="group" aria-label="Rating" className="flex">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" onClick={() => put(b.id, { stars: n })} aria-label={`${n} stars`} aria-pressed={b.stars === n} className={cn('px-0.5 text-lg', n <= b.stars ? 'text-amber-500' : 'text-zinc-300 dark:text-zinc-600')}>★</button>)}</span>}
                <button type="button" onClick={() => setBooks(books.filter((x) => x.id !== b.id))} aria-label={`Remove ${b.title}`} className="btn-ghost btn-icon ms-auto"><Trash2 className="w-4 h-4" aria-hidden /></button>
              </div>
            </div>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

const clock = (ms: number) => { const t = Math.max(0, Math.floor(ms / 10)); const cs = t % 100, s = Math.floor(t / 100) % 60, m = Math.floor(t / 6000) % 60, h = Math.floor(t / 360000); return `${h ? `${h}:` : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`; };
/** Stopwatch with laps: big digits that move smoothly (drawn straight to the page, no re-render). */
function Stopwatch() {
  const [run, setRun] = useState(false), [laps, setLaps] = useState<number[]>([]), [started, setStarted] = useState(false);
  const base = useRef(0), from = useRef(0), out = useRef<HTMLSpanElement>(null);
  const { ref: fullRef, full: isFull, toggle: toggleFull, boxClass } = useFull<HTMLDivElement>();
  const elapsed = () => base.current + (run ? performance.now() - from.current : 0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const tick = () => { if (out.current) out.current.textContent = clock(base.current + performance.now() - from.current); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run]);
  const toggle = () => { if (run) { base.current += performance.now() - from.current; setRun(false); if (out.current) out.current.textContent = clock(base.current); } else { from.current = performance.now(); setRun(true); setStarted(true); } };
  const lap = () => setLaps([...laps, elapsed()]);
  const reset = () => { base.current = 0; setRun(false); setStarted(false); setLaps([]); if (out.current) out.current.textContent = clock(0); };
  const splits = laps.map((t, i) => t - (laps[i - 1] ?? 0)), best = Math.min(...splits), worst = Math.max(...splits);
  return (
    <div ref={fullRef} tabIndex={-1} onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === ' ') { e.preventDefault(); toggle(); } else if (e.key.toLowerCase() === 'l' && run) lap(); }} className={cn('space-y-4 text-center outline-none', boxClass)}>
      <p className="font-mono tabular-nums font-bold text-zinc-900 dark:text-white" style={{ fontSize: isFull ? 'min(18vw, 200px)' : 'clamp(48px, 12vw, 104px)' }} aria-live="off"><span ref={out}>{clock(0)}</span></p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={toggle} className="btn-primary">{run ? <Pause className="w-4 h-4" aria-hidden /> : <Play className="w-4 h-4" aria-hidden />}{run ? 'Stop' : started ? 'Go on' : 'Start'}</button>
        <button type="button" onClick={lap} disabled={!run} className="btn-secondary"><Flag className="w-4 h-4" aria-hidden />Lap</button>
        <button type="button" onClick={reset} className="btn-secondary"><RotateCcw className="w-4 h-4" aria-hidden />Reset</button>
        <FullBtn full={isFull} onClick={() => void toggleFull()} />
      </div>
      {laps.length > 0 && (
        <ol className="mx-auto max-w-sm divide-y divide-zinc-200 dark:divide-white/10 text-sm" aria-label="Laps">
          {[...laps].map((t, i) => ({ t, i, s: splits[i] })).reverse().map(({ t, i, s }) => (
            <li key={i} className="flex justify-between py-1.5 font-mono tabular-nums text-zinc-900 dark:text-white"><span className="font-sans">Lap {i + 1}</span><span className={cn(laps.length > 2 && s === best && 'text-emerald-700 dark:text-emerald-300', laps.length > 2 && s === worst && 'text-rose-700 dark:text-rose-300')}>{clock(s)}</span><span className="text-zinc-600 dark:text-zinc-300">{clock(t)}</span></li>
          ))}
        </ol>
      )}
      <p className="text-xs text-zinc-600 dark:text-zinc-300">Click here, then Space starts and stops, L marks a lap.</p>
    </div>
  );
}

/** A poll for the room: count hands or taps, see the bars move, show it full screen. */
function Poll() {
  const [p, setP] = useKept('uv-room-poll', () => ({ q: 'Which topic next?', options: [{ id: uid(), text: 'Volcanoes', n: 0 }, { id: uid(), text: 'Oceans', n: 0 }, { id: uid(), text: 'Space', n: 0 }] }));
  const { ref: fullRef, full: isFull, toggle: toggleFull, boxClass } = useFull<HTMLDivElement>();
  const total = p.options.reduce((a, o) => a + o.n, 0), top = Math.max(1, ...p.options.map((o) => o.n));
  const bump = (id: string, d: number) => setP({ ...p, options: p.options.map((o) => (o.id === id ? { ...o, n: Math.max(0, o.n + d) } : o)) });
  return (
    <div ref={fullRef} className={cn('space-y-3', boxClass)}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[200px]"><Field label="Question"><input className={cn('input font-bold', isFull && 'text-2xl')} value={p.q} onChange={(e) => setP({ ...p, q: e.target.value })} /></Field></div>
        <Btn onClick={() => setP({ ...p, options: [...p.options, { id: uid(), text: `Option ${p.options.length + 1}`, n: 0 }] })}><Plus className="w-3.5 h-3.5" aria-hidden />Option</Btn>
        <Btn onClick={() => setP({ ...p, options: p.options.map((o) => ({ ...o, n: 0 })) })}><RotateCcw className="w-3.5 h-3.5" aria-hidden />Reset</Btn>
        <FullBtn full={isFull} onClick={() => void toggleFull()} />
      </div>
      <ul className="space-y-2">
        {p.options.map((o, i) => (
          <li key={o.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-center">
            <div className="relative rounded-xl overflow-hidden ring-1 ring-zinc-200 dark:ring-white/10">
              <motion.div className="absolute inset-y-0 start-0" style={{ background: `${BRANCH[i % BRANCH.length]}33` }} initial={false} animate={{ width: `${(o.n / top) * 100}%` }} transition={spring.smooth} aria-hidden />
              <div className="relative flex items-center gap-2 px-3 py-2">
                <input className={cn('flex-1 min-w-0 bg-transparent font-semibold text-zinc-900 dark:text-white outline-none', isFull && 'text-2xl')} aria-label={`Option ${i + 1}`} value={o.text} onChange={(e) => setP({ ...p, options: p.options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)) })} />
                <span className={cn('font-mono tabular-nums font-bold text-zinc-900 dark:text-white', isFull && 'text-3xl')}>{o.n}</span>
                <span className="w-12 text-end text-sm font-mono tabular-nums text-zinc-600 dark:text-zinc-300">{total ? Math.round((o.n / total) * 100) : 0}%</span>
              </div>
            </div>
            <div className="flex gap-1">
              <button type="button" onClick={() => bump(o.id, -1)} aria-label={`One fewer for ${o.text}`} className="btn-secondary btn-icon"><Minus className="w-4 h-4" aria-hidden /></button>
              <button type="button" onClick={() => bump(o.id, 1)} aria-label={`One more for ${o.text}`} className="btn-primary btn-icon active:scale-90 transition-transform"><Plus className="w-4 h-4" aria-hidden /></button>
              {p.options.length > 2 && <button type="button" onClick={() => setP({ ...p, options: p.options.filter((x) => x.id !== o.id) })} aria-label={`Remove ${o.text}`} className="btn-ghost btn-icon"><Trash2 className="w-4 h-4" aria-hidden /></button>}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-sm text-zinc-600 dark:text-zinc-300 tabular-nums" role="status">{total} votes</p>
    </div>
  );
}

/** Agenda timer: each part of a talk or lesson gets its minutes; see what's now and what's next. */
function Agenda() {
  const [items, setItems] = useKept('uv-agenda', () => [{ id: uid(), title: 'Welcome', min: 5 }, { id: uid(), title: 'Main activity', min: 25 }, { id: uid(), title: 'Questions', min: 10 }]);
  const [at, setAt] = useState(-1), [startedAt, setStartedAt] = useState(0), [now, setNow] = useState(() => Date.now()), [paused, setPaused] = useState<number | null>(null);
  const { ref: fullRef, full: isFull, toggle: toggleFull, boxClass } = useFull<HTMLDivElement>();
  useEffect(() => { if (at < 0 || paused !== null) return; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, [at, paused]);
  const cur = items[at], spent = at >= 0 ? ((paused ?? now) - startedAt) / 1000 : 0, len = (cur?.min ?? 0) * 60, leftS = len - spent, over = leftS < 0;
  const next = () => { if (at + 1 >= items.length) { setAt(-1); toast.success('Agenda finished'); return; } setAt(at + 1); setStartedAt(Date.now()); setNow(Date.now()); setPaused(null); };
  const totalMin = items.reduce((a, i) => a + i.min, 0);
  const fmt = (s: number) => `${s < 0 ? '+' : ''}${Math.floor(Math.abs(s) / 60)}:${String(Math.floor(Math.abs(s) % 60)).padStart(2, '0')}`;
  return (
    <div className="space-y-4">
      {at < 0 ? (
        <>
          <ul className="space-y-2">
            {items.map((it, i) => (
              <li key={it.id} className="grid grid-cols-[1fr_90px_auto] gap-2 items-center">
                <input className="input" aria-label={`Part ${i + 1}`} value={it.title} onChange={(e) => setItems(items.map((x) => (x.id === it.id ? { ...x, title: e.target.value } : x)))} />
                <label className="flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-300"><input className="input py-2" inputMode="numeric" aria-label={`Minutes for ${it.title}`} value={it.min} onChange={(e) => setItems(items.map((x) => (x.id === it.id ? { ...x, min: Math.max(1, Math.min(240, +e.target.value || 1)) } : x)))} />min</label>
                <button type="button" onClick={() => setItems(items.filter((x) => x.id !== it.id))} aria-label={`Remove ${it.title}`} className="btn-ghost btn-icon"><Trash2 className="w-4 h-4" aria-hidden /></button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 items-center">
            <Btn onClick={() => setItems([...items, { id: uid(), title: 'New part', min: 5 }])}><Plus className="w-3.5 h-3.5" aria-hidden />Add a part</Btn>
            <button type="button" disabled={!items.length} onClick={() => { setAt(0); setStartedAt(Date.now()); setNow(Date.now()); setPaused(null); }} className="btn-primary btn-sm"><Play className="w-4 h-4" aria-hidden />Start</button>
            <span className="text-sm text-zinc-600 dark:text-zinc-300 tabular-nums">{totalMin} minutes in all · ends about {new Date(now + totalMin * 60000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </>
      ) : (
        <div ref={fullRef} className={cn('space-y-4 text-center', boxClass)}>
          <p className="text-sm text-zinc-600 dark:text-zinc-300 tabular-nums">Part {at + 1} of {items.length}</p>
          <p className={cn('font-bold text-zinc-900 dark:text-white', isFull ? 'text-5xl' : 'text-3xl')} translate="no">{cur?.title}</p>
          <p className={cn('font-mono tabular-nums font-bold', over ? 'text-rose-600 dark:text-rose-300' : 'text-zinc-900 dark:text-white')} style={{ fontSize: isFull ? 'min(20vw, 220px)' : 'clamp(56px, 14vw, 120px)' }} role="timer">{fmt(leftS)}</p>
          <div className="mx-auto max-w-xl h-3 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden"><div className={cn('h-full rounded-full transition-[width] duration-300 ease-linear', over ? 'bg-rose-500' : 'bg-pink-500')} style={{ width: `${Math.min(100, (spent / len) * 100)}%` }} /></div>
          {items[at + 1] && <p className="text-zinc-600 dark:text-zinc-300 inline-flex items-center gap-1">Next <ArrowRight className="w-4 h-4 rtl:rotate-180" aria-hidden /> <span translate="no">{items[at + 1].title}</span> ({items[at + 1].min} min)</p>}
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => { if (paused !== null) { setStartedAt(startedAt + Date.now() - paused); setPaused(null); } else setPaused(Date.now()); }} className="btn-secondary">{paused !== null ? <Play className="w-4 h-4" aria-hidden /> : <Pause className="w-4 h-4" aria-hidden />}{paused !== null ? 'Go on' : 'Pause'}</button>
            <button type="button" onClick={next} className="btn-primary"><SkipForward className="w-4 h-4" aria-hidden />{at + 1 < items.length ? 'Next part' : 'Finish'}</button>
            <button type="button" onClick={() => setAt(-1)} className="btn-secondary">Stop</button>
            <FullBtn full={isFull} onClick={() => void toggleFull()} />
          </div>
        </div>
      )}
    </div>
  );
}
