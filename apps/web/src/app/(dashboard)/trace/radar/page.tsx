'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { m as motion } from 'framer-motion';
import { AlertTriangle, Ban, Globe2, Loader2, ShieldAlert, Thermometer, TicketCheck, Flag } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { TraceTabs } from '@/components/trace/TraceTabs';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { useActivePoll } from '@/lib/realtime-client';
import { cn } from '@/lib/utils';
import { LiveCard } from '@/components/live/LiveCard';
import { Radar as RadarPicture } from '@/components/live/Radar';

// The Radar (UniVerse Trace): everything about a brand's products that needs a look, in one place.
// Likely copies (a label checked far from its first check), grey market (a batch checked outside the
// countries it was sold to), warm shipments (cold chain), blocked batches and recalls, plus handing
// over instant-win prizes. Server: GET /trace/radar (src/server/trace-plus.ts).

interface ScanRow { id: string; code: string; place: string | null; country: string | null; at: string; product: string }
interface Radar {
  counts: { suspect: number; diverted: number; blocked: number; recalls: number; flagged: number; cold: number };
  suspect: ScanRow[]; diverted: ScanRow[];
  blocked: { id: string; label: string; product: string; at: string }[];
  recalls: { id: string; batchId: string; batch: string; product: string; reason: string; advice: string | null; severity: string; status: string; at: string; endedAt: string | null }[];
  cold: { batchId: string; label: string; product: string; maxT: number; limit: number; readings: number; last: string }[];
}

const ago = (d: string) => formatDistanceToNow(new Date(d), { addSuffix: true });
const flag = (cc: string | null) => (cc && /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0))) : '');
const SEVERITY: Record<string, string> = { CRITICAL: 'bg-rose-500/15 text-rose-700 dark:text-rose-200', HIGH: 'bg-amber-500/15 text-amber-700 dark:text-amber-200', MEDIUM: 'bg-sky-500/12 text-sky-700 dark:text-sky-200' };

export default function RadarPage() {
  return (
    <>
      <Topbar title="Radar" subtitle="Copies, grey market, warm shipments and recalls: what needs a look" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          <TraceTabs />
          <RadarBody />
        </div>
      </div>
    </>
  );
}

function RadarBody() {
  const { data, error, mutate } = useSWR<Radar>('/trace/radar', fetcher, { refreshInterval: useActivePoll(60_000), keepPreviousData: true });
  if (error) return <p className="panel p-6 text-sm text-zinc-500">{errorMessage(error, 'Start your brand to see its radar.')}</p>;
  if (!data) return <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{Array.from({ length: 5 }, (_, i) => <div key={i} className="panel h-24 animate-pulse" />)}</div>;
  const tiles = [
    { label: 'Likely copies', n: data.counts.suspect, icon: ShieldAlert, tone: 'text-amber-500', note: '30 days' },
    { label: 'Grey market', n: data.counts.diverted, icon: Globe2, tone: 'text-fuchsia-500', note: 'outside its markets' },
    { label: 'Warm shipments', n: data.counts.cold, icon: Thermometer, tone: 'text-sky-500', note: 'over the limit' },
    { label: 'Active recalls', n: data.counts.recalls, icon: AlertTriangle, tone: 'text-rose-500', note: 'shown on passports' },
    { label: 'Blocked', n: data.counts.blocked + data.counts.flagged, icon: Ban, tone: 'text-zinc-500', note: `${data.counts.blocked} batches · ${data.counts.flagged} codes` },
  ];
  const calm = tiles.every((t) => t.n === 0);
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {tiles.map((t, i) => (
          <motion.div key={t.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.3, ease: [0.23, 1, 0.32, 1] }} className={cn('panel p-4', t.n > 0 && t.label !== 'Blocked' && 'ring-1 ring-amber-400/30')}>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500"><t.icon className={cn('w-4 h-4', t.tone)} aria-hidden />{t.label}</p>
            <p className="mt-1 font-mono text-3xl tabular-nums text-zinc-900 dark:text-white">{t.n}</p>
            <p className="text-[11px] text-zinc-500">{t.note}</p>
          </motion.div>
        ))}
      </div>
      {/* M49/M50: everything that needs a look on one sweep: recalls and copies in the middle. */}
      <LiveCard title="On the radar" sub={calm ? 'All clear: the sweep finds nothing' : 'Recalls and likely copies in the middle, grey market and warm shipments next, blocks outside'}
        ticker={[...data.suspect.map((x) => `Likely copy: ${x.product}${x.place ? ` · ${x.place}` : ''}`), ...data.diverted.map((x) => `Grey market: ${x.product}${x.country ? ` · ${x.country}` : ''}`), ...data.cold.map((x) => `Warm: ${x.label} reached ${x.maxT} °C`), ...data.recalls.map((x) => `Recall: ${x.product}`)].slice(0, 8)}>
        <RadarPicture className="mx-auto h-[260px] max-w-[320px]" label="Copies, grey market, warm shipments, recalls and blocks"
          blips={[
            ...data.recalls.filter((x) => !x.endedAt).map((x) => ({ id: `r${x.id}`, label: x.product, ring: 0 as const, tone: 'aqua' as const })),
            ...data.suspect.map((x) => ({ id: `s${x.id}`, label: x.product, ring: 0 as const })),
            ...data.diverted.map((x) => ({ id: `d${x.id}`, label: x.product, ring: 1 as const, tone: 'blue' as const })),
            ...data.cold.map((x) => ({ id: `c${x.batchId}`, label: x.label, ring: 1 as const, tone: 'aqua' as const })),
            ...data.blocked.map((x) => ({ id: `b${x.id}`, label: x.product, ring: 2 as const, tone: 'white' as const })),
          ]} />
      </LiveCard>
      {calm && <p className="panel p-5 text-sm text-zinc-600 dark:text-zinc-300">All quiet: no copies, no grey market, no warm shipments and no recalls. The radar checks again every minute.</p>}

      <WinDesk />

      <div className="grid lg:grid-cols-2 gap-6">
        <ScanList title="Likely copies" icon={ShieldAlert} rows={data.suspect} empty="No label was checked far from its first check." hint="Each of these labels was checked far from where it was first checked: the code was probably copied. Block the code from the console if it keeps happening." />
        <ScanList title="Grey market" icon={Globe2} rows={data.diverted} empty="Every check came from the countries each batch was sold to." hint="Checks from outside the countries a batch was meant for (set them on the batch in the console): stock sold on where it shouldn’t be." />
      </div>

      {data.cold.length > 0 && (
        <section className="panel p-5" aria-labelledby="cold-h">
          <h2 id="cold-h" className="font-bold flex items-center gap-2 text-zinc-900 dark:text-white"><Thermometer className="w-4 h-4 text-sky-500" aria-hidden />Warm shipments</h2>
          <ul className="mt-3 divide-y divide-zinc-200/70 dark:divide-white/5">
            {data.cold.map((c) => (
              <li key={c.batchId} className="py-2.5 flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1"><span className="font-semibold text-zinc-900 dark:text-white">{c.product}</span><span className="text-zinc-500"> · {c.label}</span></span>
                <span className="font-mono text-xs text-amber-600 dark:text-amber-300">up to {c.maxT} °C (limit {c.limit} °C) · {c.readings} readings</span>
                <span className="font-mono text-[11px] text-zinc-500">{ago(c.last)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel p-5" aria-labelledby="recalls-h">
        <h2 id="recalls-h" className="font-bold flex items-center gap-2 text-zinc-900 dark:text-white"><AlertTriangle className="w-4 h-4 text-rose-500" aria-hidden />Recalls</h2>
        <p className="text-xs text-zinc-500">Start one from a batch in the console. While it’s active, every passport of that batch shows it in red with your advice.</p>
        {data.recalls.length === 0 ? <p className="mt-3 text-sm text-zinc-500">No recalls, ever. Nice.</p> : (
          <ul className="mt-3 space-y-2">
            {data.recalls.map((r) => (
              <li key={r.id} className="rounded-2xl bg-zinc-50 dark:bg-white/[0.04] p-3 flex flex-wrap items-start gap-3">
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', SEVERITY[r.severity] ?? SEVERITY.MEDIUM)}>{r.severity}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-zinc-900 dark:text-white">{r.reason}</span>
                  <span className="block text-xs text-zinc-500">{r.product} · {r.batch} · {r.status === 'ACTIVE' ? `since ${ago(r.at)}` : `ended ${r.endedAt ? ago(r.endedAt) : ''}`}</span>
                  {r.advice && <span className="block mt-1 text-xs text-zinc-600 dark:text-zinc-300">Advice: {r.advice}</span>}
                </span>
                {r.status === 'ACTIVE' && (
                  <button type="button" className="btn-secondary btn-sm" onClick={async () => { try { await api.post(`/trace/recalls/${r.id}/end`); toast.success('Recall ended'); void mutate(); } catch (e) { toast.error(errorMessage(e, 'Could not end it.')); } }}>End recall</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.blocked.length > 0 && (
        <section className="panel p-5" aria-labelledby="blocked-h">
          <h2 id="blocked-h" className="font-bold flex items-center gap-2 text-zinc-900 dark:text-white"><Ban className="w-4 h-4" aria-hidden />Blocked batches</h2>
          <ul className="mt-3 space-y-1 text-sm">{data.blocked.map((b) => <li key={b.id} className="text-zinc-700 dark:text-zinc-300">{b.product} · {b.label} <span className="font-mono text-[11px] text-zinc-500">blocked {ago(b.at)}</span></li>)}</ul>
        </section>
      )}
    </>
  );
}

function ScanList({ title, icon: Icon, rows, empty, hint }: { title: string; icon: typeof Flag; rows: ScanRow[]; empty: string; hint: string }) {
  return (
    <section className="panel p-5" aria-label={title}>
      <h2 className="font-bold flex items-center gap-2 text-zinc-900 dark:text-white"><Icon className="w-4 h-4 text-amber-500" aria-hidden />{title}</h2>
      <p className="text-xs text-zinc-500">{hint}</p>
      {rows.length === 0 ? <p className="mt-3 text-sm text-zinc-500">{empty}</p> : (
        <ul className="mt-3 max-h-80 overflow-y-auto divide-y divide-zinc-200/70 dark:divide-white/5">
          {rows.map((r) => (
            <li key={r.id} className="py-2 flex items-center gap-2 text-sm">
              <span className="w-6 text-center" aria-hidden>{flag(r.country)}</span>
              <span className="min-w-0 flex-1 truncate"><span className="text-zinc-900 dark:text-white">{r.place ?? 'Unknown place'}</span><span className="text-zinc-500"> · {r.product}</span></span>
              <span className="font-mono text-[11px] text-zinc-500 shrink-0">{ago(r.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Hand over an instant-win prize: the winner shows the code from their passport. */
function WinDesk() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const redeem = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { const r = await api.post<{ prize: string }>(`/trace/wins/${encodeURIComponent(code)}/redeem`); toast.success(`Hand over: ${r.data.prize}`); setCode(''); }
    catch (err) { toast.error(errorMessage(err, 'That code didn’t work.')); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={(e) => void redeem(e)} className="panel p-4 flex flex-wrap items-center gap-3">
      <TicketCheck className="w-5 h-5 text-amber-500" aria-hidden />
      <span className="text-sm font-semibold text-zinc-900 dark:text-white">Hand over a prize</span>
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Winner’s code" aria-label="Winner’s code" className="input flex-1 min-w-40 font-mono uppercase tracking-widest" />
      <button type="submit" disabled={busy || code.trim().length < 6} className="btn-primary btn-sm">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Check and hand over'}</button>
    </form>
  );
}
