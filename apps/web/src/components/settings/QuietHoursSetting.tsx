'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Loader2, Moon } from 'lucide-react';
import { Switch } from '@/components/ui/Switch';
import { authedJson } from '@/lib/authed-fetch';

// Quiet hours (Settings → Notifications; Stage 4 · 4.10, src/server/safety.ts): no push
// notifications during them. For students under 18 the school sets them, and they can't be changed.

interface Quiet { on: boolean; start: string; end: string; locked: boolean }

export function QuietHoursSetting() {
  const [tz] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const { data, mutate } = useSWR<Quiet>(`/api/me/quiet?tz=${encodeURIComponent(tz)}`, authedJson);
  const [draft, setDraft] = useState<{ start?: string; end?: string }>({});

  const save = async (change: Partial<Quiet>) => {
    if (!data || data.locked) return;
    const next = { ...data, ...change };
    void mutate(next, { revalidate: false });
    try {
      const r = await authedJson<Quiet>('/api/me/quiet', { method: 'POST', body: JSON.stringify({ on: next.on, start: next.start, end: next.end, tz }) });
      void mutate(r, { revalidate: false });
      toast.success(r.on ? `Quiet from ${r.start} to ${r.end}` : 'Quiet hours off');
    } catch (e) { void mutate(data, { revalidate: false }); toast.error((e as Error).message); }
  };
  const commit = (k: 'start' | 'end') => { const v = draft[k]; if (data && v && v !== data[k]) void save({ [k]: v }); };

  return (
    <div className="flex items-start gap-4 p-4 rounded-2xl border border-zinc-200 dark:border-white/10">
      <span className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0"><Moon className="w-5 h-5" /></span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-zinc-900 dark:text-white">Quiet hours</p>
        <p className="text-sm text-zinc-500">
          {data?.locked ? 'Set by your school. ' : ''}No notifications to your phone or computer during these hours. Messages and calls still arrive: you’ll see them when you look.
        </p>
        {data?.on && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
            <label className="inline-flex items-center gap-1.5">From <input type="time" value={draft.start ?? data.start} disabled={data.locked} onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))} onBlur={() => commit('start')} className="rounded-lg bg-zinc-100 dark:bg-white/[0.07] px-2 py-1 disabled:opacity-60" /></label>
            <label className="inline-flex items-center gap-1.5">to <input type="time" value={draft.end ?? data.end} disabled={data.locked} onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))} onBlur={() => commit('end')} className="rounded-lg bg-zinc-100 dark:bg-white/[0.07] px-2 py-1 disabled:opacity-60" /></label>
          </div>
        )}
      </div>
      {!data ? <Loader2 className="w-4 h-4 animate-spin text-zinc-400 mt-1" /> : <Switch checked={data.on} disabled={data.locked} label="Quiet hours" onChange={(v) => void save({ on: v })} className="mt-1" />}
    </div>
  );
}
