'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Loader2, Users } from 'lucide-react';
import { Switch } from '@/components/ui/Switch';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

// When a teacher answers parents (Settings → Notifications, teachers; Stage 5 · B16.2): parents see
// these hours before writing, and outside them their messages arrive without a notification.

interface Hours { open: boolean; days: number[]; start: string; end: string; timeZone: string; text: string }
const DAYS = [{ d: 1, l: 'M' }, { d: 2, l: 'T' }, { d: 3, l: 'W' }, { d: 4, l: 'T' }, { d: 5, l: 'F' }, { d: 6, l: 'S' }, { d: 0, l: 'S' }];
const NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function ParentHoursSetting() {
  const [tz] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const { data, mutate } = useSWR<Hours>('/api/teacher/parent-hours', authedJson);
  const [draft, setDraft] = useState<{ start?: string; end?: string }>({});

  const save = async (change: Partial<Hours>) => {
    if (!data) return;
    const next = { ...data, ...change };
    void mutate(next, { revalidate: false });
    try {
      const r = await authedJson<Hours>('/api/teacher/parent-hours', { method: 'POST', body: JSON.stringify({ open: next.open, days: next.days, start: next.start, end: next.end, tz }) });
      void mutate(r, { revalidate: false });
      toast.success(r.open ? `Parents see: replies ${r.text}` : 'Parents see that you’re not taking messages right now');
    } catch (e) { void mutate(data, { revalidate: false }); toast.error(errorMessage(e, 'Couldn’t save your hours.')); }
  };
  const commit = (k: 'start' | 'end') => { const v = draft[k]; if (data && v && v !== data[k]) void save({ [k]: v }); };
  const toggleDay = (d: number) => { if (!data) return; const days = data.days.includes(d) ? data.days.filter((x) => x !== d) : [...data.days, d]; if (days.length) void save({ days }); };

  return (
    <div className="flex items-start gap-4 p-4 rounded-2xl border border-zinc-200 dark:border-white/10">
      <span className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-300 flex items-center justify-center shrink-0"><Users className="w-5 h-5" /></span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-zinc-900 dark:text-white">Hours for parents</p>
        <p className="text-sm text-zinc-500">When you answer parents’ messages. Parents see these hours; outside them, their messages wait in your Messages without a notification.</p>
        {data?.open && (
          <div className="mt-3 space-y-2.5">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days">
              {DAYS.map(({ d, l }) => (
                <button key={d} type="button" onClick={() => toggleDay(d)} aria-pressed={data.days.includes(d)} aria-label={NAMES[d]}
                  className={cn('w-10 h-10 shrink-0 rounded-full text-xs font-bold transition-colors', data.days.includes(d) ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-white/[0.07] text-zinc-500')}>{l}</button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
              <label className="inline-flex items-center gap-1.5">From <input type="time" value={draft.start ?? data.start} onChange={(e) => setDraft((x) => ({ ...x, start: e.target.value }))} onBlur={() => commit('start')} className="rounded-lg bg-zinc-100 dark:bg-white/[0.07] px-2 py-1" /></label>
              <label className="inline-flex items-center gap-1.5">to <input type="time" value={draft.end ?? data.end} onChange={(e) => setDraft((x) => ({ ...x, end: e.target.value }))} onBlur={() => commit('end')} className="rounded-lg bg-zinc-100 dark:bg-white/[0.07] px-2 py-1" /></label>
            </div>
          </div>
        )}
      </div>
      {!data ? <Loader2 className="w-4 h-4 animate-spin text-zinc-400 mt-1" /> : <Switch checked={data.open} label="Taking parent messages" onChange={(v) => void save({ open: v })} className="mt-1" />}
    </div>
  );
}
