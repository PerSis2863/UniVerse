'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { CalendarDays, Check, Flag, Footprints, LocateFixed, MapPin, Plus, Recycle, Shirt, Sprout, Trash2, Users, Wrench, type LucideIcon } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { cn } from '@/lib/utils';

// Green → Events (M216): community clean-ups, tree plantings, repair cafés, swaps and nature walks coming up,
// near you or anywhere; "I'm going" (only the count is shown, never who), directions, a calendar entry. Adults
// organise them (the server checks); three reports hide one.

interface Ev { id: string; name: string; title: string; kind: string; date: string; time: string | null; place: string; lat: number | null; lng: number | null; details: string | null; going: number; imGoing: boolean; mine: boolean }
const KINDS: Record<string, { label: string; icon: LucideIcon }> = {
  cleanup: { label: 'Clean-up', icon: Recycle }, planting: { label: 'Tree planting', icon: Sprout }, repair: { label: 'Repair café', icon: Wrench },
  swap: { label: 'Swap', icon: Shirt }, walk: { label: 'Nature walk', icon: Footprints }, other: { label: 'Other', icon: CalendarDays },
};
const field = 'mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white';
const label = 'block text-xs font-semibold text-zinc-600 dark:text-zinc-300';
const when = (e: Ev) => `${new Date(`${e.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}${e.time ? ` · ${e.time}` : ''}`;
/** A calendar file for one event (all-day when it has no time). */
function ics(e: Ev) {
  const d = e.date.replace(/-/g, ''), esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const start = e.time ? `DTSTART:${d}T${e.time.replace(':', '')}00` : `DTSTART;VALUE=DATE:${d}`;
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//UniVerse//Green//EN', 'BEGIN:VEVENT', `UID:${e.id}@universe-green`, start, `SUMMARY:${esc(e.title)}`, `LOCATION:${esc(e.place)}`, e.details ? `DESCRIPTION:${esc(e.details)}` : '', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
}

export function GreenEvents() {
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const key = `/green/events${near ? `?lat=${near.lat.toFixed(2)}&lng=${near.lng.toFixed(2)}` : ''}`;
  const { data, mutate } = useSWR<{ events: Ev[] }>(key, fetcher);
  const [making, setMaking] = useState(false);
  const act = async (call: () => Promise<unknown>, ok: string) => {
    try { await call(); toast.success(ok); } catch (e) { toast.error(errorMessage(e, 'Couldn’t do that.')); }
    await mutate();
  };
  const findNear = () => navigator.geolocation?.getCurrentPosition((p) => setNear({ lat: p.coords.latitude, lng: p.coords.longitude }), () => toast.error('Your browser didn’t share where you are.'), { timeout: 10_000 });
  const download = (e: Ev) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics(e)], { type: 'text/calendar' }));
    a.download = `${e.title.replace(/[^\w\s-]/g, '').trim() || 'event'}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="space-y-6">
      <section className="panel flex flex-wrap items-center justify-between gap-3 p-5" aria-label="Events">
        <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-300">Clean-ups, tree plantings, repair cafés and swaps people organise. Say you’re going; only the number going is shown.</p>
        <div className="flex flex-wrap gap-2">
          {near ? <button type="button" onClick={() => setNear(null)} className="btn-secondary btn-sm">Everywhere</button> : <button type="button" onClick={findNear} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><LocateFixed className="h-4 w-4" aria-hidden />Near me</button>}
          <button type="button" onClick={() => setMaking((m) => !m)} aria-expanded={making} className="btn-primary btn-sm inline-flex items-center gap-1.5"><Plus className="h-4 w-4" aria-hidden />Organise one</button>
        </div>
      </section>
      {making && <NewEvent onDone={() => { setMaking(false); void mutate(); }} />}
      {!data ? <div className="h-64 animate-pulse rounded-[var(--radius-card)] bg-zinc-200/60 dark:bg-white/[0.05]" aria-busy="true" />
        : !data.events.length ? <div className="panel p-8 text-center"><CalendarDays className="mx-auto h-8 w-8 text-emerald-600" aria-hidden /><p className="mt-3 font-semibold text-zinc-900 dark:text-white">{near ? 'Nothing coming up near you yet.' : 'Nothing coming up yet.'}</p><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Organise the first: a litter pick in the park takes an hour.</p></div>
        : (
          <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {data.events.map((e) => {
              const k = KINDS[e.kind] ?? KINDS.other, Icon = k.icon;
              return (
                <li key={e.id} className="panel flex flex-col p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white" aria-hidden><Icon className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-emerald-700 dark:text-emerald-300">{k.label} · {when(e)}</span>
                      <span className="block text-lg font-semibold leading-snug text-zinc-900 dark:text-white" translate="no">{e.title}</span>
                    </span>
                  </div>
                  <p className="mt-3 flex items-start gap-1.5 text-sm text-zinc-700 dark:text-zinc-200"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden /><span translate="no">{e.place}</span></p>
                  {e.details && <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300" translate="no">{e.details}</p>}
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400"><Users className="h-3.5 w-3.5" aria-hidden />{e.going} going · organised by <span translate="no">{e.mine ? 'you' : e.name}</span></p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    <button type="button" aria-pressed={e.imGoing} onClick={() => void act(() => api.post(`/green/events/${e.id}/going`), e.imGoing ? 'Not going any more.' : 'See you there.')} className={cn('btn-sm inline-flex items-center gap-1.5', e.imGoing ? 'btn-secondary' : 'btn-primary')}>{e.imGoing ? <><Check className="h-4 w-4" aria-hidden />Going</> : 'I’m going'}</button>
                    {e.lat !== null && e.lng !== null && <a href={`https://www.openstreetmap.org/directions?route=%3B${e.lat}%2C${e.lng}`} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">Directions</a>}
                    <button type="button" onClick={() => download(e)} className="btn-ghost btn-sm">Add to calendar</button>
                    {e.mine ? <button type="button" onClick={() => { if (confirm(`Delete “${e.title}” for everyone?`)) void act(() => api.delete(`/green/events/${e.id}`), 'Event deleted.'); }} className="btn-ghost btn-sm ms-auto inline-flex items-center gap-1 text-red-600 dark:text-red-400"><Trash2 className="h-4 w-4" aria-hidden />Delete</button>
                      : <button type="button" onClick={() => { const reason = prompt('What’s wrong with this event?'); if (reason !== null) void act(() => api.post(`/green/events/${e.id}/report`, { reason }), 'Thanks: it’s reported. Three reports hide an event.'); }} className="btn-ghost btn-sm ms-auto inline-flex items-center gap-1 text-xs"><Flag className="h-3.5 w-3.5" aria-hidden />Report</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
    </div>
  );
}

function NewEvent({ onDone }: { onDone: () => void }) {
  const [v, setV] = useState({ title: '', kind: 'cleanup', date: '', time: '', place: '', details: '' });
  const [at, setAt] = useState<{ lat: number; lng: number } | null>(null), [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try { await api.post('/green/events', { ...v, time: v.time || null, ...(at ?? {}) }); toast.success('Your event is up: people near you can say they’re going.'); onDone(); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t put that up.')); } finally { setBusy(false); }
  };
  return (
    <form className="panel grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => { e.preventDefault(); void save(); }} aria-label="Organise an event">
      <label className={cn(label, 'sm:col-span-2')}>What<input required maxLength={80} value={v.title} onChange={set('title')} placeholder="Litter pick in Riverside Park" className={field} /></label>
      <label className={label}>Kind<select value={v.kind} onChange={set('kind')} className={field}>{Object.entries(KINDS).map(([id, k]) => <option key={id} value={id}>{k.label}</option>)}</select></label>
      <label className={label}>Date<input required type="date" value={v.date} onChange={set('date')} className={cn(field, 'min-w-[9.5rem]')} /></label>
      <label className={label}>Time (optional)<input type="time" value={v.time} onChange={set('time')} className={cn(field, 'min-w-[7rem]')} /></label>
      <label className={cn(label, 'sm:col-span-2 lg:col-span-2')}>Where to meet<input required maxLength={120} value={v.place} onChange={set('place')} placeholder="By the park’s main gate" className={field} /></label>
      <div className="flex items-end"><button type="button" onClick={() => navigator.geolocation?.getCurrentPosition((p) => setAt({ lat: p.coords.latitude, lng: p.coords.longitude }), () => toast.error('Your browser didn’t share where you are.'))} className={cn('btn-sm inline-flex w-full items-center justify-center gap-1.5', at ? 'btn-secondary' : 'btn-ghost')}>{at ? <><Check className="h-4 w-4" aria-hidden />On the map</> : <><LocateFixed className="h-4 w-4" aria-hidden />I’m there now</>}</button></div>
      <label className={cn(label, 'sm:col-span-2 lg:col-span-4')}>What to bring, who it’s for (optional)<textarea maxLength={600} rows={2} value={v.details} onChange={set('details')} className={field} /></label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
        <button type="submit" disabled={busy || !v.title.trim() || !v.date || !v.place.trim()} className="btn-primary">Put it up</button>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Shown with your first name. Events are for adults to organise; meet in public places.</p>
      </div>
    </form>
  );
}
