'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { formatDistanceToNowStrict } from 'date-fns';
import { toast } from 'sonner';
import { Check, Copy, Crosshair, Flag, Gauge, Globe2, Link2, Loader2, MapPin, Maximize2, Minimize2, Minus, Navigation, Package, Plus, Route, Sparkles, Thermometer, Timer, Truck, X } from 'lucide-react';
import Link from '@/components/ui/Link';
import { QrCode } from '@/components/ui/QrCode';
import { api, errorMessage } from '@/lib/api';
import { distanceM } from '@/lib/attendance-rules';
import { fetcher } from '@/lib/fetcher';
import { useActivePoll } from '@/lib/realtime-client';
import { STAGES, STAGE_LABEL, STAGE_SHORT, type Stage } from '@/lib/trace';
import { useDarkMode } from '@/lib/use-dark';
import { useNow, useTick } from '@/lib/use-now';
import { cn } from '@/lib/utils';
import { glow, toBase } from './engine';
import { WorldCanvas, type Box, type Frame, type MapHandle } from './WorldCanvas';
import { LiveCard } from '@/components/live/LiveCard';
import { CityView } from '@/components/live/CityView';
import { Journey } from '@/components/live/Journey';
import { Tank } from '@/components/live/Tank';
import { Schedule } from '@/components/live/Schedule';

// The live tracking map (UniVerse Trace; the owner, 24 Oct 2026: "add 2d real time product tracking
// map also in and it should be in detailed"). Every batch's journey: the stops behind it drawn solid,
// the road still ahead dashed and flowing toward where it's going, and, while a phone carries it
// (/carry/<key>), a marker that glides between positions pointing the way it's heading, with its
// trail, speed, distance left and arrival time. Server: tracking() in src/server/trace-map.ts.

interface Stop { stage: string; place: string | null; lat: number; lng: number; at: string }
interface Ship {
  id: string; label: string; status: string; quantity: number; product: string; productId: string; sample: boolean; simulated: boolean;
  stops: Stop[]; dest: { lat: number; lng: number; place: string | null } | null;
  trail: { lat: number; lng: number; at: string; speed: number | null }[];
  position: { lat: number; lng: number } | null; heading: number | null; speedKmh: number | null; lastPingAt: string | null;
  carrierPath: string | null; kmLeft: number | null; etaMinutes: number | null;
  tempC?: number | null; maxTempC?: number | null; breaches?: number; tempAt?: string | null; sensor?: string | null; temps?: number[];
}

const WORLD: Box = [-170, -56, 180, 76];
const PINK = '#fe81d1', PINK_SOFT = '#ff9fdc';
const STATUS: Record<string, { label: string; cls: string }> = {
  IN_TRANSIT: { label: 'On the move', cls: 'bg-pink-500/12 text-pink-700 dark:text-pink-200' },
  DELIVERED: { label: 'Delivered', cls: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' },
  MADE: { label: 'Not shipped yet', cls: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300' },
};
const reduced = () => typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const lerpAngle = (a: number, b: number, t: number) => a + ((((b - a) % 360) + 540) % 360 - 180) * t;
const city = (p: string | null | undefined) => (p ?? '').split(',')[0] || 'Unknown';
const pathKm = (pts: { lat: number; lng: number }[]) => pts.slice(1).reduce((a, p, i) => a + distanceM(pts[i], p), 0) / 1000;
const duration = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min` : ''}` : `${min} min`);

/** How far along its whole journey a shipment is, 0 to 1. */
function progress(s: Ship) {
  if (s.status === 'DELIVERED') return 1;
  if (!s.dest || !s.position) return 0;
  const done = pathKm([...s.stops, s.position]), left = s.kmLeft ?? pathKm([s.position, s.dest]);
  return done + left > 0 ? done / (done + left) : 0;
}

export function TrackingMap() {
  const dark = useDarkMode();
  const calm = useReducedMotion();
  const poll = useActivePoll(5000);
  const { data, error, mutate } = useSWR<{ now: string; shipments: Ship[] }>('/trace/map/tracking', fetcher, { refreshInterval: poll, keepPreviousData: true });
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'moving' | 'done'>('all');
  const [full, setFull] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [dest, setDest] = useState<{ id: string; lat: number; lng: number; place: string } | null>(null);
  const map = useRef<MapHandle>(null);
  const frameRef = useRef<Frame | null>(null);
  // Where each marker is drawn: it glides from where it was to the newest position over one poll.
  const glide = useRef(new Map<string, { from: [number, number]; to: [number, number]; h0: number; h1: number; t0: number; dur: number }>());
  const fitted = useRef(false);

  const ships = useMemo(() => data?.shipments ?? [], [data]);
  const shown = ships.filter((s) => filter === 'all' || (filter === 'moving' ? s.status === 'IN_TRANSIT' : s.status === 'DELIVERED'));
  const sel = ships.find((s) => s.id === selected) ?? null;

  // New positions: start each marker's glide from wherever it's drawn right now.
  useEffect(() => {
    const now = performance.now(), g = glide.current;
    for (const s of ships) {
      if (!s.position) continue;
      const to = toBase(s.position.lng, s.position.lat), cur = g.get(s.id);
      const h = s.heading ?? cur?.h1 ?? 0;
      if (!cur) { g.set(s.id, { from: to, to, h0: h, h1: h, t0: now, dur: 1 }); continue; }
      if (cur.to[0] === to[0] && cur.to[1] === to[1]) continue;
      const e = Math.min(1, (now - cur.t0) / cur.dur), at: [number, number] = [cur.from[0] + (cur.to[0] - cur.from[0]) * e, cur.from[1] + (cur.to[1] - cur.from[1]) * e];
      g.set(s.id, { from: at, to, h0: lerpAngle(cur.h0, cur.h1, e), h1: h, t0: now, dur: reduced() ? 1 : (poll || 5000) * 1.08 });
    }
    if (!fitted.current && ships.length) {
      fitted.current = true;
      const pts = ships.filter((s) => s.status === 'IN_TRANSIT').flatMap((s) => [...s.stops, ...(s.dest ? [s.dest] : []), ...(s.position ? [s.position] : [])]);
      const all = pts.length ? pts : ships.flatMap((s) => s.stops);
      if (all.length) setTimeout(() => map.current?.flyTo(boxOf(all), { pad: 80, maxZoom: 60 }), 120);
    }
    map.current?.redraw();
  }, [ships, poll]);

  useEffect(() => {
    if (!full) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [full]);

  const markerAt = (s: Ship, t: number): { x: number; y: number; h: number } | null => {
    const g = glide.current.get(s.id);
    if (!g) return null;
    const e = Math.min(1, Math.max(0, (t - g.t0) / g.dur));
    return { x: g.from[0] + (g.to[0] - g.from[0]) * e, y: g.from[1] + (g.to[1] - g.from[1]) * e, h: lerpAngle(g.h0, g.h1, e) };
  };

  const select = (id: string | null) => {
    setSelected(id);
    const s = ships.find((x) => x.id === id);
    if (!s) return;
    const pts = [...s.stops, ...(s.dest ? [s.dest] : []), ...(s.position ? [s.position] : [])];
    if (pts.length) map.current?.flyTo(boxOf(pts), { pad: 90, maxZoom: 90 });
  };
  const findIt = (s: Ship) => { if (s.position) map.current?.flyTo([s.position.lng - 0.35, s.position.lat - 0.22, s.position.lng + 0.35, s.position.lat + 0.22], { maxZoom: 120 }); };

  // ─── Drawing (every frame) ───
  const draw = (f: Frame) => {
    frameRef.current = f;
    const { ctx, view, t, zoom } = f, k = view.k, still = reduced();
    const sx = (lng: number, lat: number): [number, number] => f.at(lng, lat);
    const bs = (b: [number, number]): [number, number] => [view.x + b[0] * k, view.y + b[1] * k];
    const ink = f.dark ? '#cbd2e6' : '#2b3568', paper = f.dark ? '#0a1721' : '#ffffff';
    const order = [...shown].sort((a, b) => (a.id === selected ? 1 : 0) - (b.id === selected ? 1 : 0));

    for (const s of order) {
      const focus = !selected || s.id === selected || s.id === hover;
      ctx.globalAlpha = focus ? 1 : 0.28;
      const stops = s.stops.map((p) => sx(p.lng, p.lat));
      const m = s.status === 'IN_TRANSIT' ? markerAt(s, t) : null;
      const mp = m ? bs([m.x, m.y]) : null;

      // The road behind: solid through every stop.
      if (stops.length > 1) {
        ctx.strokeStyle = ink; ctx.globalAlpha = (focus ? 1 : 0.28) * (s.status === 'DELIVERED' ? 0.55 : 0.75);
        ctx.lineWidth = s.id === selected ? 2.6 : 1.8; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath(); stops.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
        ctx.globalAlpha = focus ? 1 : 0.28;
      }
      // Since the last stop: the trail the phone sent, in pink, up to where the marker is drawn.
      if (mp && stops.length) {
        const trail = s.trail.slice(0, -1).map((p) => sx(p.lng, p.lat));
        ctx.save();
        // A faint wide line under a crisp one (M65: a blurred shadow here was redrawn every frame).
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(...stops[stops.length - 1]); for (const p of trail) ctx.lineTo(...p); ctx.lineTo(...mp);
        if (f.dark) { ctx.strokeStyle = 'rgba(254,129,209,0.18)'; ctx.lineWidth = s.id === selected ? 8 : 6; ctx.stroke(); }
        ctx.strokeStyle = PINK; ctx.lineWidth = s.id === selected ? 3 : 2.2; ctx.stroke();
        ctx.restore();
        // Older trail points fade out.
        trail.forEach(([x, y], i) => { ctx.globalAlpha = (focus ? 1 : 0.28) * (0.15 + (i / trail.length) * 0.6); ctx.fillStyle = PINK_SOFT; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill(); });
        ctx.globalAlpha = focus ? 1 : 0.28;
      }
      // The road ahead: dashed, flowing toward where it's going.
      if (s.dest && s.status !== 'DELIVERED') {
        const from = mp ?? stops[stops.length - 1];
        if (from) {
          const d = sx(s.dest.lng, s.dest.lat);
          ctx.save(); ctx.setLineDash([7, 6]); ctx.lineDashOffset = still ? 0 : -t / 45;
          ctx.strokeStyle = f.dark ? 'rgba(255,159,220,0.7)' : 'rgba(193,58,146,0.6)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(...from); ctx.lineTo(...d); ctx.stroke(); ctx.restore();
          // The destination: a flag in a slow pulse.
          const p = still ? 0 : (t % 2200) / 2200;
          ctx.strokeStyle = PINK; ctx.globalAlpha = (focus ? 1 : 0.28) * (1 - p) * 0.8; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(d[0], d[1], 6 + p * 16, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = focus ? 1 : 0.28;
          ctx.fillStyle = paper; ctx.strokeStyle = PINK; ctx.lineWidth = 2.2;
          ctx.beginPath(); ctx.arc(d[0], d[1], 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = PINK; ctx.beginPath(); ctx.arc(d[0], d[1], 2.2, 0, Math.PI * 2); ctx.fill();
          if (s.id === selected || zoom > 4) label(ctx, f, d[0], d[1] + 16, `→ ${city(s.dest.place)}`, PINK, true);
        }
      }
      // Stops.
      s.stops.forEach((p, i) => {
        const [x, y] = stops[i], last = i === s.stops.length - 1 && s.status === 'DELIVERED';
        ctx.fillStyle = last ? '#10b981' : paper; ctx.strokeStyle = last ? paper : ink; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, i === 0 ? 5.5 : 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (i === 0) { ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill(); }
        if (last) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x - 2.2, y); ctx.lineTo(x - 0.5, y + 1.8); ctx.lineTo(x + 2.4, y - 1.8); ctx.stroke(); }
        if (s.id === selected || zoom > 7) label(ctx, f, x, y - 14, `${STAGE_LABEL[p.stage as Stage] ?? p.stage} · ${city(p.place)}`, ink, false);
      });
      // The shipment itself: radar pulse, glow, a dot with an arrow for the way it's heading.
      if (mp && m) {
        const [x, y] = mp;
        if (!still) {
          for (const lag of [0, 0.5]) {
            const p = ((t / 2000 + lag) % 1);
            ctx.globalAlpha = (focus ? 1 : 0.28) * (1 - p) * 0.55; ctx.strokeStyle = PINK; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(x, y, 10 + p * 26, 0, Math.PI * 2); ctx.stroke();
          }
        }
        ctx.globalAlpha = (focus ? 1 : 0.28) * (f.dark ? 0.9 : 0.5);
        const g = glow(PINK); ctx.drawImage(g, x - 22, y - 22, 44, 44);
        ctx.globalAlpha = focus ? 1 : 0.28;
        ctx.fillStyle = PINK; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(x, y, s.id === selected ? 11 : 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.save(); ctx.translate(x, y); ctx.rotate((m.h * Math.PI) / 180);
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -5.5); ctx.lineTo(4, 4); ctx.lineTo(0, 2); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
        ctx.restore();
        if (s.id === selected || s.id === hover || zoom > 2.5) label(ctx, f, x, y - 24, `${s.label}${s.speedKmh ? ` · ${Math.round(s.speedKmh)} km/h` : ''}`, PINK, true);
      }
    }
    ctx.globalAlpha = 1;
  };

  // ─── Pointer ───
  const onPoint = (p: { x: number; y: number } | null, kind: 'hover' | 'click') => {
    const f = frameRef.current;
    if (!f) return;
    if (kind === 'click' && picking && p) {
      const [lng, lat] = f.lngLat(p.x, p.y);
      setDest({ id: picking, lat: Math.round(lat * 1e4) / 1e4, lng: Math.round(lng * 1e4) / 1e4, place: '' });
      setPicking(null);
      return;
    }
    let best: { id: string; d: number } | null = null;
    if (p) for (const s of shown) {
      const m = s.status === 'IN_TRANSIT' ? markerAt(s, f.t) : null;
      const at = m ? [f.sx(m.x), f.sy(m.y)] : s.stops.length ? f.at(s.stops[s.stops.length - 1].lng, s.stops[s.stops.length - 1].lat) : null;
      if (!at) continue;
      const d = Math.hypot(p.x - at[0], p.y - at[1]);
      if (d < 18 && (!best || d < best.d)) best = { id: s.id, d };
    }
    const id = (best as { id: string } | null)?.id ?? null;
    if (kind === 'click') select(id);
    else if (id !== hover) setHover(id);
  };

  const saveDest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dest) return;
    try {
      await api.post(`/trace/batches/${dest.id}/carrier`, { destLat: dest.lat, destLng: dest.lng, destPlace: dest.place.trim() || 'Destination' });
      toast.success('Destination set. The map now shows the road ahead.');
      setDest(null);
      void mutate();
    } catch (err) { toast.error(errorMessage(err, 'Could not set it.')); }
  };

  const control = (id: 'in' | 'out' | 'home' | 'full') => {
    if (id === 'full') setFull((v) => !v);
    else if (id === 'home') map.current?.home();
    else map.current?.zoomBy(id === 'in' ? 1.8 : 1 / 1.8);
  };

  if (error) {
    const noBrand = /brand/i.test(errorMessage(error, ''));
    return (
      <div className="panel p-8 text-center">
        <Truck className="w-8 h-8 mx-auto text-pink-500" aria-hidden />
        <p className="mt-3 font-bold text-zinc-900 dark:text-white">{noBrand ? 'Start your brand to track shipments.' : 'Tracking could not load.'}</p>
        {noBrand ? <Link href="/trace" className="btn-primary mt-4 inline-flex">Start your brand</Link> : <button type="button" onClick={() => void mutate()} className="btn-secondary mt-4">Try again</button>}
      </div>
    );
  }

  const moving = ships.filter((s) => s.status === 'IN_TRANSIT').length;
  const homeBox = ships.length ? boxOf(ships.flatMap((s) => [...s.stops, ...(s.dest ? [s.dest] : [])])) : WORLD;

  return (
    <div className="space-y-4">
      {ships.length > 0 && <FleetInMotion ships={ships} />}
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Show" className="flex rounded-full bg-zinc-100 dark:bg-white/[0.06] p-1">
          {([['all', `All · ${ships.length}`], ['moving', `On the move · ${moving}`], ['done', 'Delivered']] as const).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={filter === id} onClick={() => setFilter(id)} className={cn('relative rounded-full px-3 py-1.5 text-xs font-semibold transition-colors', filter === id ? 'text-white' : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white')}>
              {filter === id && <motion.span layoutId="track-filter" className="absolute inset-0 rounded-full bg-indigo-600" transition={{ type: 'spring', stiffness: 460, damping: 36 }} />}
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>
        <span className="ml-auto inline-flex items-center gap-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
          <span className="relative flex w-2.5 h-2.5" aria-hidden><span className={cn('absolute inset-0 rounded-full bg-pink-500', poll && moving && 'animate-ping opacity-60')} /><span className="relative w-2.5 h-2.5 rounded-full bg-pink-500" /></span>
          {poll ? 'Live · updates every 5 s' : 'Paused'}
        </span>
      </div>

      <div className="grid xl:grid-cols-[360px_1fr] gap-4 items-start">
        {/* Shipments */}
        <section aria-label="Shipments" className="space-y-2 xl:max-h-[calc(100vh-220px)] xl:overflow-y-auto xl:pr-1 order-2 xl:order-1">
          {!data && Array.from({ length: 3 }, (_, i) => <div key={i} className="panel h-28 skeleton" />)}
          {data && shown.length === 0 && (
            <div className="panel p-6 text-center text-sm text-zinc-500">
              <Package className="w-6 h-6 mx-auto text-zinc-400" aria-hidden />
              <p className="mt-2">{ships.length ? 'Nothing here with this filter.' : 'No batches yet. Make one on the Console, record where it goes, and it shows up here.'}</p>
            </div>
          )}
          {shown.map((s, i) => (
            <ShipCard key={s.id} s={s} index={i} open={s.id === selected} onOpen={() => select(s.id === selected ? null : s.id)} onFind={() => findIt(s)} onPick={() => { setPicking(s.id); toast('Click the map where this batch is going.'); }} onChange={() => void mutate()} onHover={(h) => setHover(h ? s.id : null)} />
          ))}
        </section>

        {/* Map */}
        <div className={cn('panel overflow-hidden p-0 order-1 xl:order-2 xl:sticky xl:top-4', full && 'fixed inset-2 sm:inset-4 z-50 flex flex-col shadow-2xl')}>
          <WorldCanvas ref={map} label="Map of your shipments and where they are now" homeBox={homeBox} dark={dark} live={!calm && ships.length > 0} draw={draw} onPoint={onPoint}
            className={cn('w-full', full ? 'flex-1' : 'h-[62vh] min-h-[380px] max-h-[760px]', picking && '[&_[role=application]]:cursor-crosshair')}>
            {!data && <div className="absolute inset-0 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-pink-500" aria-label="Loading the map" /></div>}
            <div className="absolute right-3 top-3 flex flex-col gap-1.5">
              {([['in', Plus, 'Zoom in'], ['out', Minus, 'Zoom out'], ['home', Globe2, 'See every shipment'], ['full', full ? Minimize2 : Maximize2, full ? 'Leave full screen' : 'Full screen']] as const).map(([id, Icon, label]) => (
                <button key={id} type="button" onClick={() => control(id)} aria-label={label} title={label} className="w-9 h-9 grid place-items-center rounded-xl bg-white/90 dark:bg-[#171f44]/85 backdrop-blur text-zinc-700 dark:text-zinc-200 shadow-sm border border-zinc-200/70 dark:border-white/10 hover:text-pink-600 dark:hover:text-pink-300 active:scale-95 transition">
                  <Icon className="w-4 h-4" aria-hidden />
                </button>
              ))}
            </div>
            <AnimatePresence>
              {picking && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="absolute left-1/2 -translate-x-1/2 top-3 flex items-center gap-2 rounded-full bg-indigo-600 text-white px-4 py-2 text-xs font-semibold shadow-lg">
                  <Crosshair className="w-3.5 h-3.5" aria-hidden />Click where it’s going
                  <button type="button" onClick={() => setPicking(null)} aria-label="Cancel" className="ml-1 w-5 h-5 grid place-items-center rounded-full hover:bg-white/15"><X className="w-3 h-3" /></button>
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {dest && (
                <motion.form onSubmit={(e) => void saveDest(e)} initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  className="absolute left-1/2 -translate-x-1/2 top-3 w-[min(92%,360px)] rounded-2xl bg-white dark:bg-[#171f44] p-3 shadow-xl border border-zinc-200 dark:border-white/10">
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-200">What is this place called?
                    <input autoFocus value={dest.place} maxLength={160} onChange={(e) => setDest({ ...dest, place: e.target.value })} className="input mt-1" placeholder="Milan distribution centre" />
                  </label>
                  <p className="mt-1 font-mono text-[10px] text-zinc-500">{dest.lat}, {dest.lng}</p>
                  <div className="mt-2 flex justify-end gap-2"><button type="button" onClick={() => setDest(null)} className="btn-secondary btn-sm">Cancel</button><button type="submit" className="btn-primary btn-sm"><Flag className="w-3.5 h-3.5" />Set destination</button></div>
                </motion.form>
              )}
            </AnimatePresence>
            {/* The selected shipment, over the map */}
            <AnimatePresence>
              {sel && sel.status === 'IN_TRANSIT' && (
                <motion.div key={sel.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  className="absolute left-3 bottom-3 right-3 sm:right-auto sm:w-[420px] rounded-2xl bg-white/94 dark:bg-[#171f44]/90 backdrop-blur px-4 py-3 shadow-xl border border-zinc-200/70 dark:border-white/10">
                  <LiveStrip s={sel} />
                </motion.div>
              )}
            </AnimatePresence>
            <div className="absolute left-3 top-3 hidden sm:flex flex-col gap-1 rounded-xl bg-white/90 dark:bg-[#171f44]/85 backdrop-blur px-3 py-2 text-[11px] text-zinc-600 dark:text-zinc-300 shadow-sm border border-zinc-200/70 dark:border-white/10">
              <span className="flex items-center gap-2"><span className="w-4 h-0.5 bg-zinc-600 dark:bg-zinc-300 rounded" />Done</span>
              <span className="flex items-center gap-2"><span className="w-4 h-0.5 bg-pink-500 rounded shadow-[0_0_6px_#fe81d1]" />Live trail</span>
              <span className="flex items-center gap-2"><span className="w-4 border-t-2 border-dashed border-pink-500" />Still to go</span>
            </div>
          </WorldCanvas>
        </div>
      </div>
      {ships.length > 0 && <JourneysToday ships={ships} />}
    </div>
  );
}

/** M50: every shipment as a van in a night city, from its factory through the hub to its shop. */
function FleetInMotion({ ships }: { ships: Ship[] }) {
  const moving = ships.filter((s) => s.status === 'IN_TRANSIT');
  const etas = moving.map((s) => s.etaMinutes).filter((x): x is number => x !== null);
  return (
    <LiveCard title="Fleet in motion" sub="Every batch from its factory, through the warehouse, to its shop"
      stats={[{ label: 'On the move', value: String(moving.length) }, { label: 'Delivered', value: String(ships.filter((s) => s.status === 'DELIVERED').length) }, { label: 'Next arrival', value: etas.length ? duration(Math.min(...etas)) : '—' }]}
      ticker={ships.slice(0, 8).map((s) => `${s.label} · ${s.product} · ${STATUS[s.status]?.label ?? s.status}${s.etaMinutes !== null && s.status === 'IN_TRANSIT' ? ` · ${duration(s.etaMinutes)} to go` : ''}`)}>
      <CityView className="h-[340px] sm:h-[460px]" label="Your shipments on their way, as vans in a city"
        vans={ships.map((s) => ({ id: s.id, label: s.label, progress: progress(s), state: s.status === 'DELIVERED' ? 'done' : s.status === 'IN_TRANSIT' ? 'moving' : 'parked',
          note: s.status === 'DELIVERED' ? 'delivered' : s.status === 'IN_TRANSIT' && s.etaMinutes !== null ? duration(s.etaMinutes) : undefined }))} />
    </LiveCard>
  );
}

/** M50: when each journey started and ends (or is expected to), with a line for now. */
function JourneysToday({ ships }: { ships: Ship[] }) {
  const now = useNow();
  if (!now) return null;
  const slots = ships.filter((s) => s.stops.length).slice(0, 12).map((s) => {
    const start = new Date(s.stops[0].at).getTime();
    const end = s.status === 'DELIVERED' ? new Date(s.stops[s.stops.length - 1].at).getTime() : s.etaMinutes !== null ? now + s.etaMinutes * 60_000 : now + 3600_000;
    const moving = s.status === 'IN_TRANSIT';
    return { id: s.id, label: s.label, start, end: Math.max(moving || s.status === 'DELIVERED' ? end : start, start + 60_000), state: moving ? 'moving' as const : 'done' as const,
      note: s.status === 'DELIVERED' ? 'Delivered' : moving ? (s.dest?.place ? `→ ${city(s.dest.place)}` : 'On the move') : 'Waiting' };
  });
  if (!slots.length) return null;
  const from = Math.max(Math.min(...slots.map((x) => x.start), now - 6 * 3600_000), now - 7 * 86_400_000);
  const to = Math.min(Math.max(...slots.map((x) => x.end), now + 3 * 3600_000), now + 7 * 86_400_000);
  return (
    <section className="panel p-5" aria-labelledby="journeys-h">
      <h2 id="journeys-h" className="font-bold text-zinc-900 dark:text-white">Journeys</h2>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">When each one left and when it arrives, with now in pink</p>
      <Schedule className="mt-4" slots={slots} from={from} to={to} />
    </section>
  );
}

/** A small label pill on the canvas. */
function label(ctx: CanvasRenderingContext2D, f: Frame, x: number, y: number, text: string, color: string, strong: boolean) {
  ctx.save();
  ctx.font = `${strong ? 700 : 600} 11px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 14;
  x = Math.max(8 + w / 2, Math.min(f.w - 56 - w / 2, x)); // clear of the edges and the zoom buttons
  ctx.globalAlpha = Math.min(1, ctx.globalAlpha + 0.1);
  ctx.fillStyle = f.dark ? 'rgba(23,31,68,0.9)' : 'rgba(255,255,255,0.95)';
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - 10, w, 20, 10); ctx.fill();
  if (strong) { ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke(); }
  ctx.fillStyle = f.dark ? '#eef2fb' : '#171f44';
  ctx.fillText(text, x, y + 0.5);
  ctx.restore();
}

function boxOf(pts: { lat: number; lng: number }[]): Box {
  const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

/** Speed, distance left, arrival and the last position, for the shipment picked on the map. */
function LiveStrip({ s }: { s: Ship }) {
  const tick = useTick(true);
  const arrive = s.etaMinutes !== null ? new Date(tick + s.etaMinutes * 60_000) : null;
  const ago = s.lastPingAt ? Math.max(0, Math.round((tick - Date.parse(s.lastPingAt)) / 1000)) : null;
  return (
    <div>
      <div className="flex items-center gap-2 min-w-0">
        <Navigation className="w-4 h-4 text-pink-500 shrink-0" aria-hidden />
        <p className="font-bold text-sm text-zinc-900 dark:text-white truncate">{s.product} · {s.label}</p>
        {s.simulated && <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-pink-500/10 px-2 py-0.5 text-[10px] font-semibold text-pink-700 dark:text-pink-200"><Sparkles className="w-3 h-3" aria-hidden />sample</span>}
      </div>
      <dl className="mt-2 grid grid-cols-4 gap-2 text-center">
        {[
          ['Speed', s.speedKmh !== null ? `${Math.round(s.speedKmh)}` : '–', 'km/h'],
          ['Left', s.kmLeft !== null ? s.kmLeft.toLocaleString(undefined, { maximumFractionDigits: s.kmLeft < 10 ? 1 : 0 }) : '–', 'km'],
          ['Arrives', arrive ? arrive.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '–', s.etaMinutes !== null ? `in ${duration(s.etaMinutes)}` : ''],
          ['Last seen', ago === null ? '–' : ago < 90 ? `${ago}s` : formatDistanceToNowStrict(new Date(s.lastPingAt!)), 'ago'],
        ].map(([k, v, u]) => (
          <div key={k}><dt className="text-[10px] uppercase tracking-wider text-zinc-500">{k}</dt><dd className="font-mono text-base tabular-nums text-zinc-900 dark:text-white leading-tight">{v}</dd><dd className="text-[10px] text-zinc-500 truncate">{u}</dd></div>
        ))}
      </dl>
      {s.tempC != null && s.maxTempC != null && (
        <p className={cn('mt-2 flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 font-mono text-[11px]', s.tempC > s.maxTempC ? 'bg-amber-500/12 text-amber-700 dark:text-amber-200' : 'bg-sky-500/10 text-sky-700 dark:text-sky-200')}>
          <Thermometer className="w-3.5 h-3.5" aria-hidden />{s.tempC} °C{s.sensor === 'BLE' ? ' from the Bluetooth thermometer' : s.sensor === 'DEVICE' ? ' from the logger' : ''} · keep at {s.maxTempC} °C or colder{s.breaches ? ` · ${s.breaches} warm reading${s.breaches === 1 ? '' : 's'}` : ''}
          {s.temps && s.temps.length > 2 && <TempSpark temps={s.temps} limit={s.maxTempC} />}
        </p>
      )}
    </div>
  );
}

function ShipCard({ s, index, open, onOpen, onFind, onPick, onChange, onHover }: { s: Ship; index: number; open: boolean; onOpen: () => void; onFind: () => void; onPick: () => void; onChange: () => void; onHover: (on: boolean) => void }) {
  const now = useNow();
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const st = STATUS[s.status] ?? STATUS.MADE;
  const pct = progress(s);
  const from = s.stops[0]?.place, to = s.dest?.place ?? s.stops[s.stops.length - 1]?.place;
  const link = s.carrierPath && typeof window !== 'undefined' ? `${window.location.origin}${s.carrierPath}` : null;

  const share = async () => {
    setSharing(true);
    try { await api.post(`/trace/batches/${s.id}/carrier`, {}); onChange(); toast.success('Driver link ready. Send it to whoever carries the batch.'); }
    catch (e) { toast.error(errorMessage(e, 'Could not make the link.')); } finally { setSharing(false); }
  };
  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { toast.error('Could not copy. Select the link and copy it.'); }
  };

  return (
    <motion.article layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 8) * 0.03, type: 'spring', stiffness: 380, damping: 34 }}
      onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}
      className={cn('panel overflow-hidden transition-shadow', open && 'ring-2 ring-pink-500/50 shadow-[0_12px_40px_-16px_rgba(254,129,209,0.55)]')}>
      <button type="button" onClick={onOpen} aria-expanded={open} className="w-full text-left p-4">
        <div className="flex items-start gap-3">
          <span className={cn('w-10 h-10 shrink-0 rounded-2xl grid place-items-center', s.status === 'IN_TRANSIT' ? 'bg-pink-500/12 text-pink-600 dark:text-pink-300' : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300')}>
            {s.status === 'DELIVERED' ? <Check className="w-5 h-5" aria-hidden /> : <Truck className="w-5 h-5" aria-hidden />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-sm text-zinc-900 dark:text-white truncate">{s.label}</span>
            <span className="block text-xs text-zinc-500 truncate">{s.product} · {s.quantity.toLocaleString()} units</span>
          </span>
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', st.cls)}>{st.label}</span>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[11px] text-zinc-500">
          <span className="truncate max-w-[40%]">{city(from)}</span>
          <span className="relative flex-1 h-1.5 rounded-full bg-zinc-100 dark:bg-white/[0.07] overflow-hidden">
            <motion.span className={cn('block h-full rounded-full', s.status === 'DELIVERED' ? 'bg-emerald-500' : 'bg-gradient-to-r from-pink-500 to-fuchsia-500')} initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
          </span>
          <span className="truncate max-w-[40%] text-right">{city(to)}</span>
        </div>
        {s.status === 'IN_TRANSIT' && (
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-zinc-600 dark:text-zinc-300">
            {s.speedKmh !== null && <span className="inline-flex items-center gap-1"><Gauge className="w-3 h-3" aria-hidden />{Math.round(s.speedKmh)} km/h</span>}
            {s.kmLeft !== null && <span className="inline-flex items-center gap-1"><Route className="w-3 h-3" aria-hidden />{Math.round(s.kmLeft).toLocaleString()} km left</span>}
            {s.etaMinutes !== null && now > 0 && <span className="inline-flex items-center gap-1"><Timer className="w-3 h-3" aria-hidden />arrives {new Date(now + s.etaMinutes * 60_000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>}
            {s.tempC != null && <span className={cn('inline-flex items-center gap-1', s.maxTempC != null && s.tempC > s.maxTempC && 'text-amber-600 dark:text-amber-300')}><Thermometer className="w-3 h-3" aria-hidden />{s.tempC} °C</span>}
            {!s.position && <span>no live position yet</span>}
          </p>
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <div className="px-4 pb-4 border-t border-zinc-100 dark:border-white/[0.06] pt-3">
              {s.simulated && <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-pink-500/10 px-2.5 py-1 text-[11px] font-semibold text-pink-700 dark:text-pink-200"><Sparkles className="w-3 h-3" aria-hidden />Sample: it moves by itself until a real phone shares its position</p>}
              {/* M50: the journey so far, stage by stage, and how far along it is. */}
              <div className="mb-4 flex items-center gap-3">
                <Journey className="flex-1" label={`${s.label}'s journey, stage by stage`}
                  steps={STAGES.map((st) => { const stop = s.stops.find((p) => p.stage === st); return { label: STAGE_SHORT[st], at: stop ? new Date(stop.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null, done: !!stop || s.status === 'DELIVERED' }; })} />
                <Tank pct={pct * 100} tone={s.status === 'DELIVERED' ? 'green' : 'pink'} label="Of the way" />
              </div>
              <ol className="relative ml-1.5 border-l-2 border-zinc-200 dark:border-white/10 space-y-3">
                {s.stops.map((p, i) => (
                  <li key={i} className="pl-4 relative">
                    <span aria-hidden className={cn('absolute -left-[7px] top-1 w-3 h-3 rounded-full border-2', i === s.stops.length - 1 && s.status === 'DELIVERED' ? 'bg-emerald-500 border-emerald-500' : 'bg-white dark:bg-[#0a1721] border-zinc-500 dark:border-zinc-300')} />
                    <p className="text-xs font-semibold text-zinc-900 dark:text-white">{STAGE_LABEL[p.stage as Stage] ?? p.stage}</p>
                    <p className="text-[11px] text-zinc-500">{p.place ?? 'Unknown place'} · {new Date(p.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  </li>
                ))}
                {s.status === 'IN_TRANSIT' && s.position && (
                  <li className="pl-4 relative">
                    <span aria-hidden className="absolute -left-[8px] top-0.5 w-3.5 h-3.5 rounded-full bg-pink-500 ring-4 ring-pink-500/20" />
                    <p className="text-xs font-semibold text-pink-700 dark:text-pink-200">On the road now</p>
                    <p className="text-[11px] text-zinc-500">{s.position.lat.toFixed(3)}, {s.position.lng.toFixed(3)}</p>
                  </li>
                )}
                {s.dest && s.status !== 'DELIVERED' && (
                  <li className="pl-4 relative">
                    <span aria-hidden className="absolute -left-[7px] top-1 w-3 h-3 rounded-full border-2 border-dashed border-pink-500 bg-white dark:bg-[#0a1721]" />
                    <p className="text-xs font-semibold text-zinc-900 dark:text-white inline-flex items-center gap-1"><Flag className="w-3 h-3 text-pink-500" aria-hidden />{s.dest.place ?? 'Destination'}</p>
                    <p className="text-[11px] text-zinc-500">{s.etaMinutes !== null && now > 0 ? `expected ${new Date(now + s.etaMinutes * 60_000).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : 'arrival time once it moves'}</p>
                  </li>
                )}
              </ol>

              <div className="mt-4 flex flex-wrap gap-2">
                {s.position && s.status === 'IN_TRANSIT' && <button type="button" onClick={onFind} className="btn-secondary btn-sm"><Crosshair className="w-3.5 h-3.5" />Find it</button>}
                {s.status !== 'DELIVERED' && !s.dest && <button type="button" onClick={onPick} className="btn-secondary btn-sm"><MapPin className="w-3.5 h-3.5" />Set where it’s going</button>}
                {s.status !== 'DELIVERED' && !s.carrierPath && <button type="button" onClick={() => void share()} disabled={sharing} className="btn-primary btn-sm">{sharing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}Share with the driver</button>}
              </div>
              {link && s.status !== 'DELIVERED' && (
                <div className="mt-3 rounded-2xl bg-zinc-50 dark:bg-white/[0.04] p-3 flex gap-3 items-center">
                  <span className="shrink-0 rounded-xl bg-white p-1.5"><QrCode value={link} size={84} title="Driver link" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-zinc-900 dark:text-white">Driver link</p>
                    <p className="text-[11px] text-zinc-500">The driver opens it on their phone and taps Start sharing. No sign-in.</p>
                    <button type="button" onClick={() => void copy()} className="mt-1.5 btn-secondary btn-sm">{copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}{copied ? 'Copied' : 'Copy link'}</button>
                  </div>
                </div>
              )}
              {link && s.status !== 'DELIVERED' && s.maxTempC != null && (
                <details className="mt-2 rounded-2xl bg-zinc-50 dark:bg-white/[0.04] p-3 text-[11px] text-zinc-600 dark:text-zinc-300">
                  <summary className="cursor-pointer font-semibold text-zinc-900 dark:text-white">Connect a temperature sensor</summary>
                  <p className="mt-1.5">A Bluetooth thermometer: the driver pairs it on the driver page. A connected logger or gateway: have it send its readings (every 30 s or more) to this address:</p>
                  <code className="mt-1.5 block break-all rounded-lg bg-white dark:bg-black/30 px-2 py-1.5 font-mono">POST {link.replace(/\/carry\//, '/api/core/trace/carry/')}/reading</code>
                  <code className="mt-1 block break-all rounded-lg bg-white dark:bg-black/30 px-2 py-1.5 font-mono">{'{ "tempC": 4.2, "humidity": 61 }'}</code>
                  <p className="mt-1.5">Keep the address private, like the driver link. A warm reading tells your team at once (at most once an hour per shipment).</p>
                </details>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

/** The last day's temperatures as a tiny line, with the limit dashed. */
function TempSpark({ temps, limit }: { temps: number[]; limit: number | null }) {
  const W = 120, H = 22, lo = Math.min(...temps, limit ?? Infinity) - 0.5, hi = Math.max(...temps, limit ?? -Infinity) + 0.5;
  const y = (t: number) => H - ((t - lo) / (hi - lo || 1)) * H;
  const d = temps.map((t, i) => `${i ? 'L' : 'M'}${((i / (temps.length - 1)) * W).toFixed(1)},${y(t).toFixed(1)}`).join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ms-auto w-28 h-5 shrink-0" role="img" aria-label={`Temperatures from ${Math.min(...temps)} to ${Math.max(...temps)} °C`}>
      {limit !== null && <line x1={0} x2={W} y1={y(limit)} y2={y(limit)} stroke="currentColor" strokeOpacity={0.5} strokeDasharray="3 3" />}
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}
