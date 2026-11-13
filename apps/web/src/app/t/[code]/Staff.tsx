'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { Boxes, Check, Clock, Factory, Loader2, MapPin, Navigation, Package, Ruler, Store, Tag, Thermometer, Truck, Warehouse, type LucideIcon } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { spring } from '@/lib/motion';
import { STAGE_LABEL, type Stage } from '@/lib/trace';
import { ROLE_LABEL, ROLE_STOPS, type ChainRole, type ChainView } from '@/lib/trace-chain';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';

// M173: what the brand's people and its supply-chain team see when they scan a unit (src/lib/trace-chain.ts
// says what each role sees; the server leaves the rest out). Where and when this scan is, the trip so far
// as a timeline that draws itself, the facts their job needs, and a button for each stop they record:
// the new stop glides into the timeline. Motion is transform and opacity only; Reduce Motion: fades.

export type StaffAnswer = ChainView & {
  result: 'STAFF'; code: string; serial: number; note: string; status: string;
  brand: { name: string; logoUrl: string | null };
  product: { name: string; category: string | null; description: string | null; imageUrl: string | null };
  here: { place: string | null; at: string };
};

const ROLE_ICON: Record<ChainRole, LucideIcon> = { BRAND: Factory, WAREHOUSE: Warehouse, DRIVER: Truck, SHOP: Store, BUYER: Package };
const at = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
/** A stop's words, as the role that recorded it would say it ("Picked up" for a driver's SHIPPED). */
const stopLabel = (stage: string, role: string | null) => ROLE_STOPS[(role ?? 'BRAND') as ChainRole]?.find((s) => s.stage === stage)?.label ?? STAGE_LABEL[stage as Stage] ?? stage;
const money = (n: number, c: string | null) => { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: c ?? 'EUR' }).format(n); } catch { return `${n} ${c ?? ''}`.trim(); } };

async function position(): Promise<{ lat: number; lng: number } | null> {
  if (!('geolocation' in navigator)) return null;
  return new Promise((done) => navigator.geolocation.getCurrentPosition((g) => done({ lat: g.coords.latitude, lng: g.coords.longitude }), () => done(null), { timeout: 6000, maximumAge: 120_000 }));
}

export function StaffView({ data: first, code, carrierKey }: { data: StaffAnswer; code: string; carrierKey: string | null }) {
  const [data, setData] = useState(first);
  const [busy, setBusy] = useState<string | null>(null);
  const [fresh, setFresh] = useState<number | null>(null);
  const calm = useReducedMotion();
  const now = useNow();
  const RoleIcon = ROLE_ICON[data.role];
  const done = new Set(data.stops.map((s) => `${s.stage}:${s.role}`));
  const next = data.canRecord.find((s) => !done.has(`${s.stage}:${data.role}`));

  const record = async (stage: string) => {
    setBusy(stage);
    try {
      const pos = await position();
      const res = await api.post<{ ok: boolean; again: boolean; view: StaffAnswer }>(`/trace/scan/${encodeURIComponent(code)}/stop`, { stage, ...pos, ...(carrierKey && { key: carrierKey }) });
      setData(res.data.view);
      setFresh(res.data.again ? null : res.data.view.stops.length - 1);
      toast.success(res.data.again ? 'Already recorded a moment ago.' : `${stopLabel(stage, data.role)}: recorded${res.data.view.stops.at(-1)?.place ? ` in ${res.data.view.stops.at(-1)!.place}` : ''}.`);
    } catch (e) { toast.error(errorMessage(e, 'Could not record the stop.')); } finally { setBusy(null); }
  };

  const facts: { icon: LucideIcon; k: string; v: string }[] = [
    ...(data.destination ? [{ icon: Navigation, k: 'Going to', v: data.destination }] : []),
    ...(data.handling?.maxTempC !== null && data.handling?.maxTempC !== undefined ? [{ icon: Thermometer, k: 'Keep at', v: `${data.handling.maxTempC} °C or colder` }] : []),
    ...(data.handling ? [{ icon: Ruler, k: 'Weight', v: `${data.handling.weightKg} kg a unit` }] : []),
    ...(data.batch ? [{ icon: Boxes, k: 'Batch', v: `${data.batch.label} · ${data.batch.quantity.toLocaleString()} units` }] : []),
    ...('price' in data && data.price !== undefined ? [{ icon: Tag, k: 'Price', v: money(data.price, data.currency ?? null) }] : []),
    ...(data.scans !== undefined ? [{ icon: Check, k: 'Shopper checks', v: data.scans.toLocaleString() }] : []),
  ];
  const rise = (i: number) => (calm ? { initial: { opacity: 0 }, animate: { opacity: 1 } } : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0, transition: { ...spring.smooth, delay: 0.06 * i } } });

  return (
    <div className="mt-6 space-y-4">
      <motion.section {...rise(0)} className="passport-card p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--ins-hot)]/15 text-[var(--ins-hot)]"><RoleIcon className="h-5 w-5" aria-hidden /></span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{ROLE_LABEL[data.role]} view · {data.brand.name}</p>
            <p className="text-sm text-zinc-200">{data.note}</p>
          </div>
        </div>
        <div className="mt-4 flex gap-4">
          {data.product.imageUrl
            // eslint-disable-next-line @next/next/no-img-element -- the brand's own product photo
            ? <img src={data.product.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
            : <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/[0.06]"><Package className="h-7 w-7 text-zinc-300" aria-hidden /></span>}
          <div className="min-w-0">
            <h1 className="text-xl font-black leading-tight" translate="no">{data.product.name}</h1>
            <p className="mt-0.5 font-mono text-xs text-zinc-400">Unit {data.serial.toLocaleString()} · {data.code}</p>
          </div>
        </div>
      </motion.section>

      <motion.section {...rise(1)} className="passport-card p-5" aria-label="This scan">
        <div className="flex items-center gap-3">
          <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
            <MapPin className="h-5 w-5" aria-hidden />
            {!calm && <span aria-hidden className="absolute inset-0 rounded-full border border-emerald-300/60 pp-node" />}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">This scan</p>
            <p className="font-semibold">{data.here.place ?? 'Place unknown'}<span className="font-normal text-zinc-300"> · {now ? new Date(now).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : at(data.here.at)}</span></p>
          </div>
        </div>
        {facts.length > 0 && (
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            {facts.map((f) => (
              <div key={f.k} className="min-w-0 rounded-xl bg-white/[0.04] px-3 py-2">
                <dt className="flex items-center gap-1.5 text-xs text-zinc-400"><f.icon className="h-3.5 w-3.5" aria-hidden />{f.k}</dt>
                <dd className="truncate text-zinc-100" translate="no">{f.v}</dd>
              </div>
            ))}
          </dl>
        )}
      </motion.section>

      {data.canRecord.length > 0 && (
        <motion.section {...rise(2)} className="passport-card p-5" aria-labelledby="stop-h">
          <h2 id="stop-h" className="font-bold">Record where it is</h2>
          <p className="mt-1 text-xs text-zinc-400">With the time and your town (your phone’s position, rounded to about 10 km, when you allow it).</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {data.canRecord.map((s) => {
              const isNext = s.stage === next?.stage, did = done.has(`${s.stage}:${data.role}`);
              return (
                <button key={s.stage} type="button" disabled={!!busy} onClick={() => void record(s.stage)}
                  className={cn('inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-[transform,background-color,opacity] duration-150 active:scale-[0.97] disabled:opacity-60',
                    isNext ? 'bg-[var(--ins-hot)] text-black' : 'bg-white/[0.07] text-white hover:bg-white/[0.11]')}>
                  {busy === s.stage ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : did ? <Check className="h-4 w-4" aria-hidden /> : null}
                  {s.label}
                </button>
              );
            })}
          </div>
        </motion.section>
      )}

      <motion.section {...rise(3)} className="passport-card p-5" aria-labelledby="trip-h">
        <h2 id="trip-h" className="flex items-center gap-2 font-bold"><Clock className="h-4 w-4 text-zinc-300" aria-hidden />The trip so far</h2>
        {data.stops.length === 0 && <p className="mt-2 text-sm text-zinc-400">No stops recorded yet.</p>}
        <ol className="relative mt-4 space-y-4 ps-6">
          {/* The line draws down from the first stop. */}
          <motion.span aria-hidden className="absolute start-[7px] top-1.5 bottom-1.5 w-px origin-top bg-white/15" initial={calm ? { opacity: 0 } : { scaleY: 0 }} animate={calm ? { opacity: 1 } : { scaleY: 1 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.25 }} />
          <AnimatePresence initial>
            {data.stops.map((s, i) => {
              const last = i === data.stops.length - 1;
              return (
                <motion.li key={`${s.stage}-${s.at}`} className="relative"
                  initial={calm ? { opacity: 0 } : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0, transition: { ...spring.smooth, delay: i === fresh ? 0 : 0.3 + 0.05 * i } }}>
                  <span aria-hidden className={cn('absolute -start-6 top-1 h-3.5 w-3.5 rounded-full border-2', last ? 'border-[var(--ins-hot)] bg-[var(--ins-hot)]' : 'border-zinc-300 bg-zinc-300')} />
                  {last && !calm && <span aria-hidden className="absolute -start-6 top-1 h-3.5 w-3.5 rounded-full border border-[var(--ins-hot)] pp-node" />}
                  <p className="font-semibold">{stopLabel(s.stage, s.role)}{s.place ? <span className="font-normal text-zinc-300" translate="no"> · {s.place}</span> : null}</p>
                  <p className="flex flex-wrap gap-x-2 font-mono text-xs text-zinc-400">
                    <span>{at(s.at)}</span>
                    {s.role && <span>· {ROLE_LABEL[s.role as ChainRole] ?? s.role}</span>}
                    {'by' in s && s.by && <span translate="no">· {s.by}</span>}
                  </p>
                </motion.li>
              );
            })}
          </AnimatePresence>
          {next && data.destination && (
            <li className="relative opacity-70">
              <span aria-hidden className="absolute -start-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-dashed border-zinc-400" />
              <p className="font-semibold text-zinc-300">Next: {next.label}<span className="font-normal" translate="no"> · {data.destination}</span></p>
            </li>
          )}
        </ol>
      </motion.section>
    </div>
  );
}
