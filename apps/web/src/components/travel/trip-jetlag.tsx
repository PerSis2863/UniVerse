'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { BedDouble, Clock3, Glasses, Moon, Plane, Sun } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useNow } from '@/lib/use-now';
import { clockText } from '@/lib/travel-local';
import { isZone, jetLagPlan, shiftHours, type Window } from '@/lib/travel-jetlag';
import { clock, stopZone } from '@/lib/travel-today';
import { addDays, type PlanStop } from '@/lib/travel-plan';

// M244: the jet-lag planner and the group's clocks (the trip page's Ready part): from your home time zone to the
// trip's, when to sleep and when to get or avoid daylight before and after the flight (src/lib/travel-jetlag.ts), and
// a clock for each city and for everyone who chose to show the group theirs.

interface Member { id: string; name: string; zone?: string | null }
const nice = (t: string) => t.split('/').pop()!.replace(/\s*\([^)]*\)/, '');
const device = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } };
const span = (w: Window) => `${clock(w[0])}–${clock(w[1])}`;
const toMin = (v: string) => { const [h, m] = v.split(':').map(Number); return h * 60 + (m || 0); };
const place = (z: string) => z.split('/').pop()!.replace(/_/g, ' ');

export function TripJetLag({ tripId, stops, start, members, me, refresh }: { tripId: string; stops: PlanStop[]; start: string | null; members: Member[]; me: string; refresh: () => void }) {
  const now = useNow();
  const mine = members.find((m) => m.id === me)?.zone ?? null;
  const [home, setHome] = useState(() => mine ?? device());
  const cities = useMemo(() => stops.filter((s) => s.lat !== null).map((s) => ({ name: nice(s.name), zone: stopZone(s) })).filter((c, i, a) => a.findIndex((x) => x.zone === c.zone) === i), [stops]);
  const [away, setAway] = useState(cities[0]?.zone ?? 'UTC');
  const [date, setDate] = useState(start ?? '');
  const [bed, setBed] = useState('23:00'), [wake, setWake] = useState('07:00');
  const flightAt = date ? Date.parse(`${date}T12:00:00Z`) : now;
  const plan = useMemo(() => (isZone(home) && isZone(away) ? jetLagPlan(home, away, new Date(flightAt), toMin(bed), toMin(wake)) : null), [home, away, flightAt, bed, wake]);
  const share = async (zone: string | null) => {
    try { await api.patch(`/travel/trips/${tripId}/me`, { zone }); toast.success(zone ? 'The group can see your home clock.' : 'Your clock is hidden.'); } catch (e) { toast.error(errorMessage(e, 'Couldn’t save that.')); }
    refresh();
  };
  const at = new Date(now || 0);

  return (
    <section className="panel p-5 xl:col-span-2" aria-labelledby="jet-h">
      <h3 id="jet-h" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Plane className="h-5 w-5 text-indigo-500" aria-hidden />Jet lag and clocks</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Home time zone
          <input value={home} onChange={(e) => setHome(e.target.value.trim())} list="jet-zones" className="mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white" />
          <datalist id="jet-zones">{(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []).map((z) => <option key={z} value={z} />)}</datalist>
        </label>
        <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Going to
          <select value={away} onChange={(e) => setAway(e.target.value)} className="mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white">
            {cities.map((c) => <option key={c.zone} value={c.zone}>{c.name}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Flight day
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 block w-full min-w-[9.5rem] rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white" />
        </label>
        <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300">I usually sleep at
          <input type="time" value={bed} onChange={(e) => setBed(e.target.value || '23:00')} className="mt-1 block w-full min-w-[7rem] rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white" />
        </label>
        <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300">and wake at
          <input type="time" value={wake} onChange={(e) => setWake(e.target.value || '07:00')} className="mt-1 block w-full min-w-[7rem] rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white" />
        </label>
      </div>

      {!plan ? <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">Type a time zone like Europe/London or Asia/Kolkata.</p> : (
        <>
          <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-200">
            {plan.mild ? `The clock moves ${Math.abs(plan.shift)} h: little jet lag.` : `The clock moves ${Math.abs(plan.shift)} h ${plan.east ? 'forward (east)' : 'back (west)'}: about ${plan.adapt} days to settle.`}
          </p>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {plan.days.map((d) => (
              <li key={d.day} className="rounded-2xl bg-zinc-50 p-3 text-sm dark:bg-white/[0.04]">
                <p className="font-semibold text-zinc-900 dark:text-white">{d.day < 0 ? `${-d.day} ${d.day === -1 ? 'day' : 'days'} before` : d.day === 0 ? 'Flight day' : `Day ${d.day} there`}{date ? <span className="font-normal text-zinc-500 dark:text-zinc-400"> · {new Date(`${addDays(date, d.day)}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })}</span> : null}</p>
                <p className="mt-1 flex items-center gap-1.5 text-zinc-700 dark:text-zinc-200"><BedDouble className="h-4 w-4 text-indigo-500" aria-hidden />Sleep {clock(d.bed)}–{clock(d.wake)} <span className="text-xs text-zinc-500 dark:text-zinc-400">{d.where === 'home' ? 'home time' : 'local time'}</span></p>
                {d.seek && <p className="mt-1 flex items-center gap-1.5 text-zinc-700 dark:text-zinc-200"><Sun className="h-4 w-4 text-amber-500" aria-hidden />Daylight {span(d.seek)}</p>}
                {d.avoid && <p className="mt-1 flex items-center gap-1.5 text-zinc-700 dark:text-zinc-200"><Glasses className="h-4 w-4 text-zinc-500" aria-hidden />Keep dim {span(d.avoid)}</p>}
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{d.note}</p>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">General guidance from sleep research, not medical advice. Ask a pharmacist before taking anything to sleep.</p>
        </>
      )}

      <h4 className="mt-6 flex items-center gap-2 font-semibold text-zinc-900 dark:text-white"><Clock3 className="h-4 w-4 text-indigo-500" aria-hidden />Clocks</h4>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {cities.map((c) => <ClockCard key={c.zone} name={c.name} zone={c.zone} at={at} home={home} />)}
        {members.filter((m) => m.zone && isZone(m.zone)).map((m) => <ClockCard key={m.id} name={m.id === me ? 'You (home)' : `${m.name} (home)`} zone={m.zone!} at={at} home={home} person />)}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
        {mine ? <>Your home clock ({place(mine)}) is shown to the group. <button type="button" className="btn-ghost btn-sm" onClick={() => void share(null)}>Hide it</button></>
          : <>The others can’t see your home clock. <button type="button" className="btn-secondary btn-sm" disabled={!isZone(home)} onClick={() => void share(home)}>Show my clock ({place(home)})</button></>}
      </div>
    </section>
  );
}

function ClockCard({ name, zone, at, home, person }: { name: string; zone: string; at: Date; home: string; person?: boolean }) {
  const diff = isZone(home) ? shiftHours(home, zone, at) : 0;
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' }).format(at));
  const Icon = hour >= 7 && hour < 20 ? Sun : Moon;
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-zinc-50 p-3 dark:bg-white/[0.04]">
      <Icon className="h-5 w-5 shrink-0 text-indigo-500" aria-hidden />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white" translate={person ? 'no' : undefined}>{name}</p>
        <p className="text-xs text-zinc-600 dark:text-zinc-300">{diff === 0 ? 'Same as home' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)} h from home`}</p>
      </div>
      <span className="ms-auto text-lg font-semibold tabular-nums text-zinc-900 dark:text-white">{at.getTime() ? clockText(zone, at) : '--:--'}</span>
    </li>
  );
}
