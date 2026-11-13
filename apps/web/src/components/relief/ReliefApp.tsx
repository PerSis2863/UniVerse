'use client';

import { PlacesBoard } from './PlacesBoard';
import { SafetyCheck } from './SafetyCheck';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Car, Check, Crosshair, Droplets, Globe2, HandHeart, Home, Loader2, LocateFixed, MapPin, MessageSquare, Minus, Package, Plus, Shirt, Siren, Stethoscope, Undo2, Users, Utensils, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { celebrate } from '@/lib/celebrate';
import { authedJson } from '@/lib/authed-fetch';
import { inboxFor } from '@/lib/apps';
import { fetcher } from '@/lib/fetcher';
import { distanceM } from '@/lib/attendance-rules';
import { RELIEF_KINDS, RELIEF_KIND_LABEL, RELIEF_ORG_KIND_LABEL, STOCK_LABEL, SKILLS, SKILL_LABEL, URGENCIES, URGENCY_COLOR, URGENCY_LABEL, guessNeed, needScore, runsOrg, type Place, type ReliefKind, type Skill, type Urgency } from '@/lib/relief';
import { useDarkMode } from '@/lib/use-dark';
import { useNow } from '@/lib/use-now';
import { useAuthStore } from '@/store/auth';
import { InviteButton } from '@/components/apps/InviteButton';
import { cn } from '@/lib/utils';
import { glow, toBase } from '@/components/trace/map/engine';
import { groupNear, type Group } from '@/components/trace/map/cluster';
import { WorldCanvas, type Box, type Frame, type MapHandle } from '@/components/trace/map/WorldCanvas';
import { LiveCard } from '@/components/live/LiveCard';
import { Funnel } from '@/components/live/Funnel';
import { Radar } from '@/components/live/Radar';
import { Journey } from '@/components/live/Journey';
import { useActivePoll } from '@/lib/realtime-client';

// UniVerse Relief (src/lib/apps.ts): every open need and offer of help on one live map (the same map
// engine as Trace), the most urgent and nearest needs first, "I can help", messages, and delivered.
// Server: src/server/relief.ts.

export interface ReliefPost {
  id: string; type: 'NEED' | 'OFFER'; kind: ReliefKind; title: string; details: string | null; people: number; urgency: Urgency;
  lat: number; lng: number; place: string | null; status: string; createdAt: string; takenAt: string | null; doneAt: string | null;
  by: { id: string; name: string } | null; helper: { id: string; name: string } | null; mine: boolean; helping: boolean;
  /** M106: posted in an organisation's name / taken on by an organisation. */
  org?: { id: string; name: string } | null; helperOrg?: { id: string; name: string } | null;
  /** M149: the skill a need asks for. */
  skill?: Skill | null;
}
interface ReliefMap {
  posts: ReliefPost[]; recent: ReliefPost[]; done: { lat: number; lng: number; people: number; kind: string }[];
  stats: { openNeeds: number; inProgress: number; offers: number; peopleWaiting: number; helped: number; avgMinutes: number | null; helpers: number };
}

export const KIND_ICON: Record<ReliefKind, typeof Utensils> = { FOOD: Utensils, WATER: Droplets, SHELTER: Home, MEDICAL: Stethoscope, TRANSPORT: Car, CLOTHES: Shirt, OTHER: Package };
const OFFER = '#14b8a6', DONE = '#22c55e';

/** M172: a name on the map with a soft halo, and a fainter second line (where it is) when given. */
function label(ctx: CanvasRenderingContext2D, f: Frame, text: string, x: number, y: number, sub: string | null) {
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = 3;
  ctx.strokeStyle = f.dark ? 'rgba(10,10,12,0.9)' : 'rgba(255,255,255,0.95)';
  const top = sub ? y - 6 : y;
  ctx.font = '600 11px ui-sans-serif, system-ui'; ctx.strokeText(text, x, top);
  ctx.fillStyle = f.dark ? '#eef2fb' : '#111113'; ctx.fillText(text, x, top);
  if (!sub) return;
  ctx.font = '500 11px ui-sans-serif, system-ui'; ctx.strokeText(sub, x, y + 7);
  ctx.fillStyle = f.dark ? 'rgba(228,228,231,0.72)' : 'rgba(39,39,42,0.72)'; ctx.fillText(sub, x, y + 7);
}
/** A group's disc: bigger with more in it, never wider than the reach that joins them. */
const bubble = (n: number) => 10 + Math.min(8, Math.log2(n) * 2.4);
const many = (n: number, one: string, more = `${one}s`) => `${n} ${n === 1 ? one : more}`;

/** The "Ask or offer help" form, kept here so tapping the map for the place doesn't lose what was typed. */
interface Draft { type: 'NEED' | 'OFFER'; kind: ReliefKind; title: string; details: string; people: string; urgency: Urgency; place: string; orgId: string; textId: string; skill: Skill | '' }
const EMPTY: Draft = { type: 'NEED', kind: 'FOOD', title: '', details: '', people: '1', urgency: 'MEDIUM', place: '', orgId: '', textId: '', skill: '' };
const WORLD: Box = [-170, -56, 180, 76];

/** The actions a person can take on a post. */
export function PostActions({ p, onChange, small }: { p: ReliefPost; onChange: () => void; small?: boolean }) {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (action: string, msg: string, at?: Element) => {
    setBusy(action);
    try { await api.post(`/relief/posts/${p.id}/${action}`); toast.success(msg); if (action === 'done') celebrate(at); onChange(); }
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
      {!done && (p.mine || p.helping) && p.status === 'TAKEN' && <button type="button" disabled={!!busy} onClick={(e) => void act('done', 'Marked as delivered.', e.currentTarget)} className={cn('btn-primary', btn)}><Check className="w-4 h-4" />Delivered</button>}
      {!done && p.helping && p.status === 'TAKEN' && <button type="button" disabled={!!busy} onClick={() => void act('release', 'Given back: someone else can take it.')} className={cn('btn-secondary', btn)}><Undo2 className="w-4 h-4" />I can’t after all</button>}
      {!done && p.mine && <button type="button" disabled={!!busy} onClick={() => void act('close', 'Closed.')} className={cn('btn-secondary', btn)}><X className="w-4 h-4" />Close</button>}
    </div>
  );
}

export function ReliefApp() {
  const dark = useDarkMode();
  const calm = useReducedMotion();
  const now = useNow();
  // (Only while someone is using the tab: an idle one asked every 20 s all day, M169.)
  const mapPoll = useActivePoll(20_000);
  const { data, mutate } = useSWR<ReliefMap>('/relief/map', fetcher, { refreshInterval: mapPoll, keepPreviousData: true });
  const [type, setType] = useState<'ALL' | 'NEED' | 'OFFER'>('ALL');
  const [kinds, setKinds] = useState<Set<ReliefKind>>(new Set());
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  // An alert's link (/relief?post=<id>) opens with that post chosen.
  const [selected, setSelected] = useState<string | null>(() => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('post')));
  const [posting, setPosting] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [picking, setPicking] = useState(false);
  // A coordinator putting a text request on the map (M107): /relief?text=<id>&org=<id> opens the form
  // with a first guess from the message (guessNeed), in the organisation's name.
  const [fromText] = useState(() => { if (typeof window === 'undefined') return null; const q = new URLSearchParams(window.location.search); const t = q.get('text'), o = q.get('org'); return t && o ? { t, o } : null; });
  const prefilled = useRef(false);
  useSWR<{ texts: { id: string; channel: string; body: string; status: string }[] | null }>(fromText ? `/relief/orgs/${fromText.o}` : null, fetcher, {
    onSuccess: (d) => {
      if (prefilled.current || !fromText) return;
      prefilled.current = true;
      const msg = d.texts?.find((x) => x.id === fromText.t);
      if (!msg) { toast.error('That message is gone, or it isn’t yours to post.'); return; }
      if (msg.status === 'POSTED') { toast('This message is on the map already.'); return; }
      const g = guessNeed(msg.body);
      setDraft({ ...EMPTY, kind: g.kind, title: g.title.slice(0, 120), details: msg.body.slice(0, 1000), people: String(g.people), urgency: g.urgency, orgId: fromText.o, textId: msg.id });
      setPosting(true);
    },
  });
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);
  const map = useRef<MapHandle>(null);
  const frameRef = useRef<Frame | null>(null);
  // M172: the shelters and food banks that said how they are (the board below uses the same answer),
  // requests that would pile up drawn as one group with a count, a card for what the pointer is on.
  const { data: placeData } = useSWR<{ places: Place[] }>('/relief/places', fetcher, { refreshInterval: useActivePoll(60_000), keepPreviousData: true });
  const shelters = useMemo(() => (placeData?.places ?? []).map((o) => { const [bx, by] = toBase(o.lng, o.lat); return { o, bx, by }; }), [placeData]);
  const groups = useRef<Group<ReliefPost>[]>([]);
  const [hover, setHover] = useState<{ key: string; x: number; y: number; mw: number; post?: ReliefPost; group?: ReliefPost[]; org?: Place } | null>(null);
  const [orgSel, setOrgSel] = useState<Place | null>(null);

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

  const hoverView = useRef('');
  const draw = (f: Frame) => {
    frameRef.current = f;
    // The card for what the pointer is on goes once the map moves (it would point at the wrong place).
    const viewKey = `${f.view.k.toFixed(4)},${f.view.x.toFixed(1)},${f.view.y.toFixed(1)}`;
    if (hoverView.current && hoverView.current !== viewKey) { hoverView.current = ''; setHover(null); }
    const { ctx, t } = f;
    const { sx, sy } = f;
    const zf = Math.min(2.2, Math.max(1, Math.pow(f.zoom, 0.3)));
    // Delivered in the last 30 days: soft green.
    ctx.save(); ctx.globalCompositeOperation = f.dark ? 'lighter' : 'source-over';
    const g = glow(DONE);
    for (const d of model.done) { const x = sx(d.bx), y = sy(d.by); if (x < -20 || x > f.w + 20 || y < -20 || y > f.h + 20) continue; ctx.globalAlpha = 0.22; const r = 8 * zf; ctx.drawImage(g, x - r, y - r, r * 2, r * 2); }
    ctx.restore();
    // Shelters, food banks and groups (M172): a small house, green when open, with its name close in.
    for (const { o, bx, by } of shelters) {
      const x = sx(bx), y = sy(by);
      if (x < -20 || x > f.w + 20 || y < -20 || y > f.h + 20) continue;
      const s2 = 7 * Math.sqrt(zf);
      ctx.fillStyle = o.openNow === false ? '#71717a' : '#16a34a'; ctx.strokeStyle = f.dark ? '#0c0c0e' : '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(x - s2, y - s2, s2 * 2, s2 * 2, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x, y - s2 * 0.55); ctx.lineTo(x + s2 * 0.55, y - s2 * 0.05); ctx.lineTo(x + s2 * 0.38, y - s2 * 0.05); ctx.lineTo(x + s2 * 0.38, y + s2 * 0.5); ctx.lineTo(x - s2 * 0.38, y + s2 * 0.5); ctx.lineTo(x - s2 * 0.38, y - s2 * 0.05); ctx.lineTo(x - s2 * 0.55, y - s2 * 0.05); ctx.closePath(); ctx.fill();
      if (f.zoom > 14) label(ctx, f, o.name, x + s2 + 6, y, o.place && f.zoom > 40 ? o.place : null);
    }
    // Requests that would pile up on each other join into a group with a count (they split as the
    // map is zoomed in); the chosen one always stands alone.
    const pts: { item: ReliefPost; x: number; y: number }[] = [];
    for (const { p, bx, by } of model.posts) {
      const x = sx(bx), y = sy(by);
      if (x < -30 || x > f.w + 30 || y < -30 || y > f.h + 30) continue;
      pts.push({ item: p, x, y });
    }
    const rank = (p: ReliefPost) => (p.type === 'OFFER' ? 9 : URGENCIES.length - URGENCIES.indexOf(p.urgency));
    pts.sort((a, b) => rank(a.item) - rank(b.item));
    const loose = pts.filter((q) => q.item.id === selected);
    const grouped = f.zoom < 60 ? groupNear(pts.filter((q) => q.item.id !== selected), 38) : pts.filter((q) => q.item.id !== selected).map((q) => ({ x: q.x, y: q.y, items: [q.item] }));
    groups.current = grouped.filter((g) => g.items.length > 1);
    for (const g of groups.current) {
      // A disc with a ring split by kind (critical, high, medium, low needs, offers) and the count.
      const n = g.items.length, r = bubble(n);
      const shares = new Map<string, number>();
      for (const p of g.items) { const c = p.type === 'OFFER' ? OFFER : URGENCY_COLOR[p.urgency]; shares.set(c, (shares.get(c) ?? 0) + 1); }
      if (!calm && g.items.some((p) => p.type === 'NEED' && p.status === 'OPEN' && p.urgency === 'CRITICAL')) {
        const ph = (t / 1600) % 1; ctx.globalAlpha = (1 - ph) * 0.45; ctx.strokeStyle = URGENCY_COLOR.CRITICAL; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(g.x, g.y, r + 3 + ph * 16, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.fillStyle = f.dark ? 'rgba(17,17,19,0.92)' : 'rgba(255,255,255,0.96)';
      ctx.beginPath(); ctx.arc(g.x, g.y, r, 0, Math.PI * 2); ctx.fill();
      let a0 = -Math.PI / 2;
      ctx.lineWidth = 3.5; ctx.lineCap = 'butt';
      for (const [c, k] of shares) { const a1 = a0 + (k / n) * Math.PI * 2; ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(g.x, g.y, r - 1.75, a0, a1); ctx.stroke(); a0 = a1; }
      ctx.fillStyle = f.dark ? '#f4f4f5' : '#18181b'; ctx.font = `700 ${n > 99 ? 10 : 11}px ui-sans-serif, system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(n), g.x, g.y + 0.5);
    }
    for (const q of [...grouped.filter((g) => g.items.length === 1).map((g) => ({ item: g.items[0], x: g.x, y: g.y })), ...loose]) {
      const p = q.item, x = q.x, y = q.y, bx = x;
      const color = p.type === 'OFFER' ? OFFER : URGENCY_COLOR[p.urgency];
      const r = (p.type === 'OFFER' ? 5 : 4 + Math.min(6, Math.sqrt(p.people) * 1.4)) * Math.sqrt(zf);
      if (p.type === 'NEED' && p.status === 'OPEN' && !calm && (p.urgency === 'CRITICAL' || p.urgency === 'HIGH')) {
        const ph = ((t / (p.urgency === 'CRITICAL' ? 1100 : 1800)) + (bx % 1)) % 1;
        ctx.globalAlpha = (1 - ph) * 0.7; ctx.strokeStyle = color; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(x, y, r + ph * 22, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.fillStyle = color; ctx.strokeStyle = f.dark ? '#0c0c0e' : '#fff'; ctx.lineWidth = 2;
      if (p.type === 'OFFER') { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-r, -r, r * 2, r * 2); ctx.strokeRect(-r, -r, r * 2, r * 2); ctx.restore(); }
      else { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      if (p.status === 'TAKEN') { ctx.strokeStyle = DONE; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r + 3.5, 0, Math.PI * 2); ctx.stroke(); }
      if (p.id === selected) { ctx.strokeStyle = f.dark ? '#fff' : '#111113'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r + 7 + (calm ? 0 : Math.sin(t / 260) * 1.5), 0, Math.PI * 2); ctx.stroke(); }
      // Close in, each one says what it is and where (M172: the place under the title).
      if (f.zoom > 24 || p.id === selected) label(ctx, f, p.title, x + r + 6, y, f.zoom > 40 || p.id === selected ? p.place : null);
    }
    if (here) { const [hx, hy] = toBase(here.lng, here.lat); const x = sx(hx), y = sy(hy); ctx.fillStyle = '#3b82f6'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    if (picked) { const [px, py] = toBase(picked.lng, picked.lat); const x = sx(px), y = sy(py); ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y - 16, 8, Math.PI * 0.75, Math.PI * 0.25); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - 16, 3, 0, Math.PI * 2); ctx.fill(); }
  };

  /** What's under the pointer: a group, a request or offer, or a shelter (M172). */
  const hit = (pt: { x: number; y: number }, f: Frame) => {
    for (const g of groups.current) if (Math.hypot(pt.x - g.x, pt.y - g.y) < bubble(g.items.length) + 2) return { key: `g:${g.items[0].id}`, x: g.x, y: g.y, group: g.items };
    let best: { p: ReliefPost; d: number; x: number; y: number } | null = null;
    for (const { p, bx, by } of model.posts) {
      if (groups.current.some((g) => g.items.length > 1 && g.items.includes(p))) continue;
      const x = f.sx(bx), y = f.sy(by), d = Math.hypot(pt.x - x, pt.y - y);
      if (d < 16 && (!best || d < best.d)) best = { p, d, x, y };
    }
    if (best) return { key: `p:${best.p.id}`, x: best.x, y: best.y, post: best.p };
    for (const { o, bx, by } of shelters) { const x = f.sx(bx), y = f.sy(by); if (Math.abs(pt.x - x) < 12 && Math.abs(pt.y - y) < 12) return { key: `o:${o.id}`, x, y, org: o }; }
    return null;
  };
  const onPoint = (pt: { x: number; y: number } | null, kind: 'hover' | 'click') => {
    const f = frameRef.current;
    if (!f) return;
    if (kind === 'hover') {
      const h = pt && !picking ? hit(pt, f) : null;
      if ((h?.key ?? null) !== (hover?.key ?? null)) {
        hoverView.current = h ? `${f.view.k.toFixed(4)},${f.view.x.toFixed(1)},${f.view.y.toFixed(1)}` : '';
        setHover(h ? { ...h, mw: f.w } : null);
      }
      return;
    }
    if (!pt) return;
    if (picking) {
      const [lng, lat] = f.lngLat(pt.x, pt.y);
      setPicked({ lat, lng }); setPicking(false); setPosting(true);
      return;
    }
    const h = hit(pt, f);
    setHover(null);
    if (h?.group) {
      // A group: fly in until it splits.
      const lats = h.group.map((p) => p.lat), lngs = h.group.map((p) => p.lng);
      const pad = 0.02;
      map.current?.flyTo([Math.min(...lngs) - pad, Math.min(...lats) - pad, Math.max(...lngs) + pad, Math.max(...lats) + pad], { maxZoom: 160 });
      return;
    }
    if (h?.org) { setOrgSel(h.org); setSelected(null); return; }
    setOrgSel(null);
    setSelected(h?.post ? h.post.id : null);
  };

  const s = data?.stats;
  return (
    <div className="space-y-4">
      <SafetyCheck here={here} onNeedHelp={() => { setDraft({ ...EMPTY, urgency: 'CRITICAL' }); setPicked(here); setPosting(true); }} />
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

      {s && (
        // M48: how requests move from asked to helped, as a stream of light.
        <LiveCard title="Help, moving" sub="Needs on the map, people on the way, and help given in 30 days"
          ticker={(data?.recent ?? []).slice(0, 6).map((p) => `${p.type === 'OFFER' ? 'Offer' : 'Need'}: ${p.title}`)}>
          <div className="grid items-center gap-4 lg:grid-cols-[1fr_240px]">
            <Funnel className="h-[200px]" label="Needs open, being helped, and helped in the last 30 days"
              stages={[{ label: 'Open needs', value: s.openNeeds }, { label: 'Being helped', value: s.inProgress }, { label: 'Helped', value: s.helped }]} />
            {/* M49: open needs on a radar, the most urgent in the middle. */}
            <Radar className="mx-auto h-[200px] w-full max-w-[240px]" label="Open needs by how urgent they are"
              blips={(data?.posts ?? []).filter((p) => p.type === 'NEED' && p.status === 'OPEN').map((p) => ({ id: p.id, label: RELIEF_KIND_LABEL[p.kind] ?? p.kind, ring: p.urgency === 'CRITICAL' ? 0 : p.urgency === 'HIGH' ? 1 : 2, tone: p.urgency === 'CRITICAL' || p.urgency === 'HIGH' ? 'pink' : 'blue' }))} />
          </div>
        </LiveCard>
      )}

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
                <button key={id} type="button" aria-label={label} title={label} onClick={() => (id === 'home' ? map.current?.home() : map.current?.zoomBy(id === 'in' ? 1.8 : 1 / 1.8))} className="w-9 h-9 grid place-items-center rounded-xl bg-white/90 dark:bg-[#111113]/85 backdrop-blur text-zinc-700 dark:text-zinc-200 shadow-sm border border-zinc-200/70 dark:border-white/10 active:scale-95 transition"><Icon className="w-4 h-4" aria-hidden /></button>
              ))}
            </div>
            <div className="absolute left-3 top-3 hidden sm:flex flex-col gap-1 rounded-xl bg-white/90 dark:bg-[#111113]/85 backdrop-blur px-3 py-2 text-[11px] text-zinc-600 dark:text-zinc-300 shadow-sm border border-zinc-200/70 dark:border-white/10">
              {URGENCIES.slice().reverse().map((u) => <span key={u} className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: URGENCY_COLOR[u] }} />{URGENCY_LABEL[u]} need</span>)}
              <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rotate-45" style={{ background: OFFER }} />Offer</span>
              <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: DONE }} />Someone’s helping</span>
              <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-[3px] bg-green-600" />Shelter, food bank or group</span>
              <span className="flex items-center gap-2"><span className="grid w-3.5 h-3.5 place-items-center rounded-full border-2 border-orange-500 text-[8px] font-bold leading-none" aria-hidden>3</span>Several close together</span>
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
                  className="absolute left-3 right-3 bottom-3 sm:right-auto sm:w-[440px] rounded-2xl bg-white/95 dark:bg-[#111113]/92 backdrop-blur p-4 shadow-xl border border-zinc-200/70 dark:border-white/10">
                  <PostCard p={sel} now={now} here={here} onChange={() => void mutate()} />
                </motion.div>
              )}
              {orgSel && !sel && !picking && (
                <motion.div key={orgSel.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  className="absolute left-3 right-3 bottom-3 sm:right-auto sm:w-[400px] rounded-2xl bg-white/95 dark:bg-[#111113]/92 backdrop-blur p-4 shadow-xl border border-zinc-200/70 dark:border-white/10">
                  <OrgCard o={orgSel} onClose={() => setOrgSel(null)} />
                </motion.div>
              )}
              {hover && !picking && (
                <motion.div key={hover.key} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  className="pointer-events-none absolute z-10 w-64 rounded-xl border border-zinc-200/70 bg-white/95 p-3 text-xs text-zinc-600 shadow-xl dark:border-white/10 dark:bg-[#111113]/95 dark:text-zinc-300"
                  style={{ left: Math.max(8, Math.min(hover.x + 14, hover.mw - 270)), top: hover.y > 170 ? hover.y - 14 : hover.y + 16, translate: hover.y > 170 ? '0 -100%' : undefined, transformOrigin: hover.y > 170 ? 'left bottom' : 'left top' }}>
                  <MapCard hover={hover} now={now} />
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
                  <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">{formatDistanceToNow(new Date(p.createdAt), { addSuffix: true })}{p.status === 'TAKEN' ? ` · ${p.helper?.name ?? 'someone'} is helping` : ''}{p.skill ? ` · needs: ${SKILL_LABEL[p.skill].toLowerCase()}` : ''}</span>
                </span>
              </motion.button>
            );
          })}
        </section>
      </div>

      {/* M148: shelters, food banks and groups that said how they are */}
      <PlacesBoard here={here} onShow={(p) => { map.current?.flyTo([p.lng - 0.06, p.lat - 0.04, p.lng + 0.06, p.lat + 0.04], { maxZoom: 150 }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />

      <AnimatePresence>
        {posting && <PostForm f={draft} setF={setDraft} at={picked} onPick={() => { setPosting(false); setPicking(true); }} onClose={() => { setPosting(false); setPicked(null); setDraft(EMPTY); }} onDone={(p) => { setPosting(false); setPicked(null); setDraft(EMPTY); void mutate(); if (p) setTimeout(() => focus(p), 400); }} />}
      </AnimatePresence>
    </div>
  );
}

export function PostCard({ p, now, here, onChange, extra }: { p: ReliefPost; now: number; here: { lat: number; lng: number } | null; onChange: () => void; extra?: React.ReactNode }) {
  const I = KIND_ICON[p.kind];
  return (
    <div>
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 shrink-0 rounded-2xl grid place-items-center text-white" style={{ background: p.type === 'OFFER' ? OFFER : URGENCY_COLOR[p.urgency] }}><I className="w-5 h-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-zinc-900 dark:text-white">{p.title}</p>
          <p className="text-xs text-zinc-500">{p.type === 'OFFER' ? `Offered by ${p.org?.name ?? p.by?.name ?? 'someone'}` : `${URGENCY_LABEL[p.urgency]} need · asked by ${p.mine ? 'you' : p.org?.name ?? p.by?.name ?? 'someone'}`}</p>
        </div>
      </div>
      {p.details && <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap">{p.details}</p>}
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" aria-hidden />{p.people} {p.people === 1 ? 'person' : 'people'}</span>
        {p.skill && <span className="inline-flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-200">Needs: {SKILL_LABEL[p.skill].toLowerCase()}</span>}
        <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" aria-hidden />{p.place ?? 'Area shown on the map'}{here ? ` · ${(distanceM(here, p) / 1000).toFixed(1)} km away` : ''}</span>
        <span>{now ? formatDistanceToNow(new Date(p.createdAt), { addSuffix: true }) : ''}</span>
        {p.status === 'TAKEN' && <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{p.helperOrg ? `${p.helperOrg.name} is helping` : p.helping ? 'You’re helping' : `${p.helper?.name ?? 'Someone'} is helping`}</span>}
        {p.status === 'DONE' && <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Delivered</span>}
      </p>
      {p.type === 'NEED' && (
        // M50: where this request is, as a journey.
        <Journey className="mt-3" label="Where this request is" steps={[
          { label: 'Asked', at: new Date(p.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), done: true },
          { label: 'Someone’s on it', at: p.takenAt ? new Date(p.takenAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null, done: p.status === 'TAKEN' || p.status === 'DONE' },
          { label: 'Helped', at: p.doneAt ? new Date(p.doneAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null, done: p.status === 'DONE' },
        ]} />
      )}
      <div className="mt-3 flex flex-wrap gap-2">{extra}<PostActions p={p} onChange={onChange} small /></div>
    </div>
  );
}

function PostForm({ f, setF, at, onPick, onClose, onDone }: { f: Draft; setF: (f: Draft) => void; at: { lat: number; lng: number } | null; onPick: () => void; onClose: () => void; onDone: (p: ReliefPost | null) => void }) {
  const [where, setWhere] = useState(at);
  // Coordinators can post in their organisation's name (M106).
  const { data: orgs } = useSWR<{ orgs: { id: string; name: string; role: string }[] }>('/relief/orgs', fetcher);
  const runs = (orgs?.orgs ?? []).filter((o) => runsOrg(o.role));
  const [saving, setSaving] = useState(false);
  const locate = () => navigator.geolocation?.getCurrentPosition((g) => setWhere({ lat: g.coords.latitude, lng: g.coords.longitude }), () => toast.error('Your position isn’t shared: tap the map instead.'), { timeout: 8000 });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!where) { toast.error('Where is it? Use your location or tap the map.'); return; }
    setSaving(true);
    try {
      const res = await api.post<ReliefPost>('/relief/posts', { ...f, people: Number(f.people), lat: where.lat, lng: where.lng });
      toast.success(f.type === 'NEED' ? 'Posted. Helpers nearby can see it now.' : 'Thank you! Your offer is on the map.');
      onDone({ ...res.data, by: null, helper: null, mine: true, helping: false, org: runs.find((o) => o.id === f.orgId) ?? null });
    } catch (err) { toast.error(errorMessage(err, 'Could not post it.')); } finally { setSaving(false); }
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[120] grid place-items-end sm:place-items-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <motion.form initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: 'spring', stiffness: 360, damping: 32 }} onClick={(e) => e.stopPropagation()} onSubmit={(e) => void save(e)}
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#0f0f11] p-5 sm:p-6 shadow-2xl border border-zinc-200 dark:border-white/10" aria-label="Ask or offer help">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold text-zinc-900 dark:text-white">Ask or offer help</h2><button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 grid place-items-center rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button></div>
        <div className="mt-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Need or offer">
          {([['NEED', 'I need help'], ['OFFER', 'I can offer']] as const).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={f.type === id} onClick={() => setF({ ...f, type: id })} className={cn('rounded-2xl border-2 py-3 text-sm font-semibold transition-colors', f.type === id ? (id === 'NEED' ? 'border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-200' : 'border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-200') : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300')}>{label}</button>
          ))}
        </div>
        {/* M110 (the council): helpers may not be nearby, so emergencies go to the real services first. */}
        {f.type === 'NEED' && (
          <p className="mt-3 flex items-start gap-2 rounded-2xl bg-rose-500/10 p-3 text-xs text-rose-800 dark:text-rose-200">
            <Siren className="mt-px h-4 w-4 shrink-0" aria-hidden />
            <span><strong className="font-semibold">UniVerse isn’t an emergency service.</strong> If anyone is in danger, call your local emergency number first (112 in Europe and India, 911 in North America).</span>
          </p>
        )}
        <div className="mt-4 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Kind of help">
          {RELIEF_KINDS.map((k) => { const I = KIND_ICON[k]; return (
            <button key={k} type="button" role="radio" aria-checked={f.kind === k} onClick={() => setF({ ...f, kind: k })} className={cn('flex flex-col items-center gap-1 rounded-2xl border py-2.5 text-[11px] font-semibold transition-colors', f.kind === k ? 'border-orange-500/60 bg-orange-500/10 text-orange-700 dark:text-orange-200' : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300')}>
              <I className="w-5 h-5" aria-hidden />{RELIEF_KIND_LABEL[k]}
            </button>
          ); })}
        </div>
        {f.textId && <p className="mt-4 rounded-2xl bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">From a text message. Everyone can see the map: take out names, addresses and phone numbers, then set where it is.</p>}
        <label className="mt-4 block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">In a few words</span><input required maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="input mt-1" placeholder={f.type === 'NEED' ? 'Food for a family of 5' : 'I can drive supplies on weekends'} /></label>
        <label className="mt-3 block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Details (optional)</span><textarea rows={3} maxLength={1000} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} className="input mt-1 resize-y" placeholder="What exactly, when, anything a helper should know. Don’t write your address: say it in a message." /></label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{f.type === 'NEED' ? 'How many people' : 'How many people it can help'}</span><input type="number" min={1} max={10000} value={f.people} onChange={(e) => setF({ ...f, people: e.target.value })} className="input mt-1" /></label>
          {f.type === 'NEED' && <label className="block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">How urgent</span><select value={f.urgency} onChange={(e) => setF({ ...f, urgency: e.target.value as Urgency })} className="input mt-1">{URGENCIES.map((u) => <option key={u} value={u}>{URGENCY_LABEL[u]}</option>)}</select></label>}
        </div>
        {/* M149: helpers nearby with this skill hear about it first */}
        {f.type === 'NEED' && <label className="mt-3 block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Needs someone who can… (optional)</span><select value={f.skill} onChange={(e) => setF({ ...f, skill: e.target.value as Skill | '' })} className="input mt-1"><option value="">Anyone can help</option>{SKILLS.map((k) => <option key={k} value={k}>{SKILL_LABEL[k]}</option>)}</select></label>}
        {runs.length > 0 && (
          <label className="mt-3 block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Post as</span>
            <select value={f.orgId} disabled={!!f.textId} onChange={(e) => setF({ ...f, orgId: e.target.value })} className="input mt-1"><option value="">Myself</option>{runs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
          </label>
        )}
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

/** M172: the card for what the pointer is on: a request or offer, a group of them, or a shelter. */
function MapCard({ hover, now }: { hover: { post?: ReliefPost; group?: ReliefPost[]; org?: Place }; now: number }) {
  const ago = (iso: string) => (now ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : '');
  if (hover.post) {
    const p = hover.post, I = KIND_ICON[p.kind];
    return (
      <>
        <p className="flex items-center gap-2 font-semibold text-sm text-zinc-900 dark:text-white"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-white" style={{ background: p.type === 'OFFER' ? OFFER : URGENCY_COLOR[p.urgency] }}><I className="h-3.5 w-3.5" aria-hidden /></span><span className="truncate" translate="no">{p.title}</span></p>
        <p className="mt-1.5">{p.type === 'OFFER' ? `Offer · ${RELIEF_KIND_LABEL[p.kind]}` : `${URGENCY_LABEL[p.urgency]} need · ${many(p.people, 'person', 'people')}`}</p>
        <p className="flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" aria-hidden /><span className="truncate" translate="no">{p.place ?? 'Place not named'}</span><span className="shrink-0">· about 500 m</span></p>
        <p>{ago(p.createdAt)}{p.status === 'TAKEN' ? ` · ${p.helper?.name ?? 'someone'} is helping` : ''}{p.org ? ` · ${p.org.name}` : ''}</p>
        <p className="mt-1.5 font-medium text-zinc-500">Click for details</p>
      </>
    );
  }
  if (hover.group) {
    const g = hover.group, needs = g.filter((p) => p.type === 'NEED'), people = needs.reduce((a, p) => a + p.people, 0);
    const places = [...new Set(g.map((p) => p.place).filter(Boolean))] as string[];
    return (
      <>
        <p className="font-semibold text-sm text-zinc-900 dark:text-white">{many(g.length, 'request')} close together</p>
        <p className="mt-1.5 flex flex-wrap gap-1.5">
          {URGENCIES.slice().reverse().map((u) => { const n = needs.filter((p) => p.urgency === u).length; return n ? <span key={u} className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: URGENCY_COLOR[u] }} />{n} {URGENCY_LABEL[u].toLowerCase()}</span> : null; })}
          {g.length - needs.length > 0 && <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rotate-45" style={{ background: OFFER }} />{many(g.length - needs.length, 'offer')}</span>}
        </p>
        {people > 0 && <p className="mt-1">{many(people, 'person', 'people')} waiting</p>}
        {places.length > 0 && <p className="flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" aria-hidden /><span className="truncate" translate="no">{places.slice(0, 3).join(', ')}{places.length > 3 ? ` and ${places.length - 3} more` : ''}</span></p>}
        <p className="mt-1.5 font-medium text-zinc-500">Click to zoom in</p>
      </>
    );
  }
  const o = hover.org!;
  return (
    <>
      <p className="font-semibold text-sm text-zinc-900 dark:text-white" translate="no">{o.name}</p>
      <p className="mt-1">{RELIEF_ORG_KIND_LABEL[o.kind as keyof typeof RELIEF_ORG_KIND_LABEL] ?? o.kind}{o.place ? ` · ${o.place}` : ''}</p>
      <OrgFacts o={o} />
      <p className="mt-1.5 font-medium text-zinc-500">Click for directions</p>
    </>
  );
}

/** Open or not, beds, water, food and charging, as said by the place itself. */
function OrgFacts({ o }: { o: Place }) {
  return (
    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
      <span className={o.openNow === false ? 'text-zinc-500' : 'font-medium text-green-700 dark:text-green-400'}>{o.openNow === false ? 'Closed now' : 'Open now'}</span>
      {o.bedsTotal ? <span>{o.bedsFree ?? 0} of {o.bedsTotal} beds free</span> : null}
      {([['Water', o.water], ['Food', o.food], ['Charging', o.power]] as const).map(([k, v]) => v ? <span key={k}>{k}: {STOCK_LABEL[v].toLowerCase()}</span> : null)}
    </p>
  );
}

/** A shelter chosen on the map (M172). */
function OrgCard({ o, onClose }: { o: Place; onClose: () => void }) {
  return (
    <div className="text-sm text-zinc-600 dark:text-zinc-300">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-zinc-900 dark:text-white" translate="no">{o.name}</p>
          <p className="text-xs">{RELIEF_ORG_KIND_LABEL[o.kind as keyof typeof RELIEF_ORG_KIND_LABEL] ?? o.kind}{o.place ? ` · ${o.place}` : ''}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
      </div>
      <div className="text-xs"><OrgFacts o={o} /></div>
      {o.statusNote && <p className="mt-2 text-xs" translate="no">“{o.statusNote}”</p>}
      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([o.name, o.place].filter(Boolean).join(', '))}`} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm mt-3 inline-flex"><MapPin className="h-3.5 w-3.5" aria-hidden />Directions</a>
    </div>
  );
}
