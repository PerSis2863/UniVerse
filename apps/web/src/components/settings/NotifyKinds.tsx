'use client';

import useSWR from 'swr';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { cleanPrefs, type NoteGroupId, type NotifyPrefs, type PushMode } from '@/lib/notify-prefs';
import { Segmented } from '@/components/ui/Segmented';
import { cn } from '@/lib/utils';

// Settings → Notifications (Stage 5 · Q9): for each kind, a push now, in the daily summary, or only
// in the app; courses whose pushes wait for the summary; when the summary comes.

interface Settings { prefs: NotifyPrefs; groups: { id: NoteGroupId; label: string; hint: string }[]; courses: { id: string; code: string; name: string }[]; devices: number; nextDigest: string | null }

const MODES: { value: PushMode; label: string }[] = [{ value: 'push', label: 'Push' }, { value: 'digest', label: 'Summary' }, { value: 'off', label: 'In app' }];

export function NotifyKinds() {
  const { data, mutate } = useSWR<Settings>('/api/notifications/settings', authedJson, { revalidateOnFocus: false });
  if (!data) return <div className="py-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>;
  const prefs = cleanPrefs(data.prefs);

  const save = async (next: NotifyPrefs) => {
    void mutate({ ...data, prefs: next }, { revalidate: false });
    try {
      let tz = '';
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* the server's guess */ }
      const r = await authedJson<{ prefs: NotifyPrefs; nextDigest: string | null }>('/api/notifications/settings', { method: 'PUT', body: JSON.stringify({ prefs: next, tz }) });
      void mutate({ ...data, prefs: r.prefs, nextDigest: r.nextDigest }, { revalidate: false });
    } catch (e) {
      toast.error((e as Error).message || 'Couldn’t save that.');
      void mutate();
    }
  };
  const setMode = (g: NoteGroupId, m: PushMode) => void save({ ...prefs, push: { ...prefs.push, [g]: m } });
  const toggleCourse = (id: string) => void save({ ...prefs, muted: prefs.muted.includes(id) ? prefs.muted.filter((x) => x !== id) : [...prefs.muted, id] });

  return (
    <div className="space-y-5">
      <section aria-labelledby="kinds-title" className="space-y-2">
        <h3 id="kinds-title" className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Pushes to your phone and computer</h3>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">Everything always shows in the app. Choose what also comes as a push, waits for one daily summary, or stays in the app.{data.devices ? '' : ' Turn on notifications on this device above to get pushes.'}</p>
        <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
          {data.groups.map((g) => (
            <li key={g.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-900 dark:text-white">{g.label}</p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">{g.hint}</p>
              </div>
              <Segmented<PushMode> label={g.label} value={prefs.push[g.id]} onChange={(v) => setMode(g.id, v)} segments={MODES} className="sm:w-64 shrink-0" />
            </li>
          ))}
        </ul>
      </section>

      {data.courses.length > 0 && (
        <section aria-labelledby="mute-title" className="space-y-2">
          <h3 id="mute-title" className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Mute a course</h3>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">A muted course’s pushes wait for your daily summary (calls ringing for you still ring).</p>
          <div className="flex flex-wrap gap-2">
            {data.courses.map((c) => {
              const on = prefs.muted.includes(c.id);
              return (
                <button key={c.id} type="button" aria-pressed={on} onClick={() => toggleCourse(c.id)} title={c.name}
                  className={cn('px-3 py-1.5 rounded-full text-sm border transition-colors', on ? 'bg-amber-500/15 border-amber-500/40 text-amber-800 dark:text-amber-200' : 'border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200')}>
                  {on ? 'Muted: ' : ''}{c.code}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="digest-title" className="space-y-2">
        <h3 id="digest-title" className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Daily summary</h3>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
            <input type="checkbox" checked={prefs.digest} onChange={(e) => void save({ ...prefs, digest: e.target.checked })} className="w-4 h-4 accent-indigo-600" />
            One push a day with what came in
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">at
            <select value={prefs.digestHour} disabled={!prefs.digest} onChange={(e) => void save({ ...prefs, digestHour: Number(e.target.value) })} className="input py-1 w-auto text-sm disabled:opacity-50">
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>)}
            </select>
          </label>
        </div>
        <p className="text-xs text-zinc-600 dark:text-zinc-400" aria-live="polite">
          {data.nextDigest ? `Next summary: ${new Date(data.nextDigest).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.` : prefs.digest ? 'It starts once something is set to Summary or a course is muted.' : 'Off: what’s set to Summary stays in the app.'}
        </p>
      </section>
    </div>
  );
}
