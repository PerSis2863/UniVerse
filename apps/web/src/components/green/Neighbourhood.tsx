'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Loader2, LocateFixed, MapPinned, Plus, Trash2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Field } from '@/components/ui/Field';
import { Fill } from '@/components/ui/Fill';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { cn } from '@/lib/utils';
import { GREEN_FACTORS, GREEN_KINDS, type GreenKind } from '@/lib/green';
import { areaName, CHALLENGE_DAYS, MIN_NEIGHBOURS, pace } from '@/lib/green-area';
import { useNow } from '@/lib/use-now';

// M318: Green → My neighbourhood (API /green/area, src/server/green-area.ts): this month's CO₂ saved by
// everyone in my 0.1° square, and the challenges people here set, with progress and whether we're on pace.

type Challenge = { id: string; title: string; kind: GreenKind; unit: string; goal: number; progress: number; startsAt: string; endsAt: string; over: boolean; mine: boolean };
type Data = { area: { lat: number; lng: number } | null; neighbours?: number; enough?: boolean; month?: { kg: number; lastKg: number } | null; challenges?: Challenge[] };

export function Neighbourhood() {
  const { data, mutate } = useSWR<Data>('/green/area', fetcher);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const now = useNow();
  if (!data) return null;
  const set = (d: Data) => void mutate(d, { revalidate: false });
  const locate = () => {
    if (!('geolocation' in navigator)) return void toast.error('This device can’t share where it is.');
    setBusy(true);
    navigator.geolocation.getCurrentPosition(async (g) => {
      try { set((await api.put<Data>('/green/area', { lat: g.coords.latitude, lng: g.coords.longitude })).data); toast.success('Neighbourhood set', { description: 'Only the square it falls in is kept (about 11 km), never where you are.' }); }
      catch (e) { toast.error(errorMessage(e, 'Couldn’t set it.')); }
      finally { setBusy(false); }
    }, () => { setBusy(false); toast.error('Allow location for this site to find your neighbourhood.'); }, { timeout: 10_000, maximumAge: 600_000 });
  };
  const remove = async (id: string) => { try { set((await api.delete<Data>(`/green/area/challenges/${id}`)).data); } catch (e) { toast.error(errorMessage(e, 'Couldn’t remove it.')); } };
  return (
    <section className="panel p-5 space-y-3" aria-labelledby="hood-h">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="hood-h" className="me-auto font-bold flex items-center gap-2 text-zinc-900 dark:text-white"><MapPinned className="w-4 h-4 text-emerald-600" aria-hidden />My neighbourhood</h2>
        {data.area && <span className="text-xs text-zinc-500">{areaName(data.area)} · {data.neighbours} {data.neighbours === 1 ? 'person' : 'people'}</span>}
      </div>
      {!data.area ? (
        <>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">Join the people near you: see what your area saves together and take on challenges as neighbours.</p>
          <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={locate}>{busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <LocateFixed className="w-4 h-4" aria-hidden />}Find my neighbourhood</button>
        </>
      ) : !data.enough ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">Totals show once {MIN_NEIGHBOURS} people here have joined, so nobody’s own actions stand out. Invite your neighbours to UniVerse.</p>
      ) : (
        <>
          {data.month && <p className="text-sm text-zinc-700 dark:text-zinc-200"><b className="tabular-nums">{data.month.kg.toLocaleString()} kg</b> CO₂ saved here this month{data.month.lastKg ? <span className="text-zinc-500"> · {data.month.lastKg.toLocaleString()} kg last month</span> : null}</p>}
          {(data.challenges ?? []).map((c) => {
            const p = pace(c.progress, c.goal, Date.parse(c.startsAt), Date.parse(c.endsAt), now || Date.parse(c.startsAt));
            return (
              <div key={c.id} className="rounded-xl border border-zinc-200 p-3 dark:border-white/10">
                <div className="flex items-center gap-2 text-sm">
                  <span className="me-auto font-medium text-zinc-900 dark:text-white" translate="no">{c.title}</span>
                  {c.mine && !c.over && <button type="button" className="btn-ghost btn-sm" aria-label={`Remove the challenge ${c.title}`} onClick={() => void remove(c.id)}><Trash2 className="w-4 h-4" aria-hidden /></button>}
                </div>
                <span className="mt-2 block h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.06]"><Fill value={p.done} className={c.over && p.done >= 1 ? 'bg-amber-500' : 'bg-emerald-500'} /></span>
                <p className={cn('mt-1 text-xs tabular-nums', p.onPace || c.over ? 'text-zinc-600 dark:text-zinc-300' : 'text-amber-700 dark:text-amber-300')}>{c.progress} of {c.goal} {c.unit} · {c.over ? (p.done >= 1 ? 'done together!' : 'ended') : `${p.onPace ? 'on pace' : 'behind pace'}, until ${new Date(c.endsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}</p>
              </div>
            );
          })}
          <button type="button" className="btn-secondary btn-sm" onClick={() => setAdding(true)}><Plus className="w-4 h-4" aria-hidden />Set a neighbourhood challenge</button>
        </>
      )}
      {adding && <NewChallenge onClose={() => setAdding(false)} onDone={(d) => { setAdding(false); set(d); }} />}
    </section>
  );
}

function NewChallenge({ onClose, onDone }: { onClose: () => void; onDone: (d: Data) => void }) {
  const [f, setF] = useState({ kind: 'CYCLE' as GreenKind, goal: '500', days: '14', title: '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { const r = await api.post<Data>('/green/area/challenges', { ...f, goal: Number(f.goal), days: Number(f.days) }); toast.success('Challenge set', { description: 'Your neighbours were told in the app.' }); onDone(r.data); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t set it.')); }
    finally { setBusy(false); }
  };
  return (
    <Sheet title="A neighbourhood challenge" onClose={onClose} footer={<div className="flex justify-end gap-2"><button type="button" className="btn-ghost btn-sm" onClick={onClose}>Cancel</button><button type="button" className="btn-primary btn-sm" disabled={busy || !(Number(f.goal) > 0)} onClick={() => void save()}>{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}Set it</button></div>}>
      <div className="space-y-4">
        <Field label="Together, we…">{(p) => <select {...p} className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as GreenKind })}>{GREEN_KINDS.map((k) => <option key={k} value={k}>{GREEN_FACTORS[k].label}</option>)}</select>}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Goal (${GREEN_FACTORS[f.kind].units})`}>{(p) => <input {...p} type="number" min={1} className="input" value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} />}</Field>
          <Field label="For">{(p) => <select {...p} className="input" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })}>{CHALLENGE_DAYS.map((d) => <option key={d} value={d}>{d} days</option>)}</select>}</Field>
        </div>
        <Field label="Name (optional)">{(p) => <input {...p} className="input" maxLength={80} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Bike to work fortnight" />}</Field>
      </div>
    </Sheet>
  );
}
