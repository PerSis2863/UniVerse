'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import Image from 'next/image';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Award, Bike, Bus, Camera, Clock, Flame, Footprints, Leaf, Loader2, Lock, MapPin, Recycle, ShieldCheck, Sparkles, Sun, Trash2, TreePine, Trophy, Utensils } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Rolling } from '@/components/ui/Rolling';
import { api, errorMessage } from '@/lib/api';
import { authedJson } from '@/lib/authed-fetch';
import { shrinkImage } from '@/lib/shrink-image';
import { InviteButton } from '@/components/apps/InviteButton';
import { fetcher } from '@/lib/fetcher';
import { fmt } from '@/lib/instruments';
import { GREEN_FACTORS, GREEN_KINDS, co2For, type GreenKind } from '@/lib/green';
import { useDarkMode } from '@/lib/use-dark';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';
import { glow, toBase } from '@/components/trace/map/engine';
import { WorldCanvas, type Box, type Frame } from '@/components/trace/map/WorldCanvas';

// UniVerse Green (src/lib/apps.ts): my CO₂ saved and what it equals, logging an action (CO₂ worked
// out with the factor shown), this week's challenge for me and my teams, badges, the last 30 days,
// what I did, and everyone's actions on the map. Server: src/server/green.ts.
// Proof (migration 0183): a photo with an action, confirmed by a teammate; only confirmed actions
// count for the challenge and the leaderboards (TeamProofs lists what my teammates wait on).

interface GreenMe {
  totals: { actions: number; kg: number; streak: number; byKind: Partial<Record<GreenKind, number>>; kgByKind: Partial<Record<GreenKind, number>> };
  badges: { id: string; label: string; text: string; earned: boolean }[];
  challenge: { kind: GreenKind; goal: number; title: string; unit: string; starts: string; ends: string; mine: number; waiting: number; team: number | null };
  verified: { actions: number; kg: number };
  perDay: { day: string; kg: number }[];
  recent: { id: string; kind: GreenKind; amount: number; co2Kg: number; note: string | null; place: string | null; photoUrl: string | null; verifiedAt: string | null; createdAt: string }[];
  teams: number;
  community: { kg: number; actions: number; people: number };
}

export const GREEN_ICON: Record<GreenKind, typeof Leaf> = { TREE: TreePine, CYCLE: Bike, TRANSIT: Bus, WALK: Footprints, RECYCLE: Recycle, SOLAR: Sun, MEATFREE: Utensils, CLEANUP: Trash2 };
const EMERALD = '#10b981';
const RECENT = 6;

/** Makes a photo smaller and uploads it; its address goes with the action as proof. */
async function uploadProof(file: File) {
  const f = await shrinkImage(file);
  return (await authedJson<{ url: string }>(`/api/upload?filename=${encodeURIComponent(f.name || 'proof.jpg')}`, { method: 'POST', body: f, headers: { 'Content-Type': f.type || 'image/jpeg' } })).url;
}
const WORLD: Box = [-170, -56, 180, 76];

export function GreenApp() {
  const { data, mutate } = useSWR<GreenMe>('/green/me', fetcher);
  const now = useNow();
  const [kind, setKind] = useState<GreenKind>('CYCLE');
  const [amount, setAmount] = useState('5');
  const [note, setNote] = useState('');
  const [share, setShare] = useState(true);
  const [saving, setSaving] = useState(false);
  const [burst, setBurst] = useState(0);
  const [photo, setPhoto] = useState<File | null>(null);
  const [allRecent, setAllRecent] = useState(false);
  const f = GREEN_FACTORS[kind];
  const preview = co2For(kind, Number(amount) || 0);

  const log = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const pos = share ? await new Promise<{ lat: number; lng: number } | null>((done) => navigator.geolocation ? navigator.geolocation.getCurrentPosition((g) => done({ lat: g.coords.latitude, lng: g.coords.longitude }), () => done(null), { timeout: 5000, maximumAge: 600_000 }) : done(null)) : null;
    try {
      const photoUrl = photo ? await uploadProof(photo) : undefined;
      await api.post('/green/actions', { kind, amount: Number(amount), note, photoUrl, ...(pos ?? {}) });
      toast.success(`Logged: ${preview} kg of CO₂ saved${photoUrl ? '. A teammate can confirm it now.' : ''}`);
      setNote(''); setPhoto(null); setBurst((b) => b + 1);
      void mutate();
    } catch (err) { toast.error(errorMessage(err, 'Could not log it.')); } finally { setSaving(false); }
  };
  const addPhoto = async (id: string, file: File | undefined) => {
    if (!file) return;
    try { await api.post(`/green/actions/${id}/proof`, { photoUrl: await uploadProof(file) }); toast.success('Photo added. A teammate can confirm it now.'); void mutate(); } catch (err) { toast.error(errorMessage(err, 'Could not add the photo.')); }
  };
  const remove = async (id: string) => {
    try { await api.delete(`/green/actions/${id}`); void mutate(); } catch (err) { toast.error(errorMessage(err, 'Could not delete it.')); }
  };

  const t = data?.totals;
  const c = data?.challenge;
  const daysLeft = c && now ? Math.max(0, Math.ceil((Date.parse(c.ends) - now) / 86_400_000)) : null;
  const maxDay = Math.max(1, ...(data?.perDay.map((d) => d.kg) ?? [1]));

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[32px] p-7 sm:p-10 text-white" style={{ background: 'radial-gradient(120% 90% at 0% 0%, #0f3b2e 0%, #0b2620 55%, #0b0b0c 100%)' }}>
        <span aria-hidden className="absolute -right-24 -top-24 w-80 h-80 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="relative grid lg:grid-cols-[1fr_auto] gap-6 items-end">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-400/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-200 ring-1 ring-emerald-300/30"><Leaf className="w-3.5 h-3.5" aria-hidden />Your impact</span>
            <p className="mt-4 font-mono text-6xl sm:text-7xl font-light text-emerald-300"><Rolling value={t?.kg ?? 0} digits={1} /><span className="ml-3 text-xl text-emerald-100/70">kg CO₂ saved</span></p>
            <p className="mt-3 text-emerald-50/80">{t ? `That’s like ${fmt(Math.round(t.kg / 22))} trees growing for a year, or ${fmt(Math.round(t.kg / 0.2))} km not driven.` : '…'}</p>
          </div>
          <dl className="grid grid-cols-3 gap-3 text-center">
            {[[Flame, t?.streak ?? 0, 'day streak'], [Award, data?.badges.filter((b) => b.earned).length ?? 0, 'badges'], [Sparkles, t?.actions ?? 0, 'actions']].map(([Icon, v, k]) => {
              const I = Icon as typeof Flame;
              return <div key={k as string} className="rounded-2xl bg-white/[0.07] ring-1 ring-white/10 px-4 py-3"><I className="w-5 h-5 mx-auto text-emerald-300" aria-hidden /><dd className="mt-1 font-mono text-2xl tabular-nums">{String(v)}</dd><dt className="text-[11px] text-emerald-100/70">{k as string}</dt></div>;
            })}
          </dl>
        </div>
        {data && <p className="relative mt-6 text-xs text-emerald-100/60">Everyone on UniVerse Green: {fmt(data.community.kg)} kg CO₂ saved by {fmt(data.community.people)} people in {fmt(data.community.actions)} actions.</p>}
      </section>

      {/* Wide screens: the right column ends with the form; teammates' photos scroll inside it. */}
      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-6">
        <form onSubmit={(e) => void log(e)} className="panel p-5 relative overflow-hidden" aria-labelledby="log-h">
          <h2 id="log-h" className="font-bold text-zinc-900 dark:text-white">Log an action</h2>
          <div className="mt-3 grid grid-cols-4 gap-2" role="radiogroup" aria-label="What you did">
            {GREEN_KINDS.map((k) => { const I = GREEN_ICON[k]; return (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={cn('flex flex-col items-center gap-1 rounded-2xl border py-3 text-[11px] font-semibold transition-all active:scale-95', kind === k ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200 shadow-[0_6px_20px_-10px_#10b981]' : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300')}>
                <I className="w-5 h-5" aria-hidden /><span className="text-center leading-tight px-1">{GREEN_FACTORS[k].label.split(' ').slice(0, 2).join(' ')}</span>
              </button>
            ); })}
          </div>
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-3 items-end">
            <label className="block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">How many {f.units}</span><input type="number" min={0.1} max={f.max} step="any" required value={amount} onChange={(e) => setAmount(e.target.value)} className="input mt-1" /></label>
            <div className="text-right pb-1"><p className="font-mono text-2xl tabular-nums text-emerald-600 dark:text-emerald-400">−{preview} kg</p><p className="text-[10px] text-zinc-500">CO₂</p></div>
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">{f.how}.</p>
          <label className="mt-3 block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Note (optional)</span><input maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className="input mt-1" placeholder="To work and back" /></label>
          <label className="mt-3 flex items-center gap-3 rounded-2xl border border-dashed border-zinc-300 dark:border-white/15 px-3 py-2.5 cursor-pointer hover:border-emerald-500/60 transition-colors">
            <Camera className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <span className="min-w-0 flex-1 text-xs text-zinc-600 dark:text-zinc-300"><span className="block font-semibold text-zinc-800 dark:text-zinc-100">{photo ? photo.name : 'Add a photo as proof'}</span>A teammate confirms it, then it counts for the challenge and the leaderboards.</span>
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </label>
          <label className="mt-3 flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="w-4 h-4 accent-emerald-500" /><MapPin className="w-3.5 h-3.5" aria-hidden />Put it on the shared map (about 11 km away from where I am)</label>
          <button type="submit" disabled={saving} className="mt-4 w-full h-11 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Leaf className="w-4 h-4" />}Log it</button>
          <AnimatePresence>{burst > 0 && <Burst key={burst} />}</AnimatePresence>
        </form>

        <div className="flex flex-col gap-6">
          {c && (
            <section className="panel p-5" aria-labelledby="ch-h">
              <h2 id="ch-h" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" aria-hidden />This week’s challenge</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{c.title}{daysLeft !== null ? ` · ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left` : ''}</p>
              {[['You', c.mine], ...(c.team !== null ? [['Your teams', c.team] as const] : [])].map(([who, v]) => (
                <div key={who as string} className="mt-3">
                  <div className="flex justify-between text-xs text-zinc-500"><span>{who as string}</span><span className="font-mono">{v as number} / {c.goal} {c.unit}</span></div>
                  <div className="mt-1 h-2.5 rounded-full bg-zinc-100 dark:bg-white/[0.07] overflow-hidden"><motion.div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-400" initial={{ width: 0 }} animate={{ width: `${Math.min(100, ((v as number) / c.goal) * 100)}%` }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} /></div>
                </div>
              ))}
              <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">Confirmed actions only.{c.waiting > 0 ? ` ${fmt(c.waiting)} ${c.unit} more wait for a teammate to confirm.` : ''}</p>
              {c.team === null && <Link href="/green/teams" className="btn-secondary btn-sm mt-4 inline-flex">Join or start a team</Link>}
            </section>
          )}
          <TeamProofs onDone={() => void mutate()} />
        </div>
      </div>

      {/* Wide screens: "What you did" is exactly as tall as the 30 days and badges beside it and scrolls inside. */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <section className="panel p-5" aria-labelledby="days-h">
            <h2 id="days-h" className="font-bold text-zinc-900 dark:text-white">The last 30 days</h2>
            <div className="mt-4 flex items-end gap-1 h-32" aria-hidden>
              {(data?.perDay ?? Array.from({ length: 30 }, () => ({ day: '', kg: 0 }))).map((d, i) => (
                <motion.span key={i} className="flex-1 rounded-t bg-gradient-to-t from-emerald-600 to-lime-400" initial={{ height: 0 }} animate={{ height: `${Math.max(2, (d.kg / maxDay) * 100)}%` }} transition={{ duration: 0.6, delay: i * 0.012 }} title={`${d.day}: ${d.kg} kg`} />
              ))}
            </div>
            <ul className="mt-5 space-y-2">
              {GREEN_KINDS.filter((k) => t?.kgByKind[k]).sort((a, b) => (t!.kgByKind[b] ?? 0) - (t!.kgByKind[a] ?? 0)).map((k) => { const I = GREEN_ICON[k]; const kg = t!.kgByKind[k] ?? 0; return (
                <li key={k} className="text-sm"><div className="flex items-center gap-2"><I className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden /><span className="flex-1 text-zinc-700 dark:text-zinc-200">{GREEN_FACTORS[k].label}</span><span className="font-mono text-xs text-zinc-500">{fmt(t!.byKind[k] ?? 0)} {GREEN_FACTORS[k].units}</span><span className="font-mono text-xs w-16 text-right text-emerald-600 dark:text-emerald-400">{kg.toFixed(1)} kg</span></div>
                  <div className="mt-1 ml-6 h-1 rounded-full bg-zinc-100 dark:bg-white/[0.06]"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${(kg / (t!.kg || 1)) * 100}%` }} /></div></li>
              ); })}
            </ul>
          </section>
          <section className="panel p-5" aria-labelledby="badges-h">
            <h2 id="badges-h" className="font-bold text-zinc-900 dark:text-white">Badges</h2>
            <ul className="mt-3 grid grid-cols-4 gap-2">
              {(data?.badges ?? []).map((b, i) => (
                <motion.li key={b.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.04 }} title={b.text} className={cn('rounded-2xl p-2.5 text-center', b.earned ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30' : 'bg-zinc-100 dark:bg-white/[0.04] opacity-60')}>
                  {b.earned ? <Award className="w-6 h-6 mx-auto text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]" aria-hidden /> : <Lock className="w-6 h-6 mx-auto text-zinc-400" aria-hidden />}
                  <p className="mt-1 text-[10px] font-semibold text-zinc-700 dark:text-zinc-200 leading-tight">{b.label}</p>
                  <span className="sr-only">{b.earned ? 'earned' : 'not yet'}: {b.text}</span>
                </motion.li>
              ))}
            </ul>
          </section>
        </div>
        <section className="panel p-5 relative lg:min-h-[360px]" aria-labelledby="recent-h">
          <div className="lg:absolute lg:inset-5 flex flex-col">
            <h2 id="recent-h" className="font-bold text-zinc-900 dark:text-white">What you did</h2>
            {!data ? <div className="mt-3 h-40 skeleton rounded-xl" /> : data.recent.length === 0 ? <p className="mt-3 text-sm text-zinc-500">Nothing yet. Your first action shows here.</p> : (
              <ul className="mt-3 divide-y divide-zinc-100 dark:divide-white/[0.06] lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:pe-1">
                {data.recent.map((a, i) => { const I = GREEN_ICON[a.kind] ?? Leaf; return (
                  <li key={a.id} className={cn('py-2.5 flex items-center gap-3 text-sm group', i >= RECENT && !allRecent && 'max-lg:hidden')}>
                    <span className="w-8 h-8 rounded-xl grid place-items-center bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><I className="w-4 h-4" aria-hidden /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-zinc-800 dark:text-zinc-100">{fmt(a.amount)} {GREEN_FACTORS[a.kind]?.units} · {GREEN_FACTORS[a.kind]?.label.toLowerCase()}</span><span className="block text-[11px] text-zinc-500 truncate">{[a.note, formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })].filter(Boolean).join(' · ')}</span></span>
                    {a.verifiedAt ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"><ShieldCheck className="w-3.5 h-3.5" aria-hidden />Confirmed</span>
                      : a.photoUrl ? <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300"><Clock className="w-3.5 h-3.5" aria-hidden />Waiting</span>
                      : <label className="inline-flex items-center gap-1 rounded-full border border-zinc-200 dark:border-white/10 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 cursor-pointer hover:border-emerald-500/60"><Camera className="w-3.5 h-3.5" aria-hidden />Add proof<input type="file" accept="image/*" className="sr-only" onChange={(e) => void addPhoto(a.id, e.target.files?.[0])} /></label>}
                    <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">−{a.co2Kg} kg</span>
                    <button type="button" onClick={() => void remove(a.id)} aria-label="Delete this action" className="w-7 h-7 grid place-items-center rounded-full text-zinc-400 hover:text-rose-600 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                  </li>
                ); })}
              </ul>
            )}
            {data && data.recent.length > RECENT && <button type="button" onClick={() => setAllRecent((v) => !v)} className="btn-secondary btn-sm mt-3 lg:hidden">{allRecent ? 'Show less' : `Show all ${data.recent.length}`}</button>}
          </div>
        </section>
      </div>

      <GreenMap />
    </div>
  );
}

interface Proof { id: string; kind: GreenKind; amount: number; co2Kg: number; note: string | null; photoUrl: string; place: string | null; createdAt: string; by: string }

/** My teammates' actions with a photo, waiting for someone to confirm them (GET /green/proofs). */
function TeamProofs({ onDone }: { onDone: () => void }) {
  const { data, mutate } = useSWR<{ proofs: Proof[]; teams: number }>('/green/proofs', fetcher);
  const [busy, setBusy] = useState<string | null>(null);
  const confirm = async (id: string) => {
    setBusy(id);
    try { await api.post(`/green/actions/${id}/confirm`); toast.success('Confirmed. It counts for their challenge now.'); void mutate(); onDone(); } catch (err) { toast.error(errorMessage(err, 'Could not confirm it.')); } finally { setBusy(null); }
  };
  return (
    <section className="panel p-5 relative lg:flex-1 lg:min-h-[240px]" aria-labelledby="proofs-h">
      <div className="lg:absolute lg:inset-5 flex flex-col">
        <h2 id="proofs-h" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-500" aria-hidden />Confirm your teammates’ actions</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Look at the photo. If it shows what they logged, confirm it: only confirmed actions count for challenges and leaderboards.</p>
        {!data ? <div className="mt-3 h-24 skeleton rounded-xl" /> : data.teams === 0 ? (
          <Link href="/green/teams" className="btn-secondary btn-sm mt-3 inline-flex">Join or start a team</Link>
        ) : data.proofs.length === 0 ? <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">Nothing waiting. New photos from your teams show here.</p> : (
          <ul className="mt-3 space-y-3 lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:pe-1">
            {data.proofs.map((p) => { const f = GREEN_FACTORS[p.kind]; return (
              <li key={p.id} className="flex gap-3 items-center">
                <a href={p.photoUrl} target="_blank" rel="noreferrer" className="shrink-0"><Image src={p.photoUrl} alt={`Photo from ${p.by}: ${f?.label ?? 'climate action'}`} width={64} height={64} unoptimized className="w-16 h-16 rounded-xl object-cover bg-zinc-100 dark:bg-white/[0.05]" /></a>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block font-semibold text-zinc-900 dark:text-white truncate" translate="no">{p.by}</span>
                  <span className="block text-zinc-700 dark:text-zinc-200 truncate">{fmt(p.amount)} {f?.units} · {f?.label.toLowerCase()}</span>
                  <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 truncate" translate="no">{[p.note, formatDistanceToNow(new Date(p.createdAt), { addSuffix: true })].filter(Boolean).join(' · ')}</span>
                </span>
                <button type="button" disabled={busy === p.id} onClick={() => void confirm(p.id)} className="btn-primary btn-sm shrink-0">{busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}Confirm</button>
              </li>
            ); })}
          </ul>
        )}
      </div>
    </section>
  );
}

/** A little burst of leaves when an action is logged. */
function Burst() {
  const leaves = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ a: (i / 12) * Math.PI * 2, d: 60 + (i % 3) * 25 })), []);
  return (
    <motion.div initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ delay: 0.9, duration: 0.4 }} className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
      {leaves.map((l, i) => (
        <motion.span key={i} className="absolute" initial={{ x: 0, y: 0, scale: 0.4, rotate: 0 }} animate={{ x: Math.cos(l.a) * l.d, y: Math.sin(l.a) * l.d, scale: 1, rotate: 180 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}>
          <Leaf className="w-4 h-4 text-emerald-500" />
        </motion.span>
      ))}
    </motion.div>
  );
}

/** Everyone's actions on the map (0.1° areas): a green glow, brighter with more CO₂ saved. */
export function GreenMap() {
  const dark = useDarkMode();
  const calm = useReducedMotion();
  const { data } = useSWR<{ cells: { lat: number; lng: number; kg: number; actions: number; place: string | null }[] }>('/green/map', fetcher);
  const cells = useMemo(() => (data?.cells ?? []).map((c) => { const [bx, by] = toBase(c.lng, c.lat); return { ...c, bx, by }; }), [data]);
  const max = Math.max(1, ...cells.map((c) => c.kg));
  const draw = (f: Frame) => {
    const { ctx, t } = f, g = glow(EMERALD);
    const zf = Math.min(2.4, Math.max(1, Math.pow(f.zoom, 0.3)));
    ctx.save(); ctx.globalCompositeOperation = f.dark ? 'lighter' : 'source-over';
    cells.forEach((c, i) => {
      const x = f.sx(c.bx), y = f.sy(c.by);
      if (x < -40 || x > f.w + 40 || y < -40 || y > f.h + 40) return;
      const n = Math.sqrt(c.kg / max), r = (8 + n * 26) * zf * (calm ? 1 : 1 + 0.06 * Math.sin(t / 900 + i));
      ctx.globalAlpha = f.dark ? 0.3 + n * 0.5 : 0.2 + n * 0.35; ctx.drawImage(g, x - r, y - r, r * 2, r * 2);
    });
    ctx.restore();
    for (const c of cells) {
      const x = f.sx(c.bx), y = f.sy(c.by);
      if (x < 0 || x > f.w || y < 0 || y > f.h) continue;
      ctx.fillStyle = f.dark ? '#6ee7b7' : '#059669'; ctx.beginPath(); ctx.arc(x, y, 2 + Math.sqrt(c.kg / max) * 4, 0, Math.PI * 2); ctx.fill();
    }
  };
  return (
    <section className="panel overflow-hidden p-0" aria-labelledby="gmap-h">
      <div className="px-5 pt-5 pb-3 flex flex-wrap items-center gap-2">
        <h2 id="gmap-h" className="font-bold text-zinc-900 dark:text-white flex-1">Everyone’s actions</h2>
        <span className="text-xs text-zinc-500">{fmt(cells.reduce((a, c) => a + c.kg, 0))} kg CO₂ in the last 90 days</span>
      </div>
      <WorldCanvas label="Map of climate actions logged on UniVerse Green" homeBox={WORLD} dark={dark} live={!calm && cells.length > 0} draw={draw} className="w-full h-[46vh] min-h-[320px]">
        {data && cells.length === 0 && (
          <div className="absolute inset-x-3 bottom-3 sm:inset-x-auto sm:start-3 sm:w-[420px] rounded-2xl bg-white dark:bg-[#0b0b0c] p-4 shadow-xl border border-zinc-200/70 dark:border-white/10">
            <p className="text-sm text-zinc-700 dark:text-zinc-200">No actions on the map yet. Log one with “Put it on the shared map” and yours is the first light. It glows brighter as friends join.</p>
            <InviteButton app="green" text="I’m logging my climate actions on UniVerse Green and seeing the CO₂ I save. Join me:" label="Invite friends" className="mt-3 flex-wrap" />
          </div>
        )}
      </WorldCanvas>
    </section>
  );
}
