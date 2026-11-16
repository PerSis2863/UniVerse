'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Award, Backpack, CloudSun, Download, HeartPulse, LocateFixed, Phone, Plus, Save, ShieldCheck, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { KIT, PLAN_EMPTY, FIRST_AID, weatherRisks, type Plan } from '@/lib/relief-plus';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import { useHome } from '@/components/travel/travel-ui';

// Relief → Be ready, First aid and My hours (M217). Be ready: my emergency plan (meeting points, contacts,
// needs: only I see it), a go-bag checklist, the emergency numbers of any country, the weather's risks where I
// am (MET Norway, through Travel's cached forecast), and a card of it all to keep on my phone. First aid: the
// basics in short steps. My hours: the volunteer shifts I did, with a certificate.

const field = 'mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white';
const label = 'block text-xs font-semibold text-zinc-600 dark:text-zinc-300';
type Countries = Record<string, unknown[]>;
function useCountries() {
  const [c, setC] = useState<Countries | null>(null);
  useEffect(() => { void import('@/lib/travel-countries.json').then((m) => setC(m.default as unknown as Countries)); }, []);
  return c;
}
const numbersOf = (c: Countries | null, cc: string | null) => (c && cc && Array.isArray(c[cc]?.[5]) ? (c[cc][5] as string[]).slice(0, 4) : []);
function save(name: string, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void, W = 1080, H = 1920) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (!g) return;
  draw(g, W, H);
  c.toBlob((b) => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }, 'image/png');
}
const font = (w: number, px: number) => `${w} ${px}px Inter, system-ui, sans-serif`;

function Numbers({ countries, cc, setCc }: { countries: Countries | null; cc: string | null; setCc: (c: string) => void }) {
  const names = useMemo(() => {
    if (!countries) return [];
    const dn = new Intl.DisplayNames(undefined, { type: 'region' });
    return Object.keys(countries).map((c) => [c, dn.of(c) ?? c] as const).sort((a, b) => a[1].localeCompare(b[1]));
  }, [countries]);
  const nums = numbersOf(countries, cc);
  return (
    <section className="panel p-5" aria-labelledby="nums-h">
      <h3 id="nums-h" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Phone className="h-5 w-5 text-red-600" aria-hidden />Emergency numbers</h3>
      <label className={cn(label, 'mt-3')}>Country<select value={cc ?? ''} onChange={(e) => setCc(e.target.value)} className={field}><option value="" disabled>Pick a country</option>{names.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></label>
      {nums.length ? (
        <div className="mt-3 flex flex-wrap gap-2">{nums.map((n, i) => <a key={n} href={`tel:${n}`} className={cn('inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-xl font-semibold tabular-nums', i === 0 ? 'bg-red-600 text-white' : 'bg-zinc-100 text-zinc-900 dark:bg-white/[0.08] dark:text-white')}><Phone className="h-4 w-4" aria-hidden />{n}</a>)}</div>
      ) : <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{cc ? 'Not known for this country: 112 works on mobile phones in most of the world.' : 'Pick a country.'}</p>}
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">From the country facts Travel uses. In Europe and on most mobiles, 112 reaches help too.</p>
    </section>
  );
}

export function ReliefReady() {
  const { data, mutate } = useSWR<{ plan: Plan; kit: string[]; updatedAt: string | null }>('/relief/plan', fetcher);
  const [draft, setDraft] = useState<Plan | null>(null);
  const plan = draft ?? data?.plan ?? PLAN_EMPTY, kit = data?.kit ?? [];
  const [home, setHome] = useHome();
  const countries = useCountries();
  const [risks, setRisks] = useState<ReturnType<typeof weatherRisks> | null>(null), [busy, setBusy] = useState(false);
  const set = <K extends keyof Plan>(k: K, v: Plan[K]) => setDraft({ ...plan, [k]: v });
  const savePlan = async () => {
    setBusy(true);
    try { await mutate((await api.put<{ plan: Plan; kit: string[]; updatedAt: string }>('/relief/plan', { plan })).data, { revalidate: false }); setDraft(null); toast.success('Plan saved: only you can see it.'); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t save the plan.')); } finally { setBusy(false); }
  };
  const tick = async (id: string) => {
    const next = kit.includes(id) ? kit.filter((x) => x !== id) : [...kit, id];
    if (data) await mutate({ ...data, kit: next }, { revalidate: false });
    try { await api.put('/relief/plan', { kit: next }); } catch (e) { toast.error(errorMessage(e, 'Couldn’t save that.')); await mutate(); }
  };
  const weather = () => navigator.geolocation?.getCurrentPosition(async (p) => {
    try { const { data: w } = await api.get<{ days: { date: string; min: number; max: number; rain: number }[] }>(`/travel/weather?lat=${p.coords.latitude.toFixed(2)}&lon=${p.coords.longitude.toFixed(2)}`); setRisks(weatherRisks(w.days)); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t get the forecast.')); }
  }, () => toast.error('Your browser didn’t share where you are.'), { timeout: 10_000 });
  const groups = [...new Set(KIT.map((k) => k.group))];
  const card = () => save('my-emergency-card.png', (g, W, H) => {
    g.fillStyle = '#111113'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#dc2626'; g.fillRect(0, 0, W, 260);
    g.fillStyle = '#ffffff'; g.font = font(700, 64); g.fillText('In an emergency', 80, 120);
    const nums = numbersOf(countries, home);
    g.font = font(800, 96); g.fillText(nums.length ? nums.slice(0, 3).join('  ·  ') : '112', 80, 225);
    let y = 380;
    const row = (k: string, v: string) => { if (!v) return; g.fillStyle = '#9ca3af'; g.font = font(600, 34); g.fillText(k, 80, y); y += 56; g.fillStyle = '#ffffff'; g.font = font(600, 46); for (const line of v.match(/.{1,38}(\s|$)/g) ?? [v]) { g.fillText(line.trim(), 80, y); y += 60; } y += 36; };
    row('Meet near home', plan.meetNear); row('If we can’t go home, meet at', plan.meetFar);
    row('Call', plan.contacts.map((c) => `${c.name} ${c.phone}`.trim()).join('   '));
    row('Medical needs', plan.needs); row('Pets', plan.pets);
    g.fillStyle = '#6b7280'; g.font = font(500, 30); g.fillText('UniVerse Relief', 80, H - 80);
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-6">
        <section className="panel p-5" aria-labelledby="plan-h">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="plan-h" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><ShieldCheck className="h-5 w-5 text-orange-600" aria-hidden />My emergency plan</h3>
            <button type="button" onClick={card} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><Download className="h-4 w-4" aria-hidden />Save a card for my phone</button>
          </div>
          <div className="text-sm text-zinc-600 dark:text-zinc-300">Agree it with the people you live with. Only you can see it.</div>
          {!data ? <div className="mt-4 h-40 animate-pulse rounded-xl bg-zinc-200/60 dark:bg-white/[0.05]" aria-busy="true" /> : (
            <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void savePlan(); }}>
              <label className={label}>Where to meet near home<input maxLength={120} value={plan.meetNear} onChange={(e) => set('meetNear', e.target.value)} placeholder="The bakery on the corner" className={field} /></label>
              <label className={label}>If you can’t go home, meet at<input maxLength={120} value={plan.meetFar} onChange={(e) => set('meetFar', e.target.value)} placeholder="A relative’s house in another town" className={field} /></label>
              <label className={label}>People in the household<input type="number" min={1} max={20} value={plan.people} onChange={(e) => set('people', Math.min(20, Math.max(1, Number(e.target.value) || 1)))} className={field} /></label>
              <label className={label}>Pets<input maxLength={120} value={plan.pets} onChange={(e) => set('pets', e.target.value)} placeholder="Mimi the cat: carrier under the stairs" className={field} /></label>
              <label className={cn(label, 'sm:col-span-2')}>Medical needs (medicines, equipment, allergies)<input maxLength={300} value={plan.needs} onChange={(e) => set('needs', e.target.value)} className={field} /></label>
              <fieldset className="sm:col-span-2">
                <legend className={label}>Who to call (someone out of the area is best)</legend>
                <ul className="mt-1 space-y-2">
                  {plan.contacts.map((c, i) => (
                    <li key={i} className="flex gap-2">
                      <label className="min-w-0 flex-1"><span className="sr-only">Name</span><input maxLength={60} value={c.name} placeholder="Name" onChange={(e) => set('contacts', plan.contacts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className={cn(field, 'mt-0')} /></label>
                      <label className="min-w-0 flex-1"><span className="sr-only">Phone</span><input maxLength={30} inputMode="tel" value={c.phone} placeholder="Phone" onChange={(e) => set('contacts', plan.contacts.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} className={cn(field, 'mt-0 tabular-nums')} /></label>
                      <button type="button" onClick={() => set('contacts', plan.contacts.filter((_, j) => j !== i))} className="btn-ghost btn-sm p-2" aria-label={`Remove ${c.name || 'this contact'}`}><X className="h-4 w-4" aria-hidden /></button>
                    </li>
                  ))}
                </ul>
                {plan.contacts.length < 6 && <button type="button" onClick={() => set('contacts', [...plan.contacts, { name: '', phone: '' }])} className="btn-ghost btn-sm mt-2 inline-flex items-center gap-1.5"><Plus className="h-4 w-4" aria-hidden />Add someone</button>}
              </fieldset>
              <label className={cn(label, 'sm:col-span-2')}>Anything else (where the gas and water taps are, who picks up the children)<textarea maxLength={500} rows={2} value={plan.notes} onChange={(e) => set('notes', e.target.value)} className={field} /></label>
              <div className="sm:col-span-2"><button type="submit" disabled={busy || !draft} className="btn-primary inline-flex items-center gap-1.5"><Save className="h-4 w-4" aria-hidden />Save the plan</button></div>
            </form>
          )}
        </section>

        <section className="panel p-5" aria-labelledby="kit-h">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="kit-h" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Backpack className="h-5 w-5 text-orange-600" aria-hidden />A bag ready to go</h3>
            <span className="text-sm tabular-nums text-zinc-600 dark:text-zinc-300" data-no-motion>{kit.length} of {KIT.length} ready</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/10" aria-hidden><span className="block h-full origin-left rounded-full bg-orange-500 transition-transform duration-500 ease-[var(--ease-glide)] rtl:origin-right" style={{ transform: `scaleX(${kit.length / KIT.length})` }} /></div>
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            {groups.map((gname) => (
              <div key={gname}>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{gname}</h4>
                <ul className="mt-1.5 space-y-1">
                  {KIT.filter((k) => k.group === gname).map((k) => (
                    <li key={k.id}><label className="flex cursor-pointer items-start gap-2.5 rounded-xl px-2 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-white/[0.04]"><input type="checkbox" checked={kit.includes(k.id)} onChange={() => void tick(k.id)} disabled={!data} className="mt-0.5 h-4 w-4 accent-orange-600" /><span className={cn(kit.includes(k.id) && 'text-zinc-500 line-through dark:text-zinc-400')}>{k.label(plan.people)}</span></label></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="space-y-6">
        <Numbers countries={countries} cc={home} setCc={setHome} />
        <section className="panel p-5" aria-labelledby="wx-h">
          <h3 id="wx-h" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><CloudSun className="h-5 w-5 text-orange-600" aria-hidden />Heat, frost and heavy rain</h3>
          {!risks ? <button type="button" onClick={weather} className="btn-secondary btn-sm mt-3 inline-flex items-center gap-1.5"><LocateFixed className="h-4 w-4" aria-hidden />Check the coming days here</button>
            : !risks.length ? <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">No heat, frost or heavy rain in the coming week here.</p>
            : (
              <ul className="mt-3 space-y-2" data-no-motion>
                {risks.map((r) => (
                  <li key={`${r.date}-${r.kind}`} className={cn('rounded-xl p-3 text-sm', r.level === 'danger' ? 'bg-red-500/10 text-red-800 dark:text-red-200' : 'bg-amber-500/10 text-amber-900 dark:text-amber-100')}>
                    <span className="block text-xs font-semibold">{new Date(`${r.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })} · {r.level === 'danger' ? 'Danger' : 'Take care'}</span>{r.text}
                  </li>
                ))}
              </ul>
            )}
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Forecast: MET Norway (CC BY 4.0). Official warnings come from your weather service.</p>
        </section>
      </div>
    </div>
  );
}

export function ReliefFirstAid() {
  const [home, setHome] = useHome();
  const countries = useCountries();
  const first = numbersOf(countries, home)[0] ?? '112';
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="panel p-5" aria-labelledby="fa-h">
        <h3 id="fa-h" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><HeartPulse className="h-5 w-5 text-red-600" aria-hidden />First aid basics</h3>
        <div className="text-sm text-zinc-600 dark:text-zinc-300">Short steps, as the Red Cross and Red Crescent teach them. They don’t replace a course: take one, it’s a day well spent.</div>
        <div className="mt-4 space-y-2">
          {FIRST_AID.map((f, i) => (
            <details key={f.id} className="group rounded-2xl bg-zinc-50 p-4 dark:bg-white/[0.04]" open={i === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold text-zinc-900 dark:text-white [&::-webkit-details-marker]:hidden">
                <span>{f.title}</span>
                <span className="flex items-center gap-2">{f.call && <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-700 dark:text-red-300">Call {first}</span>}<Plus className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-45" aria-hidden /></span>
              </summary>
              <ol className="mt-3 list-decimal space-y-1.5 ps-5 text-sm leading-relaxed text-zinc-700 marker:font-semibold marker:text-zinc-500 dark:text-zinc-200">
                {f.steps.map((s) => <li key={s}>{s}</li>)}
              </ol>
            </details>
          ))}
        </div>
        <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">From the International Federation of Red Cross and Red Crescent Societies’ first-aid guidelines. <a href="https://www.ifrc.org/" target="_blank" rel="noopener noreferrer" className="underline">IFRC</a></p>
      </section>
      <div className="space-y-6">
        <a href={`tel:${first}`} className="flex items-center gap-4 rounded-[var(--radius-card)] bg-red-600 p-5 text-white shadow-lg">
          <Phone className="h-8 w-8 shrink-0" aria-hidden />
          <span><span className="block text-sm font-semibold">Call for help</span><span className="block text-3xl font-bold tabular-nums">{first}</span></span>
        </a>
        <Numbers countries={countries} cc={home} setCc={setHome} />
      </div>
    </div>
  );
}

export function ReliefHours() {
  const { data } = useSWR<{ total: number; shifts: { id: string; title: string; org: string; startsAt: string; hours: number }[] }>('/relief/hours', fetcher);
  const me = useAuthStore((s) => s.user?.name ?? '');
  const orgs = useMemo(() => [...new Set((data?.shifts ?? []).map((s) => s.org))], [data]);
  const certificate = () => data && save('volunteer-hours.png', (g, W, H) => {
    g.fillStyle = '#fffaf3'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#ea580c'; g.lineWidth = 14; g.strokeRect(40, 40, W - 80, H - 80);
    g.textAlign = 'center';
    g.fillStyle = '#9a3412'; g.font = font(600, 34); g.fillText('UniVerse Relief', W / 2, 190);
    g.fillStyle = '#111214'; g.font = font(700, 72); g.fillText('Volunteer hours', W / 2, 300);
    g.fillStyle = '#4b5563'; g.font = font(500, 36); g.fillText('This is to thank', W / 2, 430);
    g.fillStyle = '#111214'; g.font = font(700, 64); g.fillText(me || 'A volunteer', W / 2, 520);
    g.fillStyle = '#4b5563'; g.font = font(500, 36); g.fillText('for giving', W / 2, 610);
    g.fillStyle = '#ea580c'; g.font = font(800, 150); g.fillText(`${data.total} hours`, W / 2, 790);
    g.fillStyle = '#4b5563'; g.font = font(500, 34); g.fillText(`in ${data.shifts.length} ${data.shifts.length === 1 ? 'shift' : 'shifts'} with`, W / 2, 890);
    g.fillStyle = '#111214'; g.font = font(600, 38);
    orgs.slice(0, 5).forEach((o, i) => g.fillText(o, W / 2, 960 + i * 56));
    g.fillStyle = '#6b7280'; g.font = font(500, 28); g.fillText(`Up to ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}, from the shifts signed up for on UniVerse Relief`, W / 2, H - 120);
  }, 1080, 1350);
  return (
    <section className="panel p-5" aria-labelledby="hours-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="hours-h" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Award className="h-5 w-5 text-orange-600" aria-hidden />My volunteer hours</h3>
        <button type="button" onClick={certificate} disabled={!data?.total} className="btn-primary btn-sm inline-flex items-center gap-1.5"><Download className="h-4 w-4" aria-hidden />Save a certificate</button>
      </div>
      {!data ? <div className="mt-4 h-32 animate-pulse rounded-xl bg-zinc-200/60 dark:bg-white/[0.05]" aria-busy="true" /> : (
        <>
          <div className="mt-3 text-4xl font-semibold tabular-nums text-zinc-900 dark:text-white" data-no-motion>{data.total}<span className="ms-1 text-base font-normal text-zinc-500 dark:text-zinc-400">hours given{orgs.length ? ` with ${orgs.length} ${orgs.length === 1 ? 'organisation' : 'organisations'}` : ''}</span></div>
          {!data.shifts.length ? <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">Shifts you sign up for with an organisation count here once they’re over. Find shifts on Organisations.</p> : (
            <ul className="mt-4 divide-y divide-zinc-200/70 dark:divide-white/10" data-no-motion>
              {data.shifts.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0"><span className="block truncate font-semibold text-zinc-900 dark:text-white" translate="no">{s.title}</span><span className="block truncate text-xs text-zinc-500 dark:text-zinc-400" translate="no">{s.org} · {new Date(s.startsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span></span>
                  <span className="shrink-0 font-semibold tabular-nums text-zinc-900 dark:text-white">{s.hours} h</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">Counted from the shifts you signed up for that are over.</p>
    </section>
  );
}
