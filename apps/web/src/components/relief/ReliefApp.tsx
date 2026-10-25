'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Car, Check, Crosshair, Droplets, Globe2, HandHeart, Home, Loader2, LocateFixed, MapPin, MessageSquare, Minus, Package, Plus, Shirt, Stethoscope, Undo2, Users, Utensils, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { authedJson } from '@/lib/authed-fetch';
import { inboxFor } from '@/lib/apps';
import { fetcher } from '@/lib/fetcher';
import { distanceM } from '@/lib/attendance-rules';
import { RELIEF_KINDS, RELIEF_KIND_LABEL, URGENCIES, URGENCY_COLOR, URGENCY_LABEL, needScore, type ReliefKind, type Urgency } from '@/lib/relief';
import { useDarkMode } from '@/lib/use-dark';
import { useNow } from '@/lib/use-now';
import { useAuthStore } from '@/store/auth';
import { InviteButton } from '@/components/apps/InviteButton';
import { cn } from '@/lib/utils';
import { fromBase, glow, toBase } from '@/components/trace/map/engine';
import { WorldCanvas, type Box, type Frame, type MapHandle } from '@/components/trace/map/WorldCanvas';

// UniVerse Relief (src/lib/apps.ts): every open need and offer of help on one live map (the same map
// engine as Trace), the most urgent and nearest needs first, "I can help", messages, and delivered.
// Server: src/server/relief.ts.

export interface ReliefPost {
  id: string; type: 'NEED' | 'OFFER'; kind: ReliefKind; title: string; details: string | null; people: number; urgency: Urgency;
  lat: number; lng: number; place: string | null; status: string; createdAt: string; takenAt: string | null; doneAt: string | null;
  by: { id: string; name: string } | null; helper: { id: string; name: string } | null; mine: boolean; helping: boolean;
}
interface ReliefMap {
  posts: ReliefPost[]; recent: ReliefPost[]; done: { lat: number; lng: number; people: number; kind: string }[];
  stats: { openNeeds: number; inProgress: number; offers: number; peopleWaiting: number; helped: number; avgMinutes: number | null; helpers: number };
}

export const KIND_ICON: Record<ReliefKind, typeof Utensils> = { FOOD: Utensils, WATER: Droplets, SHELTER: Home, MEDICAL: Stethoscope, TRANSPORT: Car, CLOTHES: Shirt, OTHER: Package };
const OFFER = '#14b8a6', DONE = '#22c55e';
const WORLD: Box = [-168, -56, 190, 76];

/** The actions a person can take on a post. */
export function PostActions({ p, onChange, small }: { p: ReliefPost; onChange: () => void; small?: boolean }) {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (action: string, msg: string) => {
    setBusy(action);
    try { await api.post(`/relief/posts/${p.id}/${action}`); toast.success(msg); onChange(); }
    catch (e) { toast.error(errorMessage(e, 'Could not do that.')); } finally { setBusy(null); }
  };
  const message = async () => {
    if (!p.by) return;
    try {
      const { id } = await authedJson<{ id: string }>('/api/chat/conversations', { method: 'POST', body: JSON.stringify({ userId: p.by.id }) });
      router.push(`${inboxFor(role)}?c=${encodeURIComponent(id)}`);
    } catch (e) { toast.error((e as Error).message || 'Couldn’t start the chat.'); }
  };
  const btn = cn(small ? 'btn-sm' : '', 'inline-flex');
  const done = p.status === 'DONE' || p.status === 'CLOSED';
  return (
    <div className="flex flex-wrap gap-2">
      {!done && p.type === 'NEED' && !p.mine && p.status === 'OPEN' && <button type="button" disabled={!!busy} onClick={() => void act('take', 'Thank you! They can see you’re on the way.')} className={cn('btn-primary', btn)}>{busy === 'take' ? <Loader2 className="w-4 h-4 animate-spin" /> : <HandHeart className="w-4 h-4" />}I can help</button>}
      {!p.mine && p.by && <button type="button" onClick={() => void message()} className={cn('btn-secondary', btn)}><MessageSquare className="w-4 h-4" />Message</button>}
      {!done && (p.mine || p.helping) && p.status === 'TAKEN' && <button type="button" disabled={!!busy} onClick={() => void act('done', 'Marked as delivered.')} className={cn('btn-primary', btn)}><Check className="w-4 h-4" />Delivered</button>}
      {!done && p.helping && p.status === 'TAKEN' && <button type="button" disabled={!!busy} onClick={() => void act('release', 'Given back: someone else can take it.')} className={cn('btn-secondary', btn)}><Undo2 className="w-4 h-4" />I can’t after all</button>}
      {!done && p.mine && <button type="button" disabled={!!busy} onClick={() => void act('close', 'Closed.')} className={cn('btn-secondary', btn)}><X className="w-4 h-4" />Close</button>}
    </div>
  );
}

export function ReliefApp() {
  const dark = useDarkMode();
  const calm = useReducedMotion();
  const now = useNow();
  const { data, mutate } = useSWR<ReliefMap>('/relief/map', fetcher, { refreshInterval: 20_000, keepPreviousData: true });
  const [type, setType] = useState<'ALL' | 'NEED' | 'OFFER'>('ALL');
  const [kinds, setKinds] = useState<Set<ReliefKind>>(new Set());
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  // An alert's link (/relief?post=<id>) opens with that post chosen.
  const [selected, setSelected] = useState<string | null>(() => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('post')));
  const [posting, setPosting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);
  const map = useRef<MapHandle>(null);
  const frameRef = useRef<Frame | null>(null);

  const posts = useMemo(() => (data?.posts ?? []).filter((p) => (type === 'ALL' || p.type === type) && (!kinds.size || kinds.has(p.kind))), [data, type, kinds]);
  const ordered = useMemo(() => [...posts].sort((a, b) => (a.type === b.type ? needScore(b, here, now || 0) - needScore(a, here, now || 0) : a.type === 'NEED' ? -1 : 1)), [posts, here, now]);
  const sel = posts.find((p) => p.id === selected) ?? null;
  const model = useMemo(() => ({
    posts: posts.map((p) => { const [bx, by] = toBase(p.lng, p.lat); return { p, bx, by }; }),
    done: (data?.done ?? []).map((d) => { const [bx, by] = toBase(d.lng, d.lat); return { ...d, bx, by }; }),
  }), [posts, data]);

  const locate = () => {
    if (!('geolocation' in navigator)) { toast.error('This browser can’t share its position.'); return; }
    navigator.geolocation.getCurrentPosition((g) => {
      const h = { lat: g.coords.latitude, lng: g.coords.longitude };
      setHere(h);
      map.current?.flyTo([h.lng - 0.4, h.lat - 0.25, h.lng + 0.4, h.lat + 0.25], { maxZoom: 120 });
    }, () => toast.error('Your position isn’t shared. You can still tap the map.'), { timeout: 8000, maximumAge: 300_000 });
  };
  const focus = (p: ReliefPost) => { setSelected(p.id); map.current?.flyTo([p.lng - 0.08, p.lat - 0.05, p.lng + 0.08, p.lat + 0.05], { maxZoom: 150 }); };

  const draw = (f: Frame) => {
    frameRef.current = f;
    const { ctx, view, t } = f, k = view.k;
    const sx = (b: number) => view.x + b * k, sy = (b: number) => view.y + b * k;
    const zf = Math.min(2.2, Math.max(1, Math.pow(f.zoom, 0.3)));
    // Delivered in the last 30 days: soft green.
    ctx.save(); ctx.globalCompositeOperation = f.dark ? 'lighter' : 'source-over';
    const g = glow(DONE);
    for (const d of model.done) { const x = sx(d.bx), y = sy(d.by); if (x < -20 || x > f.w + 20 || y < -20 || y > f.h + 20) continue; ctx.globalAlpha = 0.22; const r = 8 * zf; ctx.drawImage(g, x - r, y - r, r * 2, r * 2); }
    ctx.restore();
    for (const { p, bx, by } of model.posts) {
      const x = sx(bx), y = sy(by);
      if (x < -30 || x > f.w + 30 || y < -30 || y > f.h + 30) continue;
      const color = p.type === 'OFFER' ? OFFER : URGENCY_COLOR[p.urgency];
      const r = (p.type === 'OFFER' ? 5 : 4 + Math.min(6, Math.sqrt(p.people) * 1.4)) * Math.sqrt(zf);
      if (p.type === 'NEED' && p.status === 'OPEN' && !calm && (p.urgency === 'CRITICAL' || p.urgency === 'HIGH')) {
        const ph = ((t / (p.urgency === 'CRITICAL' ? 1100 : 1800)) + (bx % 1)) % 1;
        ctx.globalAlpha = (1 - ph) * 0.7; ctx.strokeStyle = color; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(x, y, r + ph * 22, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.fillStyle = color; ctx.strokeStyle = f.dark ? '#0a1721' : '#fff'; ctx.lineWidth = 2;
      if (p.type === 'OFFER') { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-r, -r, r * 2, r * 2); ctx.strokeRect(-r, -r, r * 2, r * 2); ctx.restore(); }
      else { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      if (p.status === 'TAKEN') { ctx.strokeStyle = DONE; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r + 3.5, 0, Math.PI * 2); ctx.stroke(); }
      if (p.id === selected) { ctx.strokeStyle = f.dark ? '#fff' : '#06141b'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r + 7 + (calm ? 0 : Math.sin(t / 260) * 1.5), 0, Math.PI * 2); ctx.stroke(); }
      if (f.zoom > 30 || p.id === selected) {
        ctx.font = '600 11px ui-sans-serif, system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3; ctx.strokeStyle = f.dark ? 'rgba(10,23,33,0.9)' : 'rgba(255,255,255,0.95)'; ctx.strokeText(p.title, x + r + 6, y);
        ctx.fillStyle = f.dark ? '#f2f4f4' : '#06141b'; ctx.fillText(p.title, x + r + 6, y);
      }
    }
    if (here) { const [hx, hy] = toBase(here.lng, here.lat); const x = sx(hx), y = sy(hy); ctx.fillStyle = '#3b82f6'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    if (picked) { const [px, py] = toBase(picked.lng, picked.lat); const x = sx(px), y = sy(py); ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y - 16, 8, Math.PI * 0.75, Math.PI * 0.25); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - 16, 3, 0, Math.PI * 2); ctx.fill(); }
  };

  const onPoint = (pt: { x: number; y: number } | null, kind: 'hover' | 'click') => {
    const f = frameRef.current;
    if (!f || !pt || kind !== 'click') return;
    if (picking) {
      const [lng, lat] = fromBase((pt.x - f.view.x) / f.view.k, (pt.y - f.view.y) / f.view.k);
      setPicked({ lat, lng }); setPicking(false); setPosting(true);
      return;
    }
    let best: { id: string; d: number } | null = null;
    for (const { p, bx, by } of model.posts) {
      const d = Math.hypot(pt.x - (f.view.x + bx * f.view.k), pt.y - (f.view.y + by * f.view.k));
      if (d < 16 && (!best || d < best.d)) best = { id: p.id, d };
    }
    setSelected(best ? (best as { id: string }).id : null);
  };

  const s = data?.stats;
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          // Darker shades on the light page so the numbers keep 4.5:1.
          ['Open needs', s?.openNeeds, 'text-orange-700 dark:text-orange-400'], ['People waiting', s?.peopleWaiting, 'text-red-700 dark:text-red-400'], ['Being helped', s?.inProgress, 'text-green-700 dark:text-green-400'],
          ['Offers', s?.offers, 'text-teal-700 dark:text-teal-300'], ['Helped · 30 days', s?.helped, 'text-green-700 dark:text-green-400'], ['Average response', s ? (s.avgMinutes === null ? '–' : s.avgMinutes < 120 ? `${s.avgMinutes} min` : `${Math.round(s.avgMinutes / 60)} h`) : undefined, 'text-sky-700 dark:text-sky-400'],
        ].map(([k, v, c], i) => (
          <motion.div key={k as string} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="panel px-4 py-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{k as string}</dt>
            <dd className={cn('mt-0.5 font-mono text-xl tabular-nums', c as string)}>{v ?? '…'}</dd>
          </motion.div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Show" className="flex rounded-full bg-zinc-100 dark:bg-white/[0.06] p-1">
          {([['ALL', 'Everything'], ['NEED', 'Needs'], ['OFFER', 'Offers']] as const).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={type === id} onClick={() => setType(id)} className={cn('relative rounded-full px-3 py-1.5 text-xs font-semibold transition-colors', type === id ? 'text-white' : 'text-zinc-600 dark:text-zinc-300')}>
              {type === id && <motion.span layoutId="relief-type" className="absolute inset-0 rounded-full bg-orange-700" transition={{ type: 'spring', stiffness: 460, damping: 36 }} />}
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kinds of help">
          {RELIEF_KINDS.map((k) => { const I = KIND_ICON[k], on = kinds.has(k); return (
            <button key={k} type="button" aria-pressed={on} onClick={() => setKinds((v) => { const n = new Set(v); if (n.has(k)) n.delete(k); else n.add(k); return n; })}
              className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition-colors', on ? 'border-orange-500/50 bg-orange-500/10 text-orange-700 dark:text-orange-200' : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300')}>
              <I className="w-3.5 h-3.5" aria-hidden />{RELIEF_KIND_LABEL[k]}
            </button>
          ); })}
        </div>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={locate} className="btn-secondary btn-sm"><LocateFixed className="w-4 h-4" />Near me</button>
          <button type="button" onClick={() => { setPicked(here); setPosting(true); }} className="btn-primary btn-sm"><Plus className="w-4 h-4" />Ask or offer help</button>
        </div>
      </div>

      <div className="grid xl:grid-cols-[1fr_380px] gap-4 items-start">
        <div className="panel overflow-hidden p-0">
          <WorldCanvas ref={map} label="Map of needs and offers of help" homeBox={WORLD} dark={dark} live={!calm} draw={draw} onPoint={onPoint} className="w-full h-[62vh] min-h-[380px] max-h-[720px]">
            {!data && <div className="absolute inset-0 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-orange-500" aria-label="Loading" /></div>}
            <div className="absolute right-3 top-3 flex flex-col gap-1.5">
              {([['in', Plus, 'Zoom in'], ['out', Minus, 'Zoom out'], ['home', Globe2, 'See everything']] as const).map(([id, Icon, label]) => (
                <button key={id} type="button" aria-label={label} title={label} onClick={() => (id === 'home' ? map.current?.home() : map.current?.zoomBy(id === 'in' ? 1.8 : 1 / 1.8))} className="w-9 h-9 grid place-items-center rounded-xl bg-white/90 dark:bg-[#06141b]/85 backdrop-blur text-zinc-700 dark:text-zinc-200 shadow-sm border border-zinc-200/70 dark:border-white/10 active:scale-95 transition"><Icon className="w-4 h-4" aria-hidden /></button>
              ))}
            </div>
            <div className="absolute left-3 top-3 hidden sm:flex flex-col gap-1 rounded-xl bg-white/90 dark:bg-[#06141b]/85 backdrop-blur px-3 py-2 text-[11px] text-zinc-600 dark:text-zinc-300 shadow-sm border border-zinc-200/70 dark:border-white/10">
              {URGENCIES.slice().reverse().map((u) => <span key={u} className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: URGENCY_COLOR[u] }} />{URGENCY_LABEL[u]} need</span>)}
              <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rotate-45" style={{ background: OFFER }} />Offer</span>
              <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: DONE }} />Someone’s helping</span>
            </div>
            <AnimatePresence>
              {picking && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="absolute left-1/2 -translate-x-1/2 top-3 flex items-center gap-2 rounded-full bg-orange-500 text-white px-4 py-2 text-xs font-semibold shadow-lg">
                  <Crosshair className="w-3.5 h-3.5" aria-hidden />Tap where it is (shown about 500 m away)
                  <button type="button" onClick={() => { setPicking(false); setPosting(true); }} aria-label="Cancel" className="ml-1 w-5 h-5 grid place-items-center rounded-full hover:bg-white/15"><X className="w-3 h-3" /></button>
                </motion.div>
              )}
              {sel && !picking && (
                <motion.div key={sel.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  className="absolute left-3 right-3 bottom-3 sm:right-auto sm:w-[440px] rounded-2xl bg-white/95 dark:bg-[#06141b]/92 backdrop-blur p-4 shadow-xl border border-zinc-200/70 dark:border-white/10">
                  <PostCard p={sel} now={now} here={here} onChange={() => void mutate()} />
                </motion.div>
              )}
            </AnimatePresence>
          </WorldCanvas>
        </div>

        <section aria-label="Needs and offers" className="space-y-2 xl:max-h-[calc(62vh+4px)] xl:overflow-y-auto xl:pr-1">
          {!data && Array.from({ length: 4 }, (_, i) => <div key={i} className="panel h-24 skeleton" />)}
          {data && ordered.length === 0 && <div className="panel p-6 text-center text-sm text-zinc-500"><HandHeart className="w-6 h-6 mx-auto text-orange-400" aria-hidden /><p className="mt-2">Nothing here right now. Be the first: ask for help or offer it, and it shows on the map at once. Helpers nearby make the map useful, so invite your neighbours.</p><InviteButton app="relief" text="I’m on UniVerse Relief: neighbours asking for and offering help on one map. Join so we can help each other:" label="Invite neighbours" className="mt-4 flex-wrap justify-center" /></div>}
          {ordered.slice(0, 60).map((p, i) => {
            const I = KIND_ICON[p.kind];
            return (
              <motion.button key={p.id} type="button" layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.025 }} onClick={() => focus(p)}
                className={cn('panel w-full p-3.5 text-left flex gap-3 items-start transition-shadow', selected === p.id && 'ring-2 ring-orange-500/50')}>
                <span className="w-10 h-10 shrink-0 rounded-2xl grid place-items-center text-white" style={{ background: p.type === 'OFFER' ? OFFER : URGENCY_COLOR[p.urgency] }}><I className="w-5 h-5" aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-sm text-zinc-900 dark:text-white truncate">{p.title}</span>
                  <span className="block text-[11px] text-zinc-500 truncate">{p.type === 'OFFER' ? 'Offer' : `${URGENCY_LABEL[p.urgency]} · ${p.people} ${p.people === 1 ? 'person' : 'people'}`} · {p.place ?? 'nearby'}{here ? ` · ${(distanceM(here, p) / 1000).toFixed(1)} km` : ''}</span>
                  <span className="block text-[11px] text-zinc-400">{formatDistanceToNow(new Date(p.createdAt), { addSuffix: true })}{p.status === 'TAKEN' ? ` · ${p.helper?.name ?? 'someone'} is helping` : ''}</span>
                </span>
              </motion.button>
            );
          })}
        </section>
      </div>

      <AnimatePresence>
        {posting && <PostForm at={picked} onPick={() => { setPosting(false); setPicking(true); }} onClose={() => { setPosting(false); setPicked(null); }} onDone={(p) => { setPosting(false); setPicked(null); void mutate(); if (p) setTimeout(() => focus(p), 400); }} />}
      </AnimatePresence>
    </div>
  );
}

export function PostCard({ p, now, here, onChange }: { p: ReliefPost; now: number; here: { lat: number; lng: number } | null; onChange: () => void }) {
  const I = KIND_ICON[p.kind];
  return (
    <div>
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 shrink-0 rounded-2xl grid place-items-center text-white" style={{ background: p.type === 'OFFER' ? OFFER : URGENCY_COLOR[p.urgency] }}><I className="w-5 h-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-zinc-900 dark:text-white">{p.title}</p>
          <p className="text-xs text-zinc-500">{p.type === 'OFFER' ? `Offered by ${p.by?.name ?? 'someone'}` : `${URGENCY_LABEL[p.urgency]} need · asked by ${p.mine ? 'you' : p.by?.name ?? 'someone'}`}</p>
        </div>
      </div>
      {p.details && <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap">{p.details}</p>}
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" aria-hidden />{p.people} {p.people === 1 ? 'person' : 'people'}</span>
        <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" aria-hidden />{p.place ?? 'Area shown on the map'}{here ? ` · ${(distanceM(here, p) / 1000).toFixed(1)} km away` : ''}</span>
        <span>{now ? formatDistanceToNow(new Date(p.createdAt), { addSuffix: true }) : ''}</span>
        {p.status === 'TAKEN' && <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{p.helping ? 'You’re helping' : `${p.helper?.name ?? 'Someone'} is helping`}</span>}
        {p.status === 'DONE' && <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Delivered</span>}
      </p>
      <div className="mt-3"><PostActions p={p} onChange={onChange} small /></div>
    </div>
  );
}

function PostForm({ at, onPick, onClose, onDone }: { at: { lat: number; lng: number } | null; onPick: () => void; onClose: () => void; onDone: (p: ReliefPost | null) => void }) {
  const [f, setF] = useState({ type: 'NEED' as 'NEED' | 'OFFER', kind: 'FOOD' as ReliefKind, title: '', details: '', people: '1', urgency: 'MEDIUM' as Urgency, place: '' });
  const [where, setWhere] = useState(at);
  const [saving, setSaving] = useState(false);
  const locate = () => navigator.geolocation?.getCurrentPosition((g) => setWhere({ lat: g.coords.latitude, lng: g.coords.longitude }), () => toast.error('Your position isn’t shared: tap the map instead.'), { timeout: 8000 });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!where) { toast.error('Where is it? Use your location or tap the map.'); return; }
    setSaving(true);
    try {
      const res = await api.post<ReliefPost>('/relief/posts', { ...f, people: Number(f.people), lat: where.lat, lng: where.lng });
      toast.success(f.type === 'NEED' ? 'Posted. Helpers nearby can see it now.' : 'Thank you! Your offer is on the map.');
      onDone({ ...res.data, by: null, helper: null, mine: true, helping: false });
    } catch (err) { toast.error(errorMessage(err, 'Could not post it.')); } finally { setSaving(false); }
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[120] grid place-items-end sm:place-items-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <motion.form initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: 'spring', stiffness: 360, damping: 32 }} onClick={(e) => e.stopPropagation()} onSubmit={(e) => void save(e)}
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#0b1a24] p-5 sm:p-6 shadow-2xl border border-zinc-200 dark:border-white/10" aria-label="Ask or offer help">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold text-zinc-900 dark:text-white">Ask or offer help</h2><button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 grid place-items-center rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button></div>
        <div className="mt-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Need or offer">
          {([['NEED', 'I need help'], ['OFFER', 'I can offer']] as const).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={f.type === id} onClick={() => setF({ ...f, type: id })} className={cn('rounded-2xl border-2 py-3 text-sm font-semibold transition-colors', f.type === id ? (id === 'NEED' ? 'border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-200' : 'border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-200') : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300')}>{label}</button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Kind of help">
          {RELIEF_KINDS.map((k) => { const I = KIND_ICON[k]; return (
            <button key={k} type="button" role="radio" aria-checked={f.kind === k} onClick={() => setF({ ...f, kind: k })} className={cn('flex flex-col items-center gap-1 rounded-2xl border py-2.5 text-[11px] font-semibold transition-colors', f.kind === k ? 'border-orange-500/60 bg-orange-500/10 text-orange-700 dark:text-orange-200' : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300')}>
              <I className="w-5 h-5" aria-hidden />{RELIEF_KIND_LABEL[k]}
            </button>
          ); })}
        </div>
        <label className="mt-4 block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">In a few words</span><input required maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="input mt-1" placeholder={f.type === 'NEED' ? 'Food for a family of 5' : 'I can drive supplies on weekends'} /></label>
        <label className="mt-3 block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Details (optional)</span><textarea rows={3} maxLength={1000} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} className="input mt-1 resize-y" placeholder="What exactly, when, anything a helper should know. Don’t write your address: say it in a message." /></label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{f.type === 'NEED' ? 'How many people' : 'How many people it can help'}</span><input type="number" min={1} max={10000} value={f.people} onChange={(e) => setF({ ...f, people: e.target.value })} className="input mt-1" /></label>
          {f.type === 'NEED' && <label className="block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">How urgent</span><select value={f.urgency} onChange={(e) => setF({ ...f, urgency: e.target.value as Urgency })} className="input mt-1">{URGENCIES.map((u) => <option key={u} value={u}>{URGENCY_LABEL[u]}</option>)}</select></label>}
        </div>
        <label className="mt-3 block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Area name (optional)</span><input maxLength={120} value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} className="input mt-1" placeholder="Riverside, Ward 12…" /></label>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={locate} className="btn-secondary btn-sm"><LocateFixed className="w-4 h-4" />Use my location</button>
          <button type="button" onClick={onPick} className="btn-secondary btn-sm"><Crosshair className="w-4 h-4" />Tap the map</button>
          <span className="text-[11px] text-zinc-500">{where ? `Set · shown about 500 m from ${where.lat.toFixed(3)}, ${where.lng.toFixed(3)}` : 'Not set yet'}</span>
        </div>
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="btn-secondary">Cancel</button><button type="submit" disabled={saving || !f.title.trim()} className="btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <HandHeart className="w-4 h-4" />}Post it</button></div>
      </motion.form>
    </motion.div>
  );
}
