'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Loader2, LocateFixed, MapPin } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';

// Admin → Attendance (Stage 5 · Q11): class check-ins only from near the campus. A phone's position
// goes with its check-in, is compared with the campus here, and is never kept.

interface Policy { on: boolean; lat: number | null; lng: number | null; radius: number }

export function CheckinPolicy() {
  const { data, mutate } = useSWR<Policy>('/api/attendance/policy', authedJson);
  const [draft, setDraft] = useState<{ lat: string; lng: string; radius: number } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data) return <div className="h-24 rounded-2xl skeleton" />;
  const form = draft ?? { lat: data.lat?.toString() ?? '', lng: data.lng?.toString() ?? '', radius: data.radius };

  const save = async (on: boolean) => {
    setBusy(true);
    try {
      const p = await authedJson<Policy>('/api/attendance/policy', { method: 'PUT', body: JSON.stringify({ on, lat: Number(form.lat), lng: Number(form.lng), radius: form.radius }) });
      await mutate(p, { revalidate: false });
      setDraft(null);
      toast.success(on ? 'Check-ins now need to be on campus' : 'Location check off');
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  const useHere = () => {
    if (!navigator.geolocation) return void toast.error('This browser can’t tell where it is.');
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setDraft({ ...form, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) }); setBusy(false); },
      () => { toast.error('Allow your location to use where you are now.'); setBusy(false); },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <section aria-labelledby="geo-title" className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/50 p-4 sm:p-5 rounded-2xl space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="geo-title" className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2 flex-1"><MapPin className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />Check-ins only on campus</h2>
        <span className={data.on ? 'text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-200' : 'text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-500/15 text-zinc-700 dark:text-zinc-300'}>{data.on ? 'On' : 'Off'}</span>
      </div>
      <p className="text-sm text-zinc-700 dark:text-zinc-300">When a student checks in to a class with the code on the screen, their phone’s position is compared with the campus. It’s never stored. Off, any check-in with the right code counts.</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Latitude<input inputMode="decimal" value={form.lat} onChange={(e) => setDraft({ ...form, lat: e.target.value })} className="input mt-1 w-36" placeholder="12.971600" /></label>
        <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Longitude<input inputMode="decimal" value={form.lng} onChange={(e) => setDraft({ ...form, lng: e.target.value })} className="input mt-1 w-36" placeholder="77.594600" /></label>
        <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Within
          <select value={form.radius} onChange={(e) => setDraft({ ...form, radius: Number(e.target.value) })} className="input mt-1 w-32">
            {[100, 200, 300, 500, 1000, 2000].map((m) => <option key={m} value={m}>{m >= 1000 ? `${m / 1000} km` : `${m} m`}</option>)}
          </select>
        </label>
        <button type="button" onClick={useHere} disabled={busy} className="btn-secondary btn-sm"><LocateFixed className="w-4 h-4" />Where I am now</button>
        <span className="flex-1" />
        {data.on && <button type="button" onClick={() => void save(false)} disabled={busy} className="btn-secondary btn-sm">Turn off</button>}
        <button type="button" onClick={() => void save(true)} disabled={busy || !form.lat || !form.lng} className="btn-primary btn-sm">{busy && <Loader2 className="w-4 h-4 animate-spin" />}{data.on ? 'Save' : 'Turn on'}</button>
      </div>
    </section>
  );
}
