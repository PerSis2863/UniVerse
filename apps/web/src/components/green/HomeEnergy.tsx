'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Camera, Flame, Loader2, Plug, Trash2 } from 'lucide-react';
import { Field } from '@/components/ui/Field';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { cn } from '@/lib/utils';
import { HOME_ENERGY, type HomeEnergyKind } from '@/lib/green';

// M317: Green → Footprint → Home energy from bills (API /green/home, src/server/green-home.ts): each month's
// electricity, gas, oil or LPG from the bill, the kg CO₂e per month and per person against last year and the
// average; a photo of a bill fills the form by AI, the person checks it before saving.

type Data = {
  home: { people: number; country: string | null };
  bills: { id: string; month: string; kind: HomeEnergyKind; amount: number; unit: string; greenTariff: boolean; kg: number }[];
  months: { month: string; kg: number; perPerson: number }[];
  compare: { month: string; kg: number; vsYearAgo: number | null; vsAverage: number | null } | null;
  kwhMonth: number | null;
};
const thisMonth = () => new Date().toISOString().slice(0, 7);
const monthName = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
const UNIT_LABEL: Record<string, string> = { kWh: 'kWh', m3: 'm³', L: 'litres' };

export function HomeEnergy() {
  const { data, mutate } = useSWR<Data>('/green/home', fetcher);
  const [f, setF] = useState({ month: thisMonth(), kind: 'ELECTRICITY' as HomeEnergyKind, amount: '', unit: 'kWh', greenTariff: false });
  const [busy, setBusy] = useState<null | 'save' | 'read'>(null);
  const file = useRef<HTMLInputElement>(null);
  if (!data) return <div className="h-48 rounded-[var(--radius-card)] skeleton" />;
  const set = (d: Data) => void mutate(d, { revalidate: false });
  const save = async () => {
    setBusy('save');
    try { const r = await api.post<Data>('/green/home/bills', { ...f, amount: Number(f.amount) }); set(r.data); setF({ ...f, amount: '' }); toast.success('Bill added'); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t add the bill.')); }
    finally { setBusy(null); }
  };
  const read = async (fileIn: File | undefined) => {
    if (!fileIn) return;
    if (fileIn.size > 4_500_000) return void toast.error('That file is over 4.5 MB: take a smaller photo.');
    setBusy('read');
    try {
      const data64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = () => rej(new Error('Couldn’t read the file.')); r.readAsDataURL(fileIn); });
      const r = await api.post<{ kind: HomeEnergyKind | null; month: string | null; amount: number | null; unit: string | null }>('/green/home/read', { image: { mimeType: fileIn.type, data: data64 } });
      setF((x) => ({ ...x, kind: r.data.kind ?? x.kind, month: r.data.month ?? x.month, amount: r.data.amount != null ? String(r.data.amount) : x.amount, unit: r.data.unit ?? x.unit }));
      toast.success('Read the bill', { description: 'Check the month and amount, then Add.' });
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t read the bill: type the amount in.')); }
    finally { setBusy(null); }
  };
  const remove = async (id: string) => { try { set((await api.delete<Data>(`/green/home/bills/${id}`)).data); } catch (e) { toast.error(errorMessage(e, 'Couldn’t remove it.')); } };
  const setHome = async (people: number, country: string | null) => { try { set((await api.put<Data>('/green/home', { people, country })).data); } catch (e) { toast.error(errorMessage(e, 'Couldn’t save that.')); } };
  const max = Math.max(1, ...data.months.map((m) => m.kg));
  const c = data.compare;
  return (
    <section className="panel p-5 space-y-4" aria-labelledby="home-energy-h">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="home-energy-h" className="me-auto font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><Plug className="w-4 h-4 text-emerald-600" aria-hidden />Home energy from bills</h2>
        <label className="text-sm text-zinc-700 dark:text-zinc-200 inline-flex items-center gap-1">People at home
          <input type="number" min={1} max={20} className="input w-16 py-1" defaultValue={data.home.people} onBlur={(e) => Number(e.target.value) !== data.home.people && void setHome(Number(e.target.value), data.home.country)} />
        </label>
        <label className="text-sm text-zinc-700 dark:text-zinc-200 inline-flex items-center gap-1">Country
          <input className="input w-16 py-1 uppercase" maxLength={2} defaultValue={data.home.country ?? ''} placeholder="IN" aria-describedby="grid-hint" onBlur={(e) => (e.target.value.toUpperCase() || null) !== data.home.country && void setHome(data.home.people, e.target.value.trim() || null)} />
        </label>
      </div>
      <p id="grid-hint" className="text-xs text-zinc-500">The country’s grid decides electricity’s carbon (a renewable tariff counts far less). Factors: UK government 2024, national grids 2023.</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 items-end">
        <Field label="Month">{(p) => <input {...p} type="month" className="input" max={thisMonth()} value={f.month} onChange={(e) => setF({ ...f, month: e.target.value })} />}</Field>
        <Field label="For">{(p) => <select {...p} className="input" value={f.kind} onChange={(e) => { const kind = e.target.value as HomeEnergyKind; setF({ ...f, kind, unit: HOME_ENERGY[kind].units[0] }); }}>{(Object.keys(HOME_ENERGY) as HomeEnergyKind[]).map((k) => <option key={k} value={k}>{HOME_ENERGY[k].label}</option>)}</select>}</Field>
        <Field label="Used">{(p) => <input {...p} type="number" min={0} step="any" inputMode="decimal" className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />}</Field>
        <Field label="Unit">{(p) => <select {...p} className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>{HOME_ENERGY[f.kind].units.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}</select>}</Field>
        <button type="button" className="btn-primary btn-sm col-span-2 sm:col-span-1" disabled={!!busy || !(Number(f.amount) > 0)} onClick={() => void save()}>{busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}Add</button>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {f.kind === 'ELECTRICITY' && <label className="inline-flex items-center gap-2 text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={f.greenTariff} onChange={(e) => setF({ ...f, greenTariff: e.target.checked })} />A renewable tariff or my own solar</label>}
        <input ref={file} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { void read(e.target.files?.[0]); e.target.value = ''; }} />
        <button type="button" className="btn-ghost btn-sm" disabled={!!busy} onClick={() => file.current?.click()}>{busy === 'read' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Camera className="w-4 h-4" aria-hidden />}Read a bill’s photo</button>
      </div>

      {data.months.length > 0 && (
        <>
          {c && <p className="text-sm text-zinc-700 dark:text-zinc-200"><b className="tabular-nums">{c.kg} kg</b> CO₂e in {monthName(c.month)}{c.vsYearAgo !== null && <> · <span className={c.vsYearAgo > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}>{c.vsYearAgo > 0 ? '+' : ''}{c.vsYearAgo}%</span> on a year before</>}{c.vsAverage !== null && <> · {c.vsAverage > 0 ? '+' : ''}{c.vsAverage}% on your average</>}</p>}
          <ol className="flex h-28 items-end gap-1" aria-label="kg CO₂e per month">
            {data.months.map((m) => (
              <li key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <span className="w-full rounded-t bg-emerald-500/80" style={{ height: `${Math.max(3, (m.kg / max) * 96)}px` }} aria-hidden />
                <span className="text-[11px] text-zinc-500">{monthName(m.month)}</span>
                <span className="sr-only">{monthName(m.month)}: {m.kg} kg, {m.perPerson} kg a person</span>
              </li>
            ))}
          </ol>
          <ul className="divide-y divide-zinc-100 text-sm dark:divide-white/[0.06]">
            {data.bills.slice(0, 12).map((b) => (
              <li key={b.id} className="flex items-center gap-2 py-1.5">
                {b.kind === 'ELECTRICITY' ? <Plug className="w-4 h-4 text-zinc-500" aria-hidden /> : <Flame className="w-4 h-4 text-zinc-500" aria-hidden />}
                <span className="w-16 tabular-nums text-zinc-600 dark:text-zinc-300">{monthName(b.month)}</span>
                <span className="min-w-0 flex-1 text-zinc-800 dark:text-zinc-100">{HOME_ENERGY[b.kind].label} · {b.amount} {UNIT_LABEL[b.unit]}{b.greenTariff ? ' · renewable' : ''}</span>
                <span className={cn('tabular-nums', 'text-zinc-700 dark:text-zinc-200')}>{b.kg} kg</span>
                <button type="button" className="btn-ghost btn-sm" aria-label={`Remove the ${HOME_ENERGY[b.kind].label.toLowerCase()} bill for ${monthName(b.month)}`} onClick={() => void remove(b.id)}><Trash2 className="w-4 h-4" aria-hidden /></button>
              </li>
            ))}
          </ul>
          {data.kwhMonth !== null && <p className="text-xs text-zinc-500">Your bills say about {data.kwhMonth} kWh of electricity a month: use that in the footprint above for a truer total.</p>}
        </>
      )}
    </section>
  );
}
