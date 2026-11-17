'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Check, ListChecks, Plus, Sparkles, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { useLiveInterval } from '@/lib/realtime-client';
import { useNow } from '@/lib/use-now';
import { addDays, type PlanStop } from '@/lib/travel-plan';
import { cn } from '@/lib/utils';

// M254: the trip's before-you-go checklist (top of the trip page's Packing part): shared to-dos, each with who's doing
// it and by when, ideas from the trip (book the way between cities, a stay in each, passports, insurance, money, the
// offline pack), live for everyone.

interface Todo { id: string; text: string; assignee: string | null; due: string | null; done: boolean; doneBy: string | null }
interface Member { id: string; name: string }
const nice = (t: string) => t.split('/').pop()!.replace(/\s*\([^)]*\)/, '');
const field = 'rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white';

export function TripTodos({ tripId, stops, start, members, me }: { tripId: string; stops: PlanStop[]; start: string | null; members: Member[]; me: string }) {
  const key = `/travel/trips/${tripId}/todos`;
  const refreshInterval = useLiveInterval(30_000, 0);
  const { data, mutate } = useSWR<{ todos: Todo[] }>(key, fetcher, { refreshInterval });
  const now = useNow();
  const today = new Date(now || 0).toISOString().slice(0, 10);
  const [text, setText] = useState(''), [who, setWho] = useState(''), [due, setDue] = useState('');
  const todos = useMemo(() => data?.todos ?? [], [data]);
  const name = (id: string | null) => (!id ? null : id === me ? 'you' : members.find((m) => m.id === id)?.name ?? 'someone');
  const ideas = useMemo(() => {
    const before = start ? addDays(start, -14) : null;
    const list = [
      ...stops.slice(1).map((s, i) => `Book the way from ${nice(stops[i].name)} to ${nice(s.name)}`),
      ...stops.map((s) => `Book a stay in ${nice(s.name)}`),
      'Check passports are valid six months after the trip', 'Get travel insurance', 'Tell the bank you’re travelling',
      'Save the trip for offline (Ready)', 'Turn on the family link (Share)',
    ];
    const have = new Set(todos.map((t) => t.text.toLowerCase()));
    return list.filter((t) => !have.has(t.toLowerCase())).map((t) => ({ text: t, due: before }));
  }, [stops, start, todos]);
  const act = async (call: () => Promise<unknown>, optimistic?: Todo[]) => {
    if (optimistic) await mutate({ todos: optimistic }, { revalidate: false });
    try { await call(); } catch (e) { toast.error(errorMessage(e, 'Couldn’t save that.')); }
    await mutate();
  };
  const add = (items: { text: string; assignee?: string | null; due?: string | null }[]) => act(() => api.post(key, { items }));
  const done = todos.filter((t) => t.done).length;

  return (
    <section className="panel p-5" aria-labelledby="todo-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="todo-h" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><ListChecks className="h-5 w-5 text-indigo-500" aria-hidden />Before you go</h3>
        {todos.length > 0 && <span className="text-sm tabular-nums text-zinc-600 dark:text-zinc-300">{done} of {todos.length} done</span>}
      </div>
      <ul className="mt-3 divide-y divide-zinc-200/70 dark:divide-white/10">
        {todos.map((t) => {
          const late = !t.done && t.due && t.due < today;
          return (
            <li key={t.id} data-key={t.id} className="flex items-center gap-3 py-2">
              <button type="button" role="checkbox" aria-checked={t.done} aria-label={t.text} onClick={() => void act(() => api.patch(`${key}/${t.id}`, { done: !t.done }), todos.map((x) => (x.id === t.id ? { ...x, done: !t.done, doneBy: t.done ? null : me } : x)))}
                className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-[background-color,border-color] duration-150', t.done ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-zinc-300 dark:border-white/25')}>{t.done && <Check className="h-3.5 w-3.5" aria-hidden />}</button>
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm', t.done ? 'text-zinc-500 line-through dark:text-zinc-400' : 'text-zinc-900 dark:text-white')} translate="no">{t.text}</p>
                <p className={cn('text-xs', late ? 'text-red-700 dark:text-red-400' : 'text-zinc-500 dark:text-zinc-400')}>
                  {[t.done ? `done by ${name(t.doneBy)}` : name(t.assignee) ? `${name(t.assignee)}` : 'nobody yet', t.due && !t.done ? `${late ? 'was due' : 'by'} ${new Date(`${t.due}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : null].filter(Boolean).join(' · ')}
                </p>
              </div>
              {!t.done && (
                <label className="text-xs"><span className="sr-only">Who’s doing “{t.text}”</span>
                  <select value={t.assignee ?? ''} onChange={(e) => void act(() => api.patch(`${key}/${t.id}`, { assignee: e.target.value || null }))} className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white">
                    <option value="">Anyone</option>{members.map((m) => <option key={m.id} value={m.id}>{m.id === me ? 'Me' : m.name}</option>)}
                  </select>
                </label>
              )}
              <button type="button" className="btn-ghost btn-sm p-1.5 text-red-600 dark:text-red-400" aria-label={`Remove “${t.text}”`} onClick={() => void act(() => api.delete(`${key}/${t.id}`), todos.filter((x) => x.id !== t.id))}><Trash2 className="h-4 w-4" aria-hidden /></button>
            </li>
          );
        })}
      </ul>
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { void add([{ text, assignee: who || null, due: due || null }]); setText(''); setDue(''); } }}>
        <label className="min-w-0 flex-1 basis-48"><span className="sr-only">Something to do</span><input value={text} onChange={(e) => setText(e.target.value)} maxLength={120} placeholder="Something to do before you go" className={cn(field, 'w-full')} /></label>
        <label><span className="sr-only">Who</span><select value={who} onChange={(e) => setWho(e.target.value)} className={field}><option value="">Anyone</option>{members.map((m) => <option key={m.id} value={m.id}>{m.id === me ? 'Me' : m.name}</option>)}</select></label>
        <label><span className="sr-only">By when</span><input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={cn(field, 'min-w-[9.5rem]')} /></label>
        <button type="submit" className="btn-primary btn-sm inline-flex items-center gap-1.5"><Plus className="h-4 w-4" aria-hidden />Add</button>
      </form>
      {ideas.length > 0 && (
        <div className="mt-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300"><Sparkles className="h-3.5 w-3.5" aria-hidden />Ideas for this trip</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {ideas.slice(0, 8).map((i) => <button key={i.text} type="button" onClick={() => void add([i])} className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700 dark:bg-white/[0.08] dark:text-zinc-200" translate="no">+ {i.text}</button>)}
            {ideas.length > 1 && <button type="button" onClick={() => void add(ideas.slice(0, 20))} className="rounded-full px-3 py-1 text-xs font-semibold text-indigo-700 underline dark:text-indigo-300">Add all</button>}
          </div>
        </div>
      )}
    </section>
  );
}
