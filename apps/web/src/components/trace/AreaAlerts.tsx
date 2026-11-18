'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { BellRing, Loader2, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { THRESHOLDS, type Watch } from '@/lib/trace-watch';

// M308: Trace → Radar → Area alerts (GET/PUT /trace/watch): the countries a brand watches for copies, how
// many likely copies in a day set off an alert, and whether a cluster anywhere counts. Alerts come in the app.

type Data = { watch: Watch; recent: { area: string; at: string }[] };
const areaName = (a: string) => (a.startsWith('c:') ? (new Intl.DisplayNames(undefined, { type: 'region' }).of(a.slice(2)) ?? a.slice(2)) : `around ${a.slice(2).replace(',', ', ')}`);

export function AreaAlerts() {
  const { data, mutate } = useSWR<Data>('/trace/watch', fetcher);
  const [country, setCountry] = useState('');
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const w = data.watch;
  const save = async (next: Watch) => {
    setBusy(true);
    try { const r = await api.put<{ watch: Watch }>('/trace/watch', next); void mutate({ ...data, watch: r.data.watch }, { revalidate: false }); toast.success('Alerts saved'); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t save the alerts.')); }
    finally { setBusy(false); }
  };
  const add = () => { const c = country.trim().toUpperCase(); if (!/^[A-Z]{2}$/.test(c)) return void toast.error('Type a two-letter country code, like IN or FR.'); setCountry(''); if (!w.countries.includes(c)) void save({ ...w, countries: [...w.countries, c] }); };
  return (
    <section className="panel p-5 space-y-3" aria-labelledby="alerts-h">
      <h2 id="alerts-h" className="font-bold flex items-center gap-2 text-zinc-900 dark:text-white"><BellRing className="w-4 h-4 text-pink-500" aria-hidden />Area alerts</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">Hear in the app when likely copies (suspect checks and reported fakes) pile up in a place. One alert per place a day.</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="inline-flex items-center gap-2">Alert at
          <select className="input w-auto py-1" value={w.threshold} disabled={busy} onChange={(e) => void save({ ...w, threshold: Number(e.target.value) })}>
            {THRESHOLDS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {w.threshold === 1 ? 'copy' : 'copies'} in a day
        </label>
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={w.anywhere} disabled={busy} onChange={(e) => void save({ ...w, anywhere: e.target.checked })} />anywhere they cluster</label>
      </div>
      <div>
        <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Countries I watch</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {w.countries.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-800 dark:bg-white/10 dark:text-zinc-100">
              {areaName(`c:${c}`)}
              <button type="button" aria-label={`Stop watching ${areaName(`c:${c}`)}`} disabled={busy} onClick={() => void save({ ...w, countries: w.countries.filter((x) => x !== c) })}><X className="w-3 h-3" aria-hidden /></button>
            </span>
          ))}
          <form className="inline-flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <input aria-label="Country code" className="input w-20 py-1 text-sm uppercase" maxLength={2} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="IN" />
            <button type="submit" className="btn-secondary btn-sm" disabled={busy}>{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}Watch</button>
          </form>
        </div>
      </div>
      {data.recent.length > 0 && <p className="text-xs text-zinc-500">Told lately: {data.recent.map((r) => areaName(r.area)).join(', ')}</p>}
    </section>
  );
}
