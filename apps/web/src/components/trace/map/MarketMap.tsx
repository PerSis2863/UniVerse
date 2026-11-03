'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Factory, Globe2, Loader2, Lock, Maximize2, Megaphone, Minimize2, Minus, Pause, Play, Plus, Radio, Sparkles, Target, Wand2, X } from 'lucide-react';
import Link from '@/components/ui/Link';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { fmt } from '@/lib/instruments';
import { useActivePoll } from '@/lib/realtime-client';
import { useDarkMode } from '@/lib/use-dark';
import { cn } from '@/lib/utils';
import { BASE, arcPoints, glow, quad, toBase } from './engine';
import { WorldCanvas, type Box, type Frame, type MapHandle } from './WorldCanvas';

// The live market map (UniVerse Trace; the owner, 24 Oct 2026: "make the live map in detail like
// very detail with animations, transitions and it should be ultra smooth"). Where a brand's
// products are scanned, on a 0.1° grid: a glow for every place (bigger and hotter with more scans),
// an amber ring for the share that look like copies, flows from where the products are made, a
// replay of the period bin by bin, a ripple for every scan as it happens and, on PRO, the whole
// category's market behind it with the places the brand is missing. Server: src/server/trace-map.ts.

interface Cell { lat: number; lng: number; scans: number; suspect: number; first: number; place: string | null; country: string | null; last: string; products: Record<string, number> }
interface MarketCell { lat: number; lng: number; total: number; yours: number; place: string | null }
interface OpenMarket { locked: false; category: string | null; cells: MarketCell[]; total: number; yours: number; opportunities: (MarketCell & { share: number })[]; sample?: boolean }
type Market = { locked: true; category: string | null } | OpenMarket;
/** The category market when the brand may see it (PRO), else null. */
const openOf = (m: Market | undefined) => (m && !m.locked ? (m as OpenMarket) : null);
interface MapData {
  days: number; bucketHours: number; bins: number; start: string; now: string;
  brand: { name: string; color: string | null; category: string | null };
  products: { id: string; name: string }[];
  cells: Cell[]; timeline: [number, number][]; events: [number, number, number, number][];
  sample: boolean; origins: { lat: number; lng: number; place: string | null }[]; market: Market;
}
interface Place { key: string; place: string | null; country: string | null; scans: number; suspect: number; first: number; last: string; best: number; cells: number[]; products: Record<string, number> }
interface LiveScan { id: string; lat: number; lng: number; verdict: string; productId: string; place: string | null; at: string; sample?: boolean }

const RANGES = [{ days: 1, label: '24 h' }, { days: 7, label: '7 days' }, { days: 30, label: '30 days' }, { days: 90, label: '90 days' }];
const WORLD: Box = [-170, -56, 180, 76];
const PINK = '#fe81d1', PINK_SOFT = '#ff9fdc', AMBER = '#f59e0b';
const REPLAY_SECONDS = 14;

/** A place's dot radius: bigger with more scans, a little bigger closer in, never wider than its area. */
const dotR = (n: number, zf: number, tile: number) => Math.min(Math.min(13, 1.8 + Math.sqrt(n) * 0.75) * Math.min(1.35, Math.sqrt(zf)), tile >= 14 ? tile * 0.3 : 99);
/** The width of a 0.1° area on screen. */
const tileOf = (k: number) => (0.1 * BASE * k) / 360;
const ccOf = (place: string | null, country: string | null) => place?.match(/,\s*([A-Z]{2})$/)?.[1] ?? country;
const flag = (cc: string | null) => (cc && /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0))) : '');
const city = (place: string | null) => (place ?? 'Unknown place').split(',')[0];
const reduced = () => typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Ripple = { bx: number; by: number; born: number; color: string; size: number; text?: string };
/** A ripple with a label where a live scan just landed. */
function liveRipple(list: Ripple[], s: LiveScan) {
  if (reduced()) return;
  const [bx, by] = toBase(s.lng, s.lat);
  list.push({ bx, by, born: performance.now(), color: s.verdict === 'SUSPECT' ? AMBER : PINK, size: 1.4, text: `${city(s.place)} · ${s.verdict === 'SUSPECT' ? 'likely copy' : 'genuine'}` });
}

/** The fuchsia-to-purple heat of a market tile (t from 0 to 1). */
function heat(t: number, a: number) {
  const r = Math.round(124 + (217 - 124) * t), g = Math.round(58 + (70 - 58) * t), b = Math.round(237 + (239 - 237) * t);
  return `rgba(${r},${g},${b},${a})`;
}

export function MarketMap() {
  const dark = useDarkMode();
  const calm = useReducedMotion();
  const [days, setDays] = useState(30);
  const [product, setProduct] = useState('');
  const [layers, setLayers] = useState({ scans: true, flows: true, copies: true, market: false });
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<{ kind: 'cell' | 'market'; i: number } | null>(null);
  const [replay, setReplay] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [full, setFull] = useState(false);
  const [feed, setFeed] = useState<LiveScan[]>([]);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const poll = useActivePoll(6000);
  const key = `/trace/map/market?days=${days}${product ? `&product=${product}` : ''}`;
  const { data, error, mutate } = useSWR<MapData>(key, fetcher, { keepPreviousData: true, refreshInterval: poll ? 90_000 : 0 });

  const map = useRef<MapHandle>(null);
  const tip = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const range = useRef<HTMLInputElement>(null);
  const when = useRef<HTMLSpanElement>(null);
  const frameRef = useRef<Frame | null>(null);
  const anim = useRef({ ph: 0, last: 0, ripples: [] as Ripple[], rep: { upTo: -1, n: new Float32Array(0), s: new Float32Array(0) }, flown: '', ended: false });

  // Everything the frames need, worked out once per answer from the server.
  const model = useMemo(() => {
    if (!data) return null;
    const cells = data.cells.map((c) => { const [bx, by] = toBase(c.lng, c.lat); return { ...c, bx, by }; });
    const max = Math.max(1, ...cells.map((c) => c.scans));
    const byBin: number[][] = Array.from({ length: data.bins }, () => []);
    data.events.forEach((e, i) => byBin[e[1]]?.push(i));
    // A city spans several 0.1° areas: group them by place for the lists, labels and selection.
    const byPlace = new Map<string, Place>();
    cells.forEach((c, i) => {
      const key = c.place ?? `${c.lat},${c.lng}`, g = byPlace.get(key) ?? { key, place: c.place, country: c.country, scans: 0, suspect: 0, first: 0, last: c.last, best: i, cells: [], products: {} };
      g.scans += c.scans; g.suspect += c.suspect; g.first += c.first; g.cells.push(i);
      if (c.last > g.last) g.last = c.last;
      if (c.scans > cells[g.best].scans) g.best = i;
      for (const [p, n] of Object.entries(c.products)) g.products[p] = (g.products[p] ?? 0) + n;
      byPlace.set(key, g);
    });
    const places = [...byPlace.values()].sort((a, b) => b.scans - a.scans);
    const placeOf = new Map<number, string>();
    for (const g of places) for (const i of g.cells) placeOf.set(i, g.key);
    const origins = data.origins.map((o) => { const [bx, by] = toBase(o.lng, o.lat); return { ...o, bx, by }; });
    const flows = origins.length ? places.slice(0, 18).map((g) => cells[g.best]).map((c, i) => {
      const o = origins.reduce((a, b) => (Math.hypot(b.bx - c.bx, b.by - c.by) < Math.hypot(a.bx - c.bx, a.by - c.by) ? b : a));
      return { o, c, phase: (i * 0.37) % 1, w: Math.sqrt(c.scans / max) };
    }).filter((f) => Math.hypot(f.o.bx - f.c.bx, f.o.by - f.c.by) > 0.4) : [];
    const open = openOf(data.market);
    const mk = (open?.cells ?? []).map((c) => {
      const [x0, y0] = toBase(c.lng - 0.25, c.lat + 0.25), [x1, y1] = toBase(c.lng + 0.25, c.lat - 0.25);
      return { ...c, x0, y0, x1, y1 };
    });
    const mkMax = Math.log(Math.max(2, ...mk.map((c) => c.total)));
    const opp = new Set((open?.opportunities ?? []).map((o) => `${o.lat},${o.lng}`));
    const lats = cells.map((c) => c.lat), lngs = cells.map((c) => c.lng);
    const bounds: Box | null = cells.length ? [Math.min(...lngs) - 1.5, Math.min(...lats) - 1.5, Math.max(...lngs) + 1.5, Math.max(...lats) + 1.5] : null;
    const countries = new Set(cells.map((c) => ccOf(c.place, c.country)).filter(Boolean)).size;
    const total = cells.reduce((a, c) => a + c.scans, 0), suspect = cells.reduce((a, c) => a + c.suspect, 0);
    const names = new Set(places.map((g) => city(g.place)));
    return { cells, max, byBin, places, byPlace, placeOf, names, origins, flows, mk, mkMax, opp, bounds, countries, total, suspect };
  }, [data]);

  // A new answer: start the replay counts again, and glide to where the scans are the first time.
  useEffect(() => {
    if (!model || !data) return;
    const a = anim.current;
    a.rep = { upTo: -1, n: new Float32Array(model.cells.length), s: new Float32Array(model.cells.length) };
    const flyKey = `${days}|${product}`;
    if (a.flown !== flyKey && model.bounds) { a.flown = flyKey; const b = model.bounds; setTimeout(() => map.current?.flyTo(b, { pad: 70, maxZoom: 40 }), 120); }
    map.current?.redraw();
  }, [model, data, days, product]);

  // Live scans: a ripple the moment one lands, then fresh counts. Sample brands get sample pulses.
  useEffect(() => {
    if (!poll || !model) return;
    let since = new Date().toISOString(), stop = false, refetch: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const res = await api.get<{ now: string; scans: LiveScan[] }>(`/trace/map/live?since=${encodeURIComponent(since)}`);
        if (stop) return;
        since = res.data.now;
        const fresh = res.data.scans.filter((s) => !product || s.productId === product);
        if (!fresh.length) return;
        fresh.forEach((s, i) => setTimeout(() => { liveRipple(anim.current.ripples, s); map.current?.redraw(); }, i * 180));
        setFeed((f) => [...fresh.slice(-4).reverse(), ...f].slice(0, 5));
        clearTimeout(refetch);
        refetch = setTimeout(() => void mutate(), 1200);
      } catch { /* the next tick tries again */ }
    };
    const t = setInterval(() => void tick(), poll);
    let sampleTimer: ReturnType<typeof setTimeout> | undefined;
    if (data?.sample && model.cells.length) {
      const weights = model.cells.map((c) => c.scans), sum = weights.reduce((a, b) => a + b, 0);
      const next = () => {
        sampleTimer = setTimeout(() => {
          if (stop) return;
          let x = Math.random() * sum, i = 0;
          while (x > weights[i] && i < weights.length - 1) { x -= weights[i]; i++; }
          const c = model.cells[i], v = Math.random() < 0.06 ? 'SUSPECT' : Math.random() < 0.8 ? 'FIRST' : 'SEEN';
          const s = { id: `sample-${performance.now()}`, lat: c.lat, lng: c.lng, verdict: v, productId: '', place: c.place, at: new Date().toISOString(), sample: true };
          liveRipple(anim.current.ripples, s);
          map.current?.redraw();
          setFeed((f) => [s, ...f].slice(0, 5));
          next();
        }, 2200 + Math.random() * 3200);
      };
      next();
    }
    return () => { stop = true; clearInterval(t); clearTimeout(refetch); clearTimeout(sampleTimer); };
  }, [poll, model, data?.sample, product, mutate]);

  // ─── Replay ───
  const startReplay = () => {
    if (!data) return;
    const a = anim.current;
    if (!replay || a.ph >= data.bins - 0.01) a.ph = 0;
    a.last = 0; a.ended = false;
    setReplay(true); setPlaying(!reduced());
    if (reduced()) a.ph = data.bins;
    map.current?.redraw();
  };
  const stopReplay = () => { setPlaying(false); setReplay(false); anim.current.ph = 0; if (fill.current) fill.current.style.transform = 'scaleX(0)'; map.current?.redraw(); };

  const control = (id: 'in' | 'out' | 'home' | 'full') => {
    if (id === 'full') setFull((v) => !v);
    else if (id === 'home') map.current?.home();
    else map.current?.zoomBy(id === 'in' ? 1.8 : 1 / 1.8);
  };

  // Esc leaves full screen.
  useEffect(() => {
    if (!full) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [full]);

  // ─── Drawing (every frame) ───
  const draw = (f: Frame) => {
    frameRef.current = f;
    if (!model || !data) return;
    const { ctx, view, t, zoom } = f, a = anim.current, k = view.k;
    const { sx, sy } = f;
    const add = f.dark ? 'lighter' : 'source-over';
    const zf = Math.min(3.2, Math.max(1, Math.pow(zoom, 0.32)));
    const still = reduced();

    // Replay: move the playhead on, firing a ripple for each scan in the bins it passes.
    let counts: { n: ArrayLike<number>; s: ArrayLike<number> } | null = null;
    if (replay) {
      if (playing) {
        const dt = a.last ? Math.min(64, t - a.last) : 16;
        const before = Math.floor(a.ph);
        a.ph = Math.min(data.bins, a.ph + (dt / 1000) * (data.bins / REPLAY_SECONDS));
        for (let b = before + 1; b <= Math.floor(a.ph) && b < data.bins; b++) {
          const evs = model.byBin[b] ?? [];
          for (const i of evs.slice(0, 26)) { const e = data.events[i], c = model.cells[e[0]]; if (c) a.ripples.push({ bx: c.bx, by: c.by, born: t + Math.random() * 400, color: e[2] === 2 ? AMBER : PINK, size: e[2] === 1 ? 1 : 0.7 }); }
        }
        if (a.ph >= data.bins && !a.ended) { a.ended = true; setTimeout(() => setPlaying(false), 0); }
      }
      a.last = t;
      const bin = Math.min(data.bins - 1, Math.floor(a.ph));
      const r = a.rep;
      if (bin < r.upTo) { r.n.fill(0); r.s.fill(0); r.upTo = -1; }
      for (let b = r.upTo + 1; b <= bin; b++) for (const i of model.byBin[b] ?? []) { const e = data.events[i]; r.n[e[0]]++; if (e[2] === 2) r.s[e[0]]++; }
      r.upTo = bin;
      counts = r;
      if (fill.current) fill.current.style.transform = `scaleX(${a.ph / data.bins})`;
      if (range.current && document.activeElement !== range.current) range.current.value = String(a.ph);
      if (when.current) when.current.textContent = new Date(Date.parse(data.start) + bin * data.bucketHours * 3600_000).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: data.bucketHours < 24 ? '2-digit' : undefined, minute: data.bucketHours < 24 ? '2-digit' : undefined });
    }

    // The category market (PRO): tiles of 0.5°, hotter with more scans, your share inside in pink.
    if (layers.market && model.mk.length) {
      for (const c of model.mk) {
        let x0 = sx(c.x0), y0 = sy(c.y0), x1 = sx(c.x1), y1 = sy(c.y1);
        if (x1 < -20 || x0 > f.w + 20 || y1 < -20 || y0 > f.h + 20) continue;
        if (x1 - x0 < 7) { const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; x0 = cx - 3.5; x1 = cx + 3.5; y0 = cy - 3.5; y1 = cy + 3.5; }
        const h = Math.log(Math.max(2, c.total)) / model.mkMax;
        ctx.fillStyle = heat(h, f.dark ? 0.2 + h * 0.45 : 0.16 + h * 0.4);
        const r = Math.min(4, (x1 - x0) * 0.18);
        ctx.beginPath(); ctx.roundRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1, r); ctx.fill();
        const share = c.total ? c.yours / c.total : 0;
        if (share > 0) {
          const s = Math.sqrt(share), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = ((x1 - x0) / 2) * s, hh = ((y1 - y0) / 2) * s;
          ctx.fillStyle = f.dark ? 'rgba(255,159,220,0.75)' : 'rgba(193,58,146,0.7)';
          ctx.beginPath(); ctx.roundRect(cx - hw, cy - hh, hw * 2, hh * 2, r * s); ctx.fill();
        }
        if (model.opp.has(`${c.lat},${c.lng}`)) {
          ctx.save(); ctx.setLineDash([4, 3]); ctx.lineDashOffset = still ? 0 : -t / 60;
          ctx.strokeStyle = f.dark ? '#f4a6ea' : '#93378e'; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.roundRect(x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 6, r + 2); ctx.stroke(); ctx.restore();
        }
      }
    }

    // Flows: from where it's made to the places it sells, a comet running along each.
    if (layers.flows && !replay && model.flows.length) {
      ctx.save();
      ctx.globalCompositeOperation = add;
      for (const fl of model.flows) {
        const cx = sx(fl.c.bx), c = arcPoints([f.near(fl.o.bx, cx), sy(fl.o.by)], [cx, sy(fl.c.by)], 0.22);
        const grad = ctx.createLinearGradient(c[0], c[1], c[4], c[5]);
        grad.addColorStop(0, f.dark ? 'rgba(203,210,230,0.10)' : 'rgba(43,53,104,0.10)');
        grad.addColorStop(1, f.dark ? 'rgba(254,129,209,0.38)' : 'rgba(193,58,146,0.34)');
        ctx.strokeStyle = grad; ctx.lineWidth = 0.8 + fl.w * 1.6;
        ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.quadraticCurveTo(c[2], c[3], c[4], c[5]); ctx.stroke();
        if (!still) {
          const p = ((t / 3800 + fl.phase) % 1);
          for (let j = 0; j < 6; j++) {
            const q = p - j * 0.018; if (q < 0) continue;
            const [px, py] = quad(c, q);
            ctx.globalAlpha = (1 - j / 6) * 0.9;
            ctx.fillStyle = j ? PINK_SOFT : '#fff';
            ctx.beginPath(); ctx.arc(px, py, (2.2 - j * 0.28) * Math.min(1.4, zf), 0, Math.PI * 2); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      }
      ctx.restore();
    }

    // Where it's made.
    for (const o of model.origins) {
      const x = sx(o.bx), y = sy(o.by), s = 5 + Math.min(3, zf);
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = f.dark ? '#cbd2e6' : '#2b3568'; ctx.strokeStyle = f.dark ? '#0a1721' : '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.rect(-s / 2, -s / 2, s, s); ctx.fill(); ctx.stroke(); ctx.restore();
      if (zoom > 3 && o.place) { ctx.font = '600 10px ui-sans-serif, system-ui'; ctx.fillStyle = f.dark ? '#cbd2e6' : '#2b3568'; ctx.textAlign = 'left'; ctx.fillText(`Made in ${city(o.place)}`, x + 9, y + 3); }
    }

    // Your scans: a glow per place, a dot sized by scans, an amber arc for the likely copies. Close
    // in (an 11 km area wider than 14 px) each area also shows as its own square, hotter with more scans.
    const tile = tileOf(k), tiles = tile >= 14;
    if (layers.scans) {
      const sprite = glow(PINK), amber = glow(AMBER);
      if (tiles) {
        model.cells.forEach((c, i) => {
          const n = counts ? counts.n[i] : c.scans;
          if (!n) return;
          const x = sx(c.bx), y = sy(c.by), half = tile * 0.46;
          if (x < -half || x > f.w + half || y < -half || y > f.h + half) return;
          const norm = Math.sqrt(n / model.max);
          ctx.fillStyle = f.dark ? `rgba(254,129,209,${0.14 + norm * 0.5})` : `rgba(193,58,146,${0.1 + norm * 0.42})`;
          ctx.beginPath(); ctx.roundRect(x - half, y - half, half * 2, half * 2, Math.min(10, tile * 0.12)); ctx.fill();
          const sus = counts ? counts.s[i] : c.suspect;
          ctx.strokeStyle = layers.copies && sus ? AMBER : f.dark ? 'rgba(255,159,220,0.45)' : 'rgba(193,58,146,0.35)';
          ctx.lineWidth = layers.copies && sus ? 2 : 1; ctx.stroke();
        });
      }
      // A soft halo per place, kept low (M65: added on top of each other, close places burned into one
      // white blob; now plain blending, smaller and fainter, so the map stays sharp and readable).
      ctx.save();
      model.cells.forEach((c, i) => {
        const n = counts ? counts.n[i] : c.scans;
        if (!n) return;
        const x = sx(c.bx), y = sy(c.by);
        if (x < -80 || x > f.w + 80 || y < -80 || y > f.h + 80) return;
        const norm = Math.sqrt(n / model.max), breathe = still ? 1 : 1 + 0.04 * Math.sin(t / 900 + i * 1.7);
        const g = (tiles ? tile * 0.6 : (7 + norm * 18) * Math.min(zf, 1.6)) * breathe;
        ctx.globalAlpha = (f.dark ? 0.14 + norm * 0.22 : 0.1 + norm * 0.18) * (tiles ? 0.45 : 1);
        ctx.drawImage(sprite, x - g, y - g, g * 2, g * 2);
        const sus = counts ? counts.s[i] : c.suspect;
        if (layers.copies && sus) { ctx.globalAlpha = Math.min(0.8, 0.25 + sus / n); const ag = g * 0.6; ctx.drawImage(amber, x - ag, y - ag, ag * 2, ag * 2); }
      });
      ctx.restore();
      model.cells.forEach((c, i) => {
        const n = counts ? counts.n[i] : c.scans;
        if (!n) return;
        const x = sx(c.bx), y = sy(c.by);
        if (x < -20 || x > f.w + 20 || y < -20 || y > f.h + 20) return;
        const r = dotR(n, zf, tile);
        const on = (selected !== null && model.placeOf.get(i) === selected) || (hover?.kind === 'cell' && hover.i === i);
        ctx.fillStyle = f.dark ? PINK_SOFT : '#c13a92';
        ctx.strokeStyle = f.dark ? 'rgba(10,23,33,0.9)' : '#ffffff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        const sus = counts ? counts.s[i] : c.suspect;
        if (layers.copies && sus) {
          ctx.strokeStyle = AMBER; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(x, y, r + 3, -Math.PI / 2, -Math.PI / 2 + Math.max(0.35, (sus / n) * Math.PI * 2)); ctx.stroke();
        }
        if (on) {
          const pulse = still ? 0 : (Math.sin(t / 260) + 1) / 2;
          ctx.strokeStyle = f.dark ? '#ffffff' : '#2b3568'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(x, y, r + 6 + pulse * 2, 0, Math.PI * 2); ctx.stroke();
        }
      });

      // Place names, busiest first, wherever they fit.
      if (zoom > 1.6) {
        const taken: [number, number, number, number][] = [];
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        // A city's name once, at its busiest area, with the city's total; close in, every area its own.
        const nOf = (i: number) => (counts ? counts.n[i] : model.cells[i].scans);
        const order = (zoom > 14
          ? model.cells.map((_, i) => [i, nOf(i)] as const)
          : model.places.map((g) => [g.best, g.cells.reduce((a, i) => a + nOf(i), 0)] as const)
        ).filter(([, n]) => n > 0).sort((p, q) => q[1] - p[1]).slice(0, 60);
        for (const [i, n] of order) {
          const c = model.cells[i], x = sx(c.bx), y = sy(c.by);
          if (x < 0 || x > f.w || y < 0 || y > f.h) continue;
          const r = dotR(nOf(i), zf, tile);
          const name = city(c.place);
          ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
          const tw = ctx.measureText(name).width;
          ctx.font = '500 10px ui-monospace, SFMono-Regular, monospace';
          const nw = ctx.measureText(fmt(n)).width;
          const box: [number, number, number, number] = [x + r + 4, y - 8, x + r + 10 + tw + nw, y + 8];
          if (box[2] > f.w || taken.some((o) => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1])) continue;
          taken.push(box);
          ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
          ctx.lineWidth = 3; ctx.strokeStyle = f.dark ? 'rgba(10,23,33,0.85)' : 'rgba(255,255,255,0.9)';
          ctx.strokeText(name, box[0], y); ctx.fillStyle = f.dark ? '#eef2fb' : '#171f44'; ctx.fillText(name, box[0], y);
          ctx.font = '500 10px ui-monospace, SFMono-Regular, monospace';
          ctx.strokeText(fmt(n), box[0] + tw + 5, y); ctx.fillStyle = f.dark ? PINK_SOFT : '#a32c7b'; ctx.fillText(fmt(n), box[0] + tw + 5, y);
        }
      }
    }

    // Ripples: replayed and live scans.
    if (a.ripples.length) {
      ctx.save();
      a.ripples = a.ripples.filter((rp) => t - rp.born < 2600);
      for (const rp of a.ripples) {
        const age = (t - rp.born) / 1000;
        if (age < 0) continue;
        const x = sx(rp.bx), y = sy(rp.by);
        for (const lag of [0, 0.35]) {
          const e = Math.min(1, Math.max(0, (age - lag) / 1.6));
          if (e <= 0 || e >= 1) continue;
          ctx.globalAlpha = Math.pow(1 - e, 1.6) * 0.95;
          ctx.strokeStyle = rp.color; ctx.lineWidth = 2 * (1 - e) + 0.6;
          ctx.beginPath(); ctx.arc(x, y, (4 + e * 34 * rp.size) * Math.sqrt(zf), 0, Math.PI * 2); ctx.stroke();
        }
        if (rp.text && age < 2.6) {
          const e = age / 2.6;
          ctx.globalAlpha = e < 0.15 ? e / 0.15 : Math.pow(1 - (e - 0.15) / 0.85, 1.4);
          ctx.font = '600 11px ui-sans-serif, system-ui'; ctx.textAlign = 'center';
          const tw = ctx.measureText(rp.text).width + 14, ty = y - 22 - e * 16;
          ctx.fillStyle = f.dark ? 'rgba(23,31,68,0.88)' : 'rgba(255,255,255,0.95)';
          ctx.beginPath(); ctx.roundRect(x - tw / 2, ty - 10, tw, 20, 10); ctx.fill();
          ctx.strokeStyle = rp.color; ctx.lineWidth = 1; ctx.stroke();
          ctx.fillStyle = f.dark ? '#eef2fb' : '#171f44'; ctx.fillText(rp.text, x, ty + 0.5);
        }
      }
      ctx.restore();
      ctx.textAlign = 'left';
    }
  };

  // ─── Pointer: the place under it ───
  const hit = (p: { x: number; y: number }) => {
    const f = frameRef.current;
    if (!f || !model) return null;
    const zf = Math.min(3.2, Math.max(1, Math.pow(f.zoom, 0.32)));
    let best: { kind: 'cell' | 'market'; i: number; d: number } | null = null;
    if (layers.scans) model.cells.forEach((c, i) => {
      const tile = tileOf(f.view.k), x = f.sx(c.bx), y = f.sy(c.by), r = tile >= 14 ? tile * 0.5 : dotR(c.scans, zf, tile) + 7;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < r && (!best || d < best.d)) best = { kind: 'cell', i, d };
    });
    if (!best && layers.market) model.mk.forEach((c, i) => {
      const x0 = f.sx(c.x0), x1 = x0 + (c.x1 - c.x0) * f.view.k, y0 = f.view.y + c.y0 * f.view.k, y1 = f.view.y + c.y1 * f.view.k;
      const pad = Math.max(0, (7 - (x1 - x0)) / 2);
      if (p.x >= x0 - pad && p.x <= x1 + pad && p.y >= y0 - pad && p.y <= y1 + pad) best = { kind: 'market', i, d: 0 };
    });
    return best as { kind: 'cell' | 'market'; i: number; d: number } | null;
  };
  /** Picks a city and glides to it. */
  const focus = (key: string) => {
    const g = model?.byPlace.get(key);
    if (!g || !model) return;
    setSelected(key);
    const lats = g.cells.map((i) => model.cells[i].lat), lngs = g.cells.map((i) => model.cells[i].lng);
    map.current?.flyTo([Math.min(...lngs) - 0.9, Math.min(...lats) - 0.6, Math.max(...lngs) + 0.9, Math.max(...lats) + 0.6], { maxZoom: 160 });
  };
  const onPoint = (p: { x: number; y: number } | null, kind: 'hover' | 'click') => {
    const h = p ? hit(p) : null;
    if (kind === 'click') {
      const key = h?.kind === 'cell' ? model?.placeOf.get(h.i) : undefined;
      if (key) focus(key); else setSelected(null);
      return;
    }
    if (tip.current && p) { tip.current.style.transform = `translate(${Math.round(p.x + 14)}px, ${Math.round(p.y + 14)}px)`; }
    if ((h?.kind ?? null) !== (hover?.kind ?? null) || h?.i !== hover?.i) setHover(h ? { kind: h.kind, i: h.i } : null);
  };

  const tryDemo = async () => {
    setBusy(true);
    try { await api.post('/trace/demo'); toast.success('Sample product ready: watch the map fill up.'); anim.current.flown = ''; await mutate(); }
    catch (e) { toast.error(errorMessage(e, 'Could not make the sample.')); } finally { setBusy(false); }
  };

  if (error) {
    const noBrand = /brand/i.test(errorMessage(error, ''));
    return (
      <div className="panel p-8 text-center">
        <Globe2 className="w-8 h-8 mx-auto text-pink-500" aria-hidden />
        <p className="mt-3 font-bold text-zinc-900 dark:text-white">{noBrand ? 'Start your brand to see your map.' : 'The map could not load.'}</p>
        <p className="mt-1 text-sm text-zinc-500">{noBrand ? 'It’s free, and you can try it with a sample product first.' : errorMessage(error, 'Try again in a moment.')}</p>
        {noBrand ? <Link href="/trace" className="btn-primary mt-4 inline-flex">Start your brand</Link> : <button type="button" onClick={() => void mutate()} className="btn-secondary mt-4">Try again</button>}
      </div>
    );
  }

  const cell = selected !== null && model ? model.byPlace.get(selected) ?? null : null;
  const hovered = hover && model ? (hover.kind === 'cell' ? model.cells[hover.i] : model.mk[hover.i]) : null;
  const market = data?.market, open = openOf(market);
  const top = model ? model.places.slice(0, 8) : [];
  const topMax = top[0]?.scans ?? 1;
  const maxTime = data ? Math.max(1, ...data.timeline.map((x) => x[0])) : 1;
  const liveCount = feed.length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Period" className="flex rounded-full bg-zinc-100 dark:bg-white/[0.06] p-1">
          {RANGES.map((r) => (
            <button key={r.days} type="button" role="radio" aria-checked={days === r.days} onClick={() => { setDays(r.days); stopReplay(); setSelected(null); }}
              className={cn('relative rounded-full px-3 py-1.5 text-xs font-semibold transition-colors', days === r.days ? 'text-white' : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white')}>
              {days === r.days && <motion.span layoutId="map-range" className="absolute inset-0 rounded-full bg-indigo-600" transition={{ type: 'spring', stiffness: 460, damping: 36 }} />}
              <span className="relative">{r.label}</span>
            </button>
          ))}
        </div>
        {data && data.products.length > 1 && (
          <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
            <span className="sr-only">Product</span>
            <select value={product} onChange={(e) => { setProduct(e.target.value); stopReplay(); setSelected(null); }} className="input !py-1.5 !text-xs !rounded-full max-w-56">
              <option value="">Every product</option>
              {data.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Layers">
          {([['scans', 'Scans'], ['flows', 'Flows'], ['copies', 'Likely copies'], ['market', 'Category market']] as const).map(([id, label]) => {
            const lockedLayer = id === 'market' && market?.locked;
            return (
              <button key={id} type="button" aria-pressed={layers[id]} onClick={() => { if (lockedLayer) { setLocked(true); return; } setLayers((l) => ({ ...l, [id]: !l[id] })); }}
                className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all active:scale-[0.97]',
                  layers[id] ? 'border-pink-500/50 bg-pink-500/10 text-pink-700 dark:text-pink-200' : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20')}>
                <span aria-hidden className={cn('w-2 h-2 rounded-full', id === 'copies' ? 'bg-amber-500' : id === 'market' ? 'bg-fuchsia-500' : id === 'flows' ? 'bg-zinc-400' : 'bg-pink-500', !layers[id] && 'opacity-40')} />
                {label}{lockedLayer && <Lock className="w-3 h-3" aria-label="PRO" />}
              </button>
            );
          })}
        </div>
        <span className="ml-auto inline-flex items-center gap-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300" aria-live="polite">
          <span className="relative flex w-2.5 h-2.5" aria-hidden><span className={cn('absolute inset-0 rounded-full bg-pink-500', poll && 'animate-ping opacity-60')} /><span className="relative w-2.5 h-2.5 rounded-full bg-pink-500" /></span>
          {poll ? 'Live' : 'Paused'}{liveCount ? ` · ${liveCount} just now` : ''}
        </span>
      </div>

      {/* Numbers */}
      <dl className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          ['Scans', model ? fmt(model.total) : '…'], ['Places', model ? fmt(model.places.length) : '…'], ['Countries', model ? String(model.countries) : '…'],
          ['Likely copies', model ? fmt(model.suspect) : '…'], ['Genuine', model ? `${model.total ? Math.round(((model.total - model.suspect) / model.total) * 1000) / 10 : 100}%` : '…'],
        ].map(([k, v], i) => (
          <motion.div key={k} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className={cn('panel px-4 py-3', i === 4 && 'col-span-2 sm:col-span-1')}>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{k}</dt>
            <dd className={cn('mt-0.5 font-mono text-xl tabular-nums text-zinc-900 dark:text-white', k === 'Likely copies' && model?.suspect && 'text-amber-600 dark:text-amber-400')}>{v}</dd>
          </motion.div>
        ))}
      </dl>

      <div className="grid xl:grid-cols-[1fr_320px] gap-4 items-start">
        {/* The map */}
        <div className={cn('panel overflow-hidden p-0', full && 'fixed inset-2 sm:inset-4 z-50 flex flex-col shadow-2xl')}>
          <WorldCanvas
            ref={map}
            label={`Map of where ${data?.brand.name ?? 'your brand'}’s products are scanned`}
            homeBox={model?.bounds ?? WORLD}
            dark={dark}
            live={!!model && !calm}
            draw={draw}
            onPoint={onPoint}
            skipCities={model?.names}
            className={cn('w-full rounded-t-[inherit]', full ? 'flex-1' : 'h-[58vh] min-h-[380px] max-h-[680px]')}
          >
            {!data && <div className="absolute inset-0 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-pink-500" aria-label="Loading the map" /></div>}
            {data?.sample && <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 dark:bg-[#171f44]/85 backdrop-blur px-3 py-1 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 shadow-sm"><Sparkles className="w-3 h-3 text-pink-500" aria-hidden />Sample data</span>}
            {/* Controls */}
            <div className="absolute right-3 top-3 flex flex-col gap-1.5">
              {([['in', Plus, 'Zoom in'], ['out', Minus, 'Zoom out'], ['home', Globe2, 'See everything'], ['full', full ? Minimize2 : Maximize2, full ? 'Leave full screen' : 'Full screen']] as const).map(([id, Icon, label]) => (
                <button key={id} type="button" onClick={() => control(id)} aria-label={label} title={label} className="w-9 h-9 grid place-items-center rounded-xl bg-white/90 dark:bg-[#171f44]/85 backdrop-blur text-zinc-700 dark:text-zinc-200 shadow-sm border border-zinc-200/70 dark:border-white/10 hover:text-pink-600 dark:hover:text-pink-300 active:scale-95 transition">
                  <Icon className="w-4 h-4" aria-hidden />
                </button>
              ))}
            </div>
            {/* Live feed */}
            <ul className="absolute right-3 bottom-3 w-60 space-y-1.5 pointer-events-none" aria-label="Latest scans">
              <AnimatePresence initial={false}>
                {feed.slice(0, 3).map((s) => (
                  <motion.li key={s.id} layout initial={{ opacity: 0, x: 24, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    className="flex items-center gap-2 rounded-xl bg-white/92 dark:bg-[#171f44]/88 backdrop-blur px-3 py-2 text-xs shadow-sm border border-zinc-200/70 dark:border-white/10">
                    <Radio className={cn('w-3.5 h-3.5 shrink-0', s.verdict === 'SUSPECT' ? 'text-amber-500' : 'text-pink-500')} aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-semibold text-zinc-800 dark:text-zinc-100">{city(s.place)}</span>
                    <span className="shrink-0 text-zinc-500">{s.sample ? 'sample · ' : ''}{s.verdict === 'SUSPECT' ? 'likely copy' : 'genuine'}</span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
            {/* Legend */}
            <div className="absolute left-3 bottom-3 hidden sm:flex flex-col gap-1 rounded-xl bg-white/90 dark:bg-[#171f44]/85 backdrop-blur px-3 py-2 text-[11px] text-zinc-600 dark:text-zinc-300 shadow-sm border border-zinc-200/70 dark:border-white/10">
              <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-pink-500 shadow-[0_0_8px_#fe81d1]" />Scans (bigger = more)</span>
              <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full border-2 border-amber-500" />Likely copies</span>
              {model?.origins.length ? <span className="flex items-center gap-2"><span className="w-2 h-2 rotate-45 bg-zinc-700 dark:bg-zinc-300" />Where it’s made</span> : null}
              {layers.market && !market?.locked && <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm bg-gradient-to-r from-purple-600 to-fuchsia-500" />Category market · <span className="w-2 h-2 rounded-sm bg-pink-600" />yours</span>}
            </div>
            {/* Tooltip */}
            <div ref={tip} className="absolute left-0 top-0 pointer-events-none will-change-transform" aria-hidden>
              <AnimatePresence>
                {hovered && (
                  <motion.div key={`${hover?.kind}-${hover?.i}`} initial={{ opacity: 0, scale: 0.94, y: 4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                    className="min-w-44 max-w-64 rounded-xl bg-white dark:bg-[#171f44] px-3 py-2.5 text-xs shadow-xl border border-zinc-200 dark:border-white/10">
                    {'scans' in hovered ? (
                      <>
                        <p className="font-bold text-zinc-900 dark:text-white">{flag(ccOf(hovered.place, hovered.country))} {hovered.place ?? 'Unknown place'}</p>
                        <p className="mt-1 font-mono text-zinc-600 dark:text-zinc-300">{hovered.scans.toLocaleString()} scans · {Math.round(((hovered.scans - hovered.suspect) / hovered.scans) * 100)}% genuine</p>
                        {hovered.suspect > 0 && <p className="font-mono text-amber-600 dark:text-amber-400">{hovered.suspect} likely {hovered.suspect === 1 ? 'copy' : 'copies'}</p>}
                        <p className="mt-1 text-zinc-500">last {formatDistanceToNow(new Date(hovered.last), { addSuffix: true })}</p>
                      </>
                    ) : (
                      <>
                        <p className="font-bold text-zinc-900 dark:text-white">{hovered.place ?? 'Area'} · {market && !market.locked ? market.category : ''} market</p>
                        <p className="mt-1 font-mono text-zinc-600 dark:text-zinc-300">{hovered.total.toLocaleString()} scans across brands</p>
                        <p className="font-mono text-pink-600 dark:text-pink-300">yours: {hovered.total ? Math.round((hovered.yours / hovered.total) * 100) : 0}%</p>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {/* Empty */}
            {data && !model?.cells.length && (
              <div className="absolute inset-0 grid place-items-center p-6 pointer-events-none">
                <div className="pointer-events-auto max-w-sm text-center rounded-2xl bg-white/92 dark:bg-[#171f44]/90 backdrop-blur p-6 shadow-xl border border-zinc-200/70 dark:border-white/10">
                  <p className="font-bold text-zinc-900 dark:text-white">No scans in this period yet.</p>
                  <p className="mt-1 text-sm text-zinc-500">Each scan of one of your codes lights up its city here, live.</p>
                  {!data.sample && <button type="button" onClick={() => void tryDemo()} disabled={busy} className="btn-primary mt-4">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}Try it with a sample product</button>}
                </div>
              </div>
            )}
            {/* PRO teaser */}
            <AnimatePresence>
              {locked && market?.locked && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 grid place-items-center p-4 bg-[#171f44]/40 backdrop-blur-[2px]">
                  <motion.div initial={{ y: 16, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 8, scale: 0.98 }} transition={{ type: 'spring', stiffness: 360, damping: 30 }} className="relative max-w-md rounded-3xl trace-hero text-white p-7 shadow-2xl">
                    <button type="button" onClick={() => setLocked(false)} aria-label="Close" className="absolute right-3 top-3 w-8 h-8 grid place-items-center rounded-full hover:bg-white/10"><X className="w-4 h-4" /></button>
                    <span className="passport-pill">PRO</span>
                    <h3 className="mt-3 text-2xl font-black tracking-tight">See your whole category, city by city.</h3>
                    <p className="mt-2 text-sm text-zinc-300">Every scan of every brand in {market.category ?? 'your category'}, anonymised and live, with your share in each place and the cities where you’re missing.</p>
                    <Link href="/trace#plan" className="btn-primary mt-5 inline-flex">See PRO</Link>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </WorldCanvas>

          {/* Timeline */}
          {data && (
            <div className="border-t border-zinc-100 dark:border-white/[0.06] px-3 sm:px-4 py-3 flex items-center gap-3">
              <button type="button" onClick={() => (playing ? setPlaying(false) : startReplay())} aria-label={playing ? 'Pause the replay' : 'Replay the period'} className="w-10 h-10 shrink-0 grid place-items-center rounded-full bg-indigo-600 text-white shadow-[0_6px_20px_-6px_rgba(254,129,209,0.7)] active:scale-95 transition">
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 translate-x-[1px]" />}
              </button>
              <div className="relative flex-1 h-12">
                <svg viewBox={`0 0 ${data.bins} 100`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden>
                  {data.timeline.map(([n, s], i) => (
                    <g key={i}>
                      <rect x={i + 0.12} width={0.76} y={100 - (n / maxTime) * 92} height={(n / maxTime) * 92} rx={0.3} className="fill-zinc-300 dark:fill-white/15" />
                      {s > 0 && <rect x={i + 0.12} width={0.76} y={100 - (s / maxTime) * 92} height={(s / maxTime) * 92} className="fill-amber-500" />}
                    </g>
                  ))}
                </svg>
                <div ref={fill} className="absolute inset-0 origin-left pointer-events-none" style={{ transform: 'scaleX(0)' }} aria-hidden>
                  <div className="absolute inset-0 bg-gradient-to-r from-pink-500/10 to-pink-500/25 border-r-2 border-pink-500 rounded-sm" />
                </div>
                <input ref={range} type="range" min={0} max={data.bins} step={0.01} defaultValue={0} aria-label="Move through the period"
                  onChange={(e) => { const a = anim.current; a.ph = Number(e.target.value); setPlaying(false); if (!replay) setReplay(true); map.current?.redraw(); }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize" />
              </div>
              <div className="shrink-0 w-28 text-right">
                <span ref={when} className={cn('block font-mono text-xs tabular-nums text-zinc-900 dark:text-white', !replay && 'hidden')} />
                {replay ? <button type="button" onClick={stopReplay} className="text-[11px] font-semibold text-pink-600 dark:text-pink-300 hover:underline">Show all</button>
                  : <span className="block text-[11px] text-zinc-500">{RANGES.find((r) => r.days === days)?.label} · press play</span>}
              </div>
            </div>
          )}
        </div>

        {/* Side panels */}
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {cell && (
              <motion.section key={cell.key} layout initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.16 } }} transition={{ type: 'spring', stiffness: 360, damping: 32 }}
                className="panel p-5 relative overflow-hidden" aria-label={`About ${cell.place ?? 'this place'}`}>
                <span aria-hidden className="absolute -right-10 -top-10 w-36 h-36 rounded-full bg-pink-500/15 blur-2xl" />
                <button type="button" onClick={() => setSelected(null)} aria-label="Close" className="absolute right-3 top-3 w-8 h-8 grid place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
                <p className="text-2xl" aria-hidden>{flag(ccOf(cell.place, cell.country))}</p>
                <h3 className="mt-1 font-bold text-zinc-900 dark:text-white pr-8">{cell.place ?? 'Unknown place'}</h3>
                <p className="font-mono text-[11px] text-zinc-500">{cell.cells.length} {cell.cells.length === 1 ? 'area' : 'areas'} of about 11 km · {model!.cells[cell.best].lat.toFixed(1)}°, {model!.cells[cell.best].lng.toFixed(1)}°</p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {[['Scans', cell.scans], ['First checks', cell.first], ['Copies', cell.suspect]].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-zinc-50 dark:bg-white/[0.04] py-2.5"><p className={cn('font-mono text-lg tabular-nums text-zinc-900 dark:text-white', k === 'Copies' && Number(v) > 0 && 'text-amber-600 dark:text-amber-400')}>{fmt(Number(v))}</p><p className="text-[10px] uppercase tracking-wider text-zinc-500">{k}</p></div>
                  ))}
                </div>
                <div className="mt-4">
                  <div className="flex h-2 rounded-full overflow-hidden bg-zinc-100 dark:bg-white/[0.06]">
                    <motion.span initial={{ width: 0 }} animate={{ width: `${(cell.first / cell.scans) * 100}%` }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="bg-pink-500" />
                    <motion.span initial={{ width: 0 }} animate={{ width: `${((cell.scans - cell.first - cell.suspect) / cell.scans) * 100}%` }} transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 1, 0.36, 1] }} className="bg-pink-300 dark:bg-pink-400/50" />
                    <motion.span initial={{ width: 0 }} animate={{ width: `${(cell.suspect / cell.scans) * 100}%` }} transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }} className="bg-amber-500" />
                  </div>
                  <p className="mt-1.5 text-[11px] text-zinc-500">first checks · checked again · likely copies</p>
                </div>
                {data && Object.keys(cell.products).length > 1 && (
                  <ul className="mt-4 space-y-1.5">
                    {Object.entries(cell.products).sort((a, b) => b[1] - a[1]).map(([id, n]) => (
                      <li key={id} className="text-xs"><div className="flex justify-between gap-2"><span className="truncate text-zinc-700 dark:text-zinc-200">{data.products.find((p) => p.id === id)?.name ?? 'Product'}</span><span className="font-mono text-zinc-500">{n}</span></div>
                        <div className="mt-1 h-1 rounded-full bg-zinc-100 dark:bg-white/[0.06]"><div className="h-full rounded-full bg-pink-500" style={{ width: `${(n / cell.scans) * 100}%` }} /></div></li>
                    ))}
                  </ul>
                )}
                <p className="mt-4 text-xs text-zinc-500">Last scan {formatDistanceToNow(new Date(cell.last), { addSuffix: true })}</p>
                <Link href={`/trace/campaigns?place=${encodeURIComponent(city(cell.place))}&lat=${model!.cells[cell.best].lat}&lng=${model!.cells[cell.best].lng}`} className="btn-primary btn-sm mt-3 w-full justify-center"><Megaphone className="w-3.5 h-3.5" />Start a campaign here</Link>
              </motion.section>
            )}
          </AnimatePresence>

          <section className="panel p-5" aria-labelledby="top-h">
            <h3 id="top-h" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Target className="w-4 h-4 text-pink-500" aria-hidden />Top places</h3>
            {!model ? <div className="mt-3 h-40 skeleton rounded-xl" /> : top.length === 0 ? <p className="mt-2 text-sm text-zinc-500">No scans yet.</p> : (
              <ol className="mt-3 space-y-1">
                {top.map((g, n) => (
                  <li key={g.key}>
                    <button type="button" onClick={() => focus(g.key)}
                      className={cn('group w-full rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.04]', selected === g.key && 'bg-pink-500/[0.07]')}>
                      <span className="flex items-center gap-2 text-sm">
                        <span className="w-4 font-mono text-[11px] text-zinc-400">{n + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-zinc-800 dark:text-zinc-100">{flag(ccOf(g.place, g.country))} {city(g.place)}</span>
                        {g.suspect > 0 && <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400" title="Likely copies">{g.suspect} copies</span>}
                        <span className="font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-300">{fmt(g.scans)}</span>
                      </span>
                      <span className="mt-1 ml-6 block h-1 rounded-full bg-zinc-100 dark:bg-white/[0.06] overflow-hidden">
                        <motion.span className="block h-full rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-500" initial={{ width: 0 }} animate={{ width: `${(g.scans / topMax) * 100}%` }} transition={{ duration: 0.7, delay: n * 0.03, ease: [0.22, 1, 0.36, 1] }} />
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {open && open.opportunities.length > 0 && (
            <section className="panel p-5" aria-labelledby="opp-h">
              <h3 id="opp-h" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Sparkles className="w-4 h-4 text-fuchsia-500" aria-hidden />Where you’re missing</h3>
              <p className="mt-1 text-xs text-zinc-500">Busy places in {open.category} where your share is smallest{open.sample ? ' (sample market)' : ''}.</p>
              <ul className="mt-3 space-y-1">
                {open.opportunities.map((o) => (
                  <li key={`${o.lat},${o.lng}`}>
                    <button type="button" onClick={() => { setLayers((l) => ({ ...l, market: true })); map.current?.flyTo([o.lng - 1.5, o.lat - 1, o.lng + 1.5, o.lat + 1], { maxZoom: 40 }); }} className="w-full flex items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-white/[0.04]">
                      <span className="min-w-0 flex-1 truncate text-zinc-800 dark:text-zinc-100">{city(o.place)}</span>
                      <span className="font-mono text-[11px] text-zinc-500">{fmt(o.total)} scans</span>
                      <span className={cn('font-mono text-xs tabular-nums', o.share < 0.1 ? 'text-fuchsia-600 dark:text-fuchsia-300' : 'text-zinc-600 dark:text-zinc-300')}>{Math.round(o.share * 100)}%</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {market?.locked && (
            <section className="panel p-5 relative overflow-hidden">
              <span aria-hidden className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full bg-fuchsia-500/15 blur-2xl" />
              <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Lock className="w-4 h-4 text-fuchsia-500" aria-hidden />Category market</h3>
              <p className="mt-1 text-sm text-zinc-500">On PRO, the map also shows every brand’s scans in {market.category ?? 'your category'} (anonymised, live), your share in each city and where you’re missing.</p>
              <button type="button" onClick={() => setLocked(true)} className="btn-secondary btn-sm mt-3">What it shows</button>
            </section>
          )}

          {model && model.origins.length > 0 && (
            <section className="panel p-5">
              <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Factory className="w-4 h-4 text-zinc-500" aria-hidden />Made in</h3>
              <ul className="mt-2 space-y-1 text-sm">{model.origins.map((o) => <li key={`${o.lat},${o.lng}`} className="text-zinc-700 dark:text-zinc-200">{o.place ?? `${o.lat}, ${o.lng}`}</li>)}</ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
