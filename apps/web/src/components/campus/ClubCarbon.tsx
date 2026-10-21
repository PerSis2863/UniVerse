'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Leaf, Loader2, Plus, Trash2 } from 'lucide-react';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { Field } from '@/components/ui/Field';
import { authedJson } from '@/lib/authed-fetch';
import { ACTIVITIES, CARBON_SOURCES, activityOf, kgFor } from '@/lib/carbon';
import { fadeUp, list } from '@/lib/motion';

// Stage 5 · Q16: a club's carbon tracker. Members log what the club did; each entry becomes kg CO2e
// with a standard factor (src/lib/carbon.ts). Savings (walking instead of driving…) are kept apart.
// Shown on its own page (/student/life/associations/carbon) and as the club page's Carbon tab.

interface Entry { id: string; activity: string; label: string; unit: string; saving: boolean; quantity: number; kgCo2e: number; note: string | null; occurredAt: string; by: string | null; canDelete: boolean }
interface Data {
  club: { id: string; name: string }; canLog: boolean; entries: Entry[];
  summary: { emitted: number; saved: number; byActivity: { key: string; label: string; kg: number; saving: boolean }[]; byMonth: { month: string; emitted: number; saved: number }[] };
}
const kg = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} t` : `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`);
const today = () => new Date().toISOString().slice(0, 10);
const GROUPS = ['Travel', 'Energy', 'Materials', 'Saved'] as const;

export function ClubCarbon({ clubId, showName = true }: { clubId: string; showName?: boolean }) {
  const key = `/api/campus/clubs/${encodeURIComponent(clubId)}/carbon`;
  const { data, error, isLoading, mutate } = useSWR<Data>(key, authedJson);
  const [activity, setActivity] = useState(ACTIVITIES[0].key);
  const [quantity, setQuantity] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const a = activityOf(activity);
  const preview = kgFor(activity, quantity);
  const most = useMemo(() => Math.max(1, ...(data?.summary.byActivity ?? []).map((x) => x.kg)), [data]);

  const add = async () => {
    setBusy(true);
    try {
      const out = await authedJson<Data>(key, { method: 'POST', body: JSON.stringify({ activity, quantity: Number(quantity), note, occurredAt: new Date(`${date}T12:00`).toISOString() }) });
      await mutate(out, { revalidate: false });
      setQuantity(''); setNote('');
      toast.success('Added');
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    try { await mutate(await authedJson<Data>(`${key}?entry=${encodeURIComponent(id)}`, { method: 'DELETE' }), { revalidate: false }); }
    catch (e) { toast.error((e as Error).message); }
  };

  if (error) return <div className="panel p-5"><p className="text-sm text-rose-600 dark:text-rose-400">{(error as Error).message || 'Couldn’t load the tracker.'}</p><button type="button" className="btn-secondary btn-sm mt-3" onClick={() => mutate()}>Try again</button></div>;
  if (isLoading || !data) return <ContentSkeleton variant="list" />;
  const s = data.summary;
  const month = s.byMonth.find((m) => m.month === new Date().toISOString().slice(0, 7));

  return (
    <motion.div variants={list} initial="hidden" animate="show" className="space-y-5">
      {showName && <motion.h2 variants={fadeUp} className="text-xl font-bold text-zinc-900 dark:text-white break-words">{data.club.name}</motion.h2>}
      <motion.div variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[['Emitted, last 12 months', kg(s.emitted)], ['This month', kg(month?.emitted ?? 0)], ['Saved by greener choices', kg(s.saved)]].map(([label, v]) => (
          <div key={label} className="panel p-4"><p className="text-2xl font-black tabular-nums text-zinc-900 dark:text-white">{v}</p><p className="text-xs text-zinc-600 dark:text-zinc-400">{label} (CO₂e)</p></div>
        ))}
      </motion.div>

      {data.canLog && (
        <motion.section variants={fadeUp} className="panel p-4 sm:p-5 space-y-3" aria-labelledby="log-h">
          <h3 id="log-h" className="font-bold text-zinc-900 dark:text-white">Add what the club did</h3>
          <div className="grid grid-cols-1 sm:grid-cols-[1.6fr_1fr_1fr] gap-3">
            <Field label="Activity">{(p) => (
              <select {...p} className="input" value={activity} onChange={(e) => setActivity(e.target.value)}>
                {GROUPS.map((g) => <optgroup key={g} label={g === 'Saved' ? 'Greener choices (saved)' : g}>{ACTIVITIES.filter((x) => x.group === g).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</optgroup>)}
              </select>
            )}</Field>
            <Field label={`Amount (${a?.unit ?? ''})`}>{(p) => <input {...p} className="input" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />}</Field>
            <Field label="Date">{(p) => <input {...p} className="input" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />}</Field>
            <Field label="Note (optional)" className="sm:col-span-3">{(p) => <input {...p} className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Bus to the beach clean-up, 24 people × 30 km" />}</Field>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-200 flex-1 min-w-0" aria-live="polite">
              {preview !== null ? <>{a?.saving ? 'Saves' : 'About'} <strong className="tabular-nums">{kg(preview)}</strong> CO₂e <span className="text-zinc-500">({a?.kgPerUnit} kg per {a?.unit})</span></> : `Factor: ${a?.kgPerUnit} kg CO₂e per ${a?.unit}`}
            </p>
            <button type="button" className="btn-primary" disabled={busy || preview === null} onClick={add}>{busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Plus className="w-4 h-4" aria-hidden />} Add</button>
          </div>
        </motion.section>
      )}

      {s.byActivity.length > 0 && (
        <motion.section variants={fadeUp} className="panel p-4 sm:p-5" aria-labelledby="by-h">
          <h3 id="by-h" className="font-bold text-zinc-900 dark:text-white">Where it comes from</h3>
          <ul className="mt-3 space-y-2.5">
            {s.byActivity.map((x) => (
              <li key={x.key} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] sm:grid-cols-[14rem_1fr_auto] items-center gap-3 text-sm">
                <span className="text-zinc-800 dark:text-zinc-100 break-words">{x.label}{x.saving ? ' (saved)' : ''}</span>
                <span className="h-2 rounded-full bg-zinc-100 dark:bg-white/[0.06] overflow-hidden" aria-hidden><span className={`block h-full rounded-full ${x.saving ? 'bg-teal-500' : 'bg-emerald-600'}`} style={{ width: `${Math.max(2, (x.kg / most) * 100)}%` }} /></span>
                <span className="tabular-nums text-zinc-700 dark:text-zinc-200 text-end">{kg(x.kg)}</span>
              </li>
            ))}
          </ul>
        </motion.section>
      )}

      <motion.section variants={fadeUp} className="panel" aria-labelledby="entries-h">
        <h3 id="entries-h" className="font-bold text-zinc-900 dark:text-white p-4 pb-2">Entries</h3>
        {data.entries.length ? (
          <ul className="divide-y divide-zinc-200 dark:divide-white/10">
            {data.entries.map((e) => (
              <li key={e.id} className="px-4 py-3 flex items-start gap-3 text-sm">
                <Leaf className={`w-4 h-4 mt-0.5 shrink-0 ${e.saving ? 'text-teal-600 dark:text-teal-400' : 'text-zinc-400'}`} aria-hidden />
                <div className="flex-1 min-w-0">
                  <p className="text-zinc-900 dark:text-white break-words">{e.label}: {e.quantity.toLocaleString()} {e.unit} · <strong className="tabular-nums">{e.saving ? 'saved ' : ''}{kg(e.kgCo2e)}</strong></p>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 break-words">{new Date(e.occurredAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}{e.by ? ` · ${e.by}` : ''}{e.note ? ` · ${e.note}` : ''}</p>
                </div>
                {e.canDelete && <button type="button" className="btn-ghost btn-icon btn-sm" aria-label={`Remove ${e.label}, ${new Date(e.occurredAt).toLocaleDateString()}`} onClick={() => remove(e.id)}><Trash2 className="w-4 h-4" aria-hidden /></button>}
              </li>
            ))}
          </ul>
        ) : <p className="px-4 pb-4 text-sm text-zinc-600 dark:text-zinc-400">Nothing yet. Start with your next event: how people travelled, the electricity or generator, the posters printed.</p>}
      </motion.section>
      <p className="text-xs text-zinc-500">Factors: {CARBON_SOURCES}. Approximate: good for seeing what matters and tracking change, not for audits.</p>
    </motion.div>
  );
}

