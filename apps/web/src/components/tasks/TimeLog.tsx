'use client';

import { useState, useSyncExternalStore } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Pause, Play, Plus, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { hoursText, parseMinutes } from '@/lib/task-calendar';
import { useTick } from '@/lib/use-now';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

// M230: time spent on a card (after OpenProject's time tracking). A start/stop timer (kept on this device, so it keeps
// running when the card is closed or the page reloads), time added by hand ("1:30", "45m"), the list of entries and the
// total against the card's estimate. Entries are saved on the board (src/server/tasks.ts, listTime / addTime).

interface Entry { id: string; minutes: number; note: string | null; at: string; name: string; mine: boolean }
interface Log { canEdit: boolean; total: number; entries: Entry[] }

const key = (id: string) => `uv-task-timer:${id}`;
const subs = new Set<() => void>();
const subscribe = (cb: () => void) => { subs.add(cb); window.addEventListener('storage', cb); return () => { subs.delete(cb); window.removeEventListener('storage', cb); }; };
const read = (id: string) => { try { return Number(localStorage.getItem(key(id))) || 0; } catch { return 0; } };
const write = (id: string, v: number) => { try { if (v) localStorage.setItem(key(id), String(v)); else localStorage.removeItem(key(id)); } catch { /* private window: the timer lasts this visit */ } subs.forEach((f) => f()); };

export function TimeLog({ taskId, estimate }: { taskId: string; estimate: number | null }) {
  const url = `/api/tasks/items/${taskId}/time`;
  const { data, mutate } = useSWR<Log>(url, authedJson);
  const since = useSyncExternalStore(subscribe, () => read(taskId), () => 0);
  const now = useTick(since > 0);
  const [add, setAdd] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false);
  const running = since ? Math.max(0, Math.floor((now - since) / 1000)) : 0;
  const post = async (minutes: number, text: string) => {
    setBusy(true);
    try { await authedJson(url, { method: 'POST', body: JSON.stringify({ minutes, note: text }) }); void mutate(); return true; }
    catch (e) { toast.error((e as Error).message); return false; } finally { setBusy(false); }
  };
  const stop = async () => {
    haptic('tap');
    const min = Math.max(1, Math.round(running / 60));
    if (await post(Math.min(min, 24 * 60), note.trim())) { write(taskId, 0); setNote(''); toast.success(`${hoursText(min)} logged.`); }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const min = parseMinutes(add);
    if (!min) { toast.error('Write the time like 1:30, 45m or 2h.'); return; }
    if (await post(min, note.trim())) { setAdd(''); setNote(''); }
  };
  const total = data?.total ?? 0, goal = estimate ? estimate * 60 : 0;
  const share = goal ? Math.min(1, total / goal) : 0;
  const clock = `${Math.floor(running / 3600)}:${String(Math.floor(running / 60) % 60).padStart(2, '0')}:${String(running % 60).padStart(2, '0')}`;
  return (
    <section className="space-y-2" aria-label="Time spent">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Time spent</p>
        <p className="text-xs text-zinc-600 dark:text-zinc-300 tabular-nums">{hoursText(total)}{goal ? ` of ${hoursText(goal)} planned` : ''}</p>
      </div>
      {goal > 0 && (
        <div className="h-1.5 rounded-full bg-zinc-200/80 dark:bg-white/10 overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(total, goal)} aria-label="Time spent against the estimate">
          <div className={cn('h-full rounded-full origin-left rtl:origin-right transition-transform duration-300', total > goal ? 'bg-rose-500' : 'bg-indigo-600')} style={{ transform: `scaleX(${share})` }} />
        </div>
      )}
      {total > goal && goal > 0 && <p className="text-[11px] text-rose-600 dark:text-rose-400">{hoursText(total - goal)} over the estimate.</p>}
      {data?.canEdit && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy} onClick={() => (since ? void stop() : (haptic('tap'), write(taskId, Date.now())))}
              className={cn('inline-flex items-center gap-1.5 rounded-full px-3 h-9 text-sm font-semibold transition-[background-color,transform] active:scale-95', since ? 'bg-rose-600 text-white' : 'btn-primary')}>
              {since ? <Pause className="w-4 h-4" aria-hidden /> : <Play className="w-4 h-4" aria-hidden />}{since ? 'Stop and log' : 'Start timer'}
            </button>
            {since > 0 && <span className="font-mono text-sm tabular-nums text-zinc-800 dark:text-zinc-100" aria-live="off">{clock}</span>}
            {since > 0 && <button type="button" onClick={() => write(taskId, 0)} className="text-xs text-zinc-600 dark:text-zinc-300 hover:underline">Discard</button>}
          </div>
          <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
            <input value={add} onChange={(e) => setAdd(e.target.value)} maxLength={12} placeholder="1:30" aria-label="Time to add (like 1:30, 45m or 2h)" className="input w-24 text-sm" />
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="What you did (optional)" aria-label="What you did" className="input flex-1 min-w-32 text-sm" />
            <button type="submit" disabled={busy || !add.trim()} className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 dark:text-indigo-400 disabled:opacity-50"><Plus className="w-4 h-4" aria-hidden />Add time</button>
          </form>
        </div>
      )}
      {data?.entries.length ? (
        <ul className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
          {data.entries.slice(0, 30).map((e) => (
            <li key={e.id} className="flex items-center gap-2 py-1.5 text-sm">
              <span className="w-16 shrink-0 tabular-nums font-medium text-zinc-900 dark:text-white">{hoursText(e.minutes)}</span>
              <span className="flex-1 min-w-0 truncate text-zinc-600 dark:text-zinc-300"><span translate="no">{e.name}</span>{e.note ? <> · <span translate="no">{e.note}</span></> : null}</span>
              <time className="text-xs text-zinc-500 shrink-0" dateTime={e.at}>{new Date(e.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</time>
              {data.canEdit && e.mine && <button type="button" onClick={async () => { try { await authedJson(`/api/tasks/time/${e.id}`, { method: 'DELETE' }); void mutate(); } catch (x) { toast.error((x as Error).message); } }} aria-label={`Take back ${hoursText(e.minutes)}`} className="p-1 text-zinc-400 hover:text-rose-500"><X className="w-3.5 h-3.5" /></button>}
            </li>
          ))}
        </ul>
      ) : data && <p className="text-xs text-zinc-500">No time logged yet.</p>}
    </section>
  );
}
