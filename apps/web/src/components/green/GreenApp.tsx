'use client';

import { useMemo, useRef, useState } from 'react';
import { Neighbourhood } from './Neighbourhood';
import useSWR from 'swr';
import Image from 'next/image';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Award, Bike, Bus, Camera, Clock, Download, Flame, RotateCcw, TrendingUp, Footprints, Globe2, Leaf, Loader2, Lock, MapPin, Minus, Plus, Recycle, ShieldCheck, Sun, Trash2, TreePine, Trophy, Utensils } from 'lucide-react';
import Link from '@/components/ui/Link';
import { api, errorMessage } from '@/lib/api';
import { celebrate } from '@/lib/celebrate';
import { authedJson } from '@/lib/authed-fetch';
import { shrinkImage } from '@/lib/shrink-image';
import { InviteButton } from '@/components/apps/InviteButton';
import { fetcher } from '@/lib/fetcher';
import { fmt } from '@/lib/instruments';
import { GREEN_FACTORS, GREEN_KINDS, PASS_TIERS, co2For, greenPass, type Feeling, type GreenKind } from '@/lib/green';
import { useAuthStore } from '@/store/auth';
import { useDarkMode } from '@/lib/use-dark';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';
import { GreenYear } from './GreenYear';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { Segmented } from '@/components/ui/Segmented';
import { actionsCsv, change, monthKg, months } from '@/lib/green-stats';
import { glow, toBase } from '@/components/trace/map/engine';
import { MapButtons } from '@/components/map-ui/Command';
import { WorldCanvas, type Box, type Frame, type MapHandle } from '@/components/trace/map/WorldCanvas';
import { Fill } from '@/components/ui/Fill';

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
  recent: { id: string; kind: GreenKind; amount: number; co2Kg: number; note: string | null; place: string | null; photoUrl: string | null; verifiedAt: string | null; feeling: Feeling | null; createdAt: string }[];
  teams: number;
  easiest: GreenKind | null;
  community: { kg: number; actions: number; people: number };
  /** M216: kg saved each day over the last year. */
  year?: Record<string, number>;
}

export const GREEN_ICON: Record<GreenKind, typeof Leaf> = { TREE: TreePine, CYCLE: Bike, TRANSIT: Bus, WALK: Footprints, RECYCLE: Recycle, SOLAR: Sun, MEATFREE: Utensils, CLEANUP: Trash2 };
const EMERALD = '#10b981';
const RECENT = 6;
const FELT: Record<Feeling, string> = { EASY: 'Easy', OK: 'Okay', HARD: 'Hard' };

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
  const [ask, setAsk] = useState<{ id: string; step: 'feel' | 'why' | 'share' } | null>(null);
  const [why, setWhy] = useState('');
  const [more, setMore] = useState(false);
  const [range, setRange] = useState<'days' | 'months'>('days');
  const [filter, setFilter] = useState<'all' | 'done' | 'wait' | 'none'>('all');
  const formRef = useRef<HTMLFormElement>(null);
  const f = GREEN_FACTORS[kind];
  const preview = co2For(kind, Number(amount) || 0);

  const log = async (e: React.FormEvent) => {
    e.preventDefault();
    const at = (e.nativeEvent as SubmitEvent).submitter, had = new Set(data?.badges.filter((b) => b.earned).map((b) => b.id));
    setSaving(true);
    const pos = share ? await new Promise<{ lat: number; lng: number } | null>((done) => navigator.geolocation ? navigator.geolocation.getCurrentPosition((g) => done({ lat: g.coords.latitude, lng: g.coords.longitude }), () => done(null), { timeout: 5000, maximumAge: 600_000 }) : done(null)) : null;
    try {
      const photoUrl = photo ? await uploadProof(photo) : undefined;
      const made = await api.post<{ id?: string }>('/green/actions', { kind, amount: Number(amount), note, photoUrl, ...(pos ?? {}) });
      toast.success(`Logged: ${preview} kg of CO₂ saved${photoUrl ? '. A teammate can confirm it now.' : ''}`);
      setNote(''); setPhoto(null); setBurst((b) => b + 1); setAsk(made.data?.id ? { id: made.data.id, step: 'feel' } : null);
      // A badge earned just now: a short celebration (src/lib/celebrate.ts).
      const won = (await mutate())?.badges.find((b) => b.earned && !had.has(b.id));
      if (won) { celebrate(at); toast.success(`New badge: ${won.label}`); }
    } catch (err) { toast.error(errorMessage(err, 'Could not log it.')); } finally { setSaving(false); }
  };
  const addPhoto = async (id: string, file: File | undefined) => {
    if (!file) return;
    try { await api.post(`/green/actions/${id}/proof`, { photoUrl: await uploadProof(file) }); toast.success('Photo added. A teammate can confirm it now.'); void mutate(); } catch (err) { toast.error(errorMessage(err, 'Could not add the photo.')); }
  };
  // "How did it go?" right after logging (M60), then like Candour (M61): "Hard" asks what made it
  // hard (private, for the owner), "Easy" offers to share the Pass. Answers count toward a badge.
  const feel = async (feeling: Feeling, note?: string) => {
    if (!ask) return;
    const { id } = ask, had = new Set(data?.badges.filter((b) => b.earned).map((b) => b.id));
    const first = note === undefined;
    setAsk(first && feeling === 'HARD' ? { id, step: 'why' } : first && feeling === 'EASY' ? { id, step: 'share' } : null);
    if (!first && !note) return; // "What made it hard?" skipped: "Hard" is already saved
    try {
      await api.post(`/green/actions/${id}/feeling`, { feeling, note });
      setWhy('');
      if (!first) toast.success('Thanks. That helps us make it easier.');
      else if (feeling === 'OK') toast.success('Thanks, noted.');
      const won = first ? (await mutate())?.badges.find((b) => b.earned && !had.has(b.id)) : undefined;
      if (won) toast.success(`New badge: ${won.label}`);
    } catch (err) { toast.error(errorMessage(err, 'Could not save that.')); }
  };
  const sharePass = async () => {
    setAsk(null);
    const p = data ? greenPass(data.totals) : null;
    const text = p ? `I'm a ${p.tier} on UniVerse: ${fmt(data!.totals.kg)} kg of CO₂ saved so far.` : 'I log my climate actions on UniVerse.';
    const url = `${location.origin}/green`;
    try {
      if (navigator.share) await navigator.share({ title: 'My Green Pass', text, url });
      else { await navigator.clipboard.writeText(`${text} ${url}`); toast.success('Copied. Paste it anywhere to share.'); }
    } catch { /* closed the share sheet */ }
  };
  const tryAgain = (k: GreenKind) => { setKind(k); formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  const remove = async (id: string) => {
    try { await api.delete(`/green/actions/${id}`); void mutate(); } catch (err) { toast.error(errorMessage(err, 'Could not delete it.')); }
  };

  const t = data?.totals;
  const c = data?.challenge;
  const daysLeft = c && now ? Math.max(0, Math.ceil((Date.parse(c.ends) - now) / 86_400_000)) : null;
  const maxDay = Math.max(1, ...(data?.perDay.map((d) => d.kg) ?? [1]));

  // M359 (the owner, 20 Nov: "redesign the green app… it doesnt look professional… more detailing"): a dashboard.
  // Four figures on top (saved in all, this month against last, the streak, how much is confirmed), logging beside the
  // week's challenge and the Green Pass, progress by day and month with what it came from, then everything I logged
  // (filtered, repeated, downloaded), the badges with what's left for each, my neighbourhood and teammates' proofs.
  const year = data?.year ?? {};
  const thisMonth = now ? monthKg(year, now) : 0, lastMonth = now ? monthKg(year, now, -1) : 0;
  const series = now ? months(year, now, 6) : [];
  const topMonth = Math.max(1, ...series.map((m) => m.kg));
  const confirmed = t && t.kg ? Math.round(((data?.verified.kg ?? 0) / t.kg) * 100) : 0;
  const days30 = data?.perDay ?? [], month30 = Math.round(days30.reduce((n, d) => n + d.kg, 0) * 10) / 10, active = days30.filter((d) => d.kg > 0).length;
  const best = days30.reduce<{ day: string; kg: number } | null>((b, d) => (d.kg > (b?.kg ?? 0) ? d : b), null);
  // One tap to log again what I log most (the last three different ones).
  const quick = (data?.recent ?? []).filter((a, i, all) => all.findIndex((b) => b.kind === a.kind) === i).slice(0, 3);
  const kinds = GREEN_KINDS.filter((k) => t?.kgByKind[k]).sort((a, b) => (t!.kgByKind[b] ?? 0) - (t!.kgByKind[a] ?? 0));
  const shown = (data?.recent ?? []).filter((a) => filter === 'all' || (filter === 'done' ? !!a.verifiedAt : filter === 'wait' ? !a.verifiedAt && !!a.photoUrl : !a.photoUrl));
  const again = (a: GreenMe['recent'][number]) => { setKind(a.kind); setAmount(String(a.amount)); setNote(a.note ?? ''); formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  const download = () => {
    const csv = actionsCsv((data?.recent ?? []).map((a) => ({ ...a, units: GREEN_FACTORS[a.kind]?.units ?? '' })));
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), el = document.createElement('a');
    el.href = url; el.download = 'green-actions.csv'; el.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">My impact</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{data ? `Everyone on UniVerse has saved ${fmt(data.community.kg)} kg of CO₂ in ${fmt(data.community.actions)} action${data.community.actions === 1 ? '' : 's'} by ${fmt(data.community.people)} ${data.community.people === 1 ? 'person' : 'people'} so far.` : ' '}</p>
        </div>
        <button type="button" onClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="btn-primary inline-flex items-center gap-2"><Plus className="h-4 w-4" aria-hidden />Log an action</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard title="CO₂ saved in all" icon={Leaf} value={t ? `${fmt(t.kg)} kg` : '…'} sub={t ? `Like ${fmt(Math.round(t.kg / 22))} trees for a year, or ${fmt(Math.round(t.kg / 0.2))} km not driven` : undefined} />
        <KpiCard title="This month" icon={TrendingUp} value={`${fmt(thisMonth)} kg`} change={change(thisMonth, lastMonth) ?? undefined} sub={lastMonth ? `${fmt(lastMonth)} kg last month` : 'Nothing last month to compare with'} />
        <KpiCard title="Streak" icon={Flame} value={`${t?.streak ?? 0} ${t?.streak === 1 ? 'day' : 'days'}`} sub={t?.streak ? 'Log something today to keep it' : 'Log an action to start one'} />
        <KpiCard title="Confirmed" icon={ShieldCheck} value={`${confirmed}%`} sub={data ? `${fmt(data.verified.actions)} of ${fmt(t?.actions ?? 0)} actions checked by a teammate` : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <form ref={formRef} onSubmit={(e) => void log(e)} className="panel relative flex flex-col overflow-hidden p-5" aria-labelledby="log-h">
          <div className="flex items-baseline justify-between gap-2"><h2 id="log-h" className="text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-white">Log an action</h2><span className="text-xs text-zinc-600 dark:text-zinc-300">CO₂ worked out from the factor shown</span></div>
          <div className="mt-3 grid grid-cols-4 gap-2" role="radiogroup" aria-label="What you did">
            {GREEN_KINDS.map((k) => { const I = GREEN_ICON[k]; return (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={cn('flex flex-col items-center gap-1 rounded-2xl border py-3 text-[11px] font-semibold transition active:scale-95', kind === k ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200 shadow-[0_6px_20px_-10px_#10b981]' : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300')}>
                <I className="w-5 h-5" aria-hidden /><span className="text-center leading-tight px-1">{GREEN_FACTORS[k].label.split(' ').slice(0, 2).join(' ')}</span>
              </button>
            ); })}
          </div>
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-3 items-end">
            <label className="block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">How many {f.units}</span><input type="number" min={0.1} max={f.max} step="any" required value={amount} onChange={(e) => setAmount(e.target.value)} className="input mt-1" /></label>
            <div className="text-right pb-1"><p className="font-mono text-2xl tabular-nums text-emerald-600 dark:text-emerald-400">−{preview} kg</p><p className="text-[10px] text-zinc-500">CO₂</p></div>
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">{f.how}.</p>
          <details className="group mt-3 rounded-2xl ring-1 ring-zinc-200 open:pb-3 dark:ring-white/10" open={more} onToggle={(e) => setMore((e.currentTarget as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-semibold text-zinc-800 dark:text-zinc-100">Note, photo proof and the map <span className="font-normal text-zinc-600 dark:text-zinc-300">(optional)</span></summary>
          <div className="px-3">
          <label className="block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Note</span><input maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className="input mt-1" placeholder="To work and back" /></label>
          <label className="mt-3 flex items-center gap-3 rounded-2xl border border-dashed border-zinc-300 dark:border-white/15 px-3 py-2.5 cursor-pointer hover:border-emerald-500/60 transition-colors">
            <Camera className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <span className="min-w-0 flex-1 text-xs text-zinc-600 dark:text-zinc-300"><span className="block font-semibold text-zinc-800 dark:text-zinc-100">{photo ? photo.name : 'Add a photo as proof'}</span>A teammate confirms it, then it counts for the challenge and the leaderboards.</span>
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </label>
          <label className="mt-3 flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="w-4 h-4 accent-emerald-500" /><MapPin className="w-3.5 h-3.5" aria-hidden />Put it on the shared map (about 11 km away from where I am)</label>
          </div>
          </details>
          <button type="submit" disabled={saving} className="mt-4 w-full h-11 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Leaf className="w-4 h-4" />}Log it</button>
          <AnimatePresence>
            {ask && (
              <motion.div key={`${ask.id}-${ask.step}`} role="group" aria-labelledby="felt-h" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-emerald-500/[0.08] px-3 py-2.5">
                {ask.step === 'feel' ? (<>
                  <span id="felt-h" className="me-auto text-sm font-semibold text-zinc-800 dark:text-zinc-100">How did it go?</span>
                  {(Object.keys(FELT) as Feeling[]).map((k) => <button key={k} type="button" onClick={() => void feel(k)} className="btn-secondary btn-sm">{FELT[k]}</button>)}
                  <button type="button" onClick={() => setAsk(null)} className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 underline-offset-2 hover:underline px-1">Skip</button>
                </>) : ask.step === 'why' ? (<>
                  <label htmlFor="felt-why" id="felt-h" className="w-full text-sm font-semibold text-zinc-800 dark:text-zinc-100">What made it hard? <span className="font-normal text-zinc-600 dark:text-zinc-300">Only the UniVerse team reads this, without your name.</span></label>
                  <input id="felt-why" maxLength={300} value={why} onChange={(e) => setWhy(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void feel('HARD', why.trim()); } }} className="input flex-1 min-w-0" placeholder="No bike lane on my way" />
                  <button type="button" onClick={() => void feel('HARD', why.trim())} className="btn-secondary btn-sm">{why.trim() ? 'Send' : 'Skip'}</button>
                </>) : (<>
                  <span id="felt-h" className="me-auto text-sm font-semibold text-zinc-800 dark:text-zinc-100">Glad it was easy. Share your Green Pass?</span>
                  <button type="button" onClick={() => void sharePass()} className="btn-secondary btn-sm">Share</button>
                  <button type="button" onClick={() => setAsk(null)} className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 underline-offset-2 hover:underline px-1">Not now</button>
                </>)}
              </motion.div>
            )}
          </AnimatePresence>
          {quick.length > 0 && (
            <div className="mt-auto pt-4">
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Again, in one tap</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {quick.map((a) => { const I = GREEN_ICON[a.kind] ?? Leaf; return (
                  <button key={a.id} type="button" onClick={() => again(a)} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><I className="h-4 w-4 text-emerald-700 dark:text-emerald-300" aria-hidden />{fmt(a.amount)} {GREEN_FACTORS[a.kind]?.units} {GREEN_FACTORS[a.kind]?.label.split(' ')[0].toLowerCase()}</button>
                ); })}
              </div>
            </div>
          )}
          <AnimatePresence>{burst > 0 && <Burst key={burst} />}</AnimatePresence>
        </form>

        <div className="flex flex-col gap-5">
          {c && (
            <section className="panel p-5" aria-labelledby="ch-h">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="ch-h" className="flex items-center gap-2 text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-white"><Trophy className="h-4 w-4 text-amber-500" aria-hidden />This week’s challenge</h2>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{c.title}{daysLeft !== null ? ` · ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left` : ''}</p>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-sm font-semibold tabular-nums text-emerald-800 dark:text-emerald-200">{c.goal ? Math.min(100, Math.round((c.mine / c.goal) * 100)) : 0}%</span>
              </div>
              {[['You', c.mine], ...(c.team !== null ? [['Your teams', c.team] as const] : [])].map(([who, v]) => (
                <div key={who as string} className="mt-3">
                  <div className="flex justify-between text-xs text-zinc-600 dark:text-zinc-300"><span>{who as string}</span><span className="tabular-nums">{v as number} / {c.goal} {c.unit}</span></div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.07]"><Fill value={Math.min(1, (v as number) / Math.max(1, c.goal))} className="h-full rounded-full bg-emerald-500" /></div>
                </div>
              ))}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <p className="me-auto text-xs text-zinc-600 dark:text-zinc-300">Confirmed actions only.{c.waiting > 0 ? ` ${fmt(c.waiting)} ${c.unit} wait for a teammate.` : ''}</p>
                <button type="button" onClick={() => tryAgain(c.kind)} className="btn-secondary btn-sm">Log for it</button>
                {c.team === null && <Link href="/student/life/green?view=teams" className="btn-ghost btn-sm">Join a team</Link>}
              </div>
            </section>
          )}
          {data ? <PassSection totals={data.totals} easiest={data.easiest} onTry={tryAgain} /> : <div aria-hidden className="panel skeleton h-60" />}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="panel flex flex-col p-5" aria-labelledby="days-h">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="days-h" className="text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-white">Progress</h2>
            <Segmented<'days' | 'months'> label="Show" value={range} onChange={setRange} segments={[{ value: 'days', label: 'Last 30 days' }, { value: 'months', label: '6 months' }]} />
          </div>
          {range === 'days' ? (
            <div className="mt-5 flex h-40 items-end gap-1" role="img" aria-label={`CO₂ saved each day for 30 days: ${fmt((data?.perDay ?? []).reduce((n, d) => n + d.kg, 0))} kg in all`}>
              {(data?.perDay ?? Array.from({ length: 30 }, () => ({ day: '', kg: 0 }))).map((d, i) => (
                <span key={i} className="flex-1 rounded-t bg-emerald-500/85" style={{ height: `${Math.max(2, (d.kg / maxDay) * 100)}%` }} title={`${d.day}: ${d.kg} kg`} />
              ))}
            </div>
          ) : (
            <ol className="mt-5 grid h-40 grid-cols-6 items-end gap-3" aria-label="CO₂ saved each month">
              {series.map((m) => (
                <li key={m.label} className="flex h-full flex-col items-center justify-end gap-1.5">
                  <span className="text-xs font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">{fmt(m.kg)}</span>
                  <span className="w-full rounded-t bg-emerald-500/85" style={{ height: `${Math.max(2, (m.kg / topMonth) * 78)}%` }} aria-hidden />
                  <span className="text-xs text-zinc-600 dark:text-zinc-300">{m.label}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-300">kg of CO₂ saved, by the factors in Green living’s methods (DEFRA, EPA, Our World in Data).</p>
          <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-zinc-100 pt-4 sm:grid-cols-4 dark:border-white/[0.06]">
            {[['30 days', `${fmt(month30)} kg`], ['Best day', best ? `${fmt(best.kg)} kg` : '–'], ['Days active', `${active} of 30`], ['Per active day', active ? `${fmt(Math.round((month30 / active) * 10) / 10)} kg` : '–']].map(([k, v]) => (
              <div key={k}><dt className="text-xs text-zinc-600 dark:text-zinc-300">{k}</dt><dd className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-900 dark:text-white">{v}</dd></div>
            ))}
          </dl>
        </section>

        <section className="panel p-5" aria-labelledby="kinds-h">
          <h2 id="kinds-h" className="text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-white">Where it came from</h2>
          {!kinds.length ? <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">Your actions by kind show here once you log one.</p> : (
            <ul className="mt-4 space-y-3">
              {kinds.map((k) => { const I = GREEN_ICON[k], kg = t!.kgByKind[k] ?? 0; return (
                <li key={k}>
                  <button type="button" onClick={() => tryAgain(k)} className="w-full text-start" title="Log this again">
                    <span className="flex items-center gap-2.5 text-sm"><I className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden /><span className="flex-1 truncate text-zinc-800 dark:text-zinc-100">{GREEN_FACTORS[k].label}</span><span className="tabular-nums text-zinc-600 dark:text-zinc-300">{fmt(t!.byKind[k] ?? 0)} {GREEN_FACTORS[k].units}</span><span className="w-20 text-end font-semibold tabular-nums text-zinc-900 dark:text-white">{kg.toFixed(1)} kg</span></span>
                    <span className="mt-1.5 ms-6.5 block h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.07]"><Fill value={kg / (t!.kg || 1)} className="h-full rounded-full bg-emerald-500" /></span>
                  </button>
                </li>
              ); })}
            </ul>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="panel flex flex-col p-0" aria-labelledby="recent-h">
          <header className="flex flex-wrap items-center gap-2 px-5 pb-3 pt-5">
            <h2 id="recent-h" className="me-auto text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-white">What you did</h2>
            <Segmented<'all' | 'done' | 'wait' | 'none'> label="Show actions" className="max-w-full overflow-x-auto" value={filter} onChange={setFilter} segments={[{ value: 'all', label: 'All' }, { value: 'done', label: 'Confirmed' }, { value: 'wait', label: 'Waiting' }, { value: 'none', label: 'No proof' }]} />
            <button type="button" onClick={download} disabled={!data?.recent.length} className="btn-ghost btn-sm inline-flex items-center gap-1.5"><Download className="h-4 w-4" aria-hidden />CSV</button>
          </header>
          {!data ? <div className="mx-5 mb-5 h-40 skeleton rounded-xl" /> : shown.length === 0 ? <p className="px-5 pb-5 text-sm text-zinc-600 dark:text-zinc-300">{data.recent.length ? 'Nothing with this filter.' : 'Nothing yet. Your first action shows here.'}</p> : (
            <ul className="max-h-[26rem] divide-y divide-zinc-100 overflow-y-auto border-t border-zinc-100 dark:divide-white/[0.06] dark:border-white/[0.06]">
              {shown.map((a, i) => { const I = GREEN_ICON[a.kind] ?? Leaf; return (
                <li key={a.id} className={cn('group flex items-center gap-3 px-5 py-2.5 text-sm', i >= RECENT && !allRecent && 'max-lg:hidden')}>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><I className="h-4 w-4" aria-hidden /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-zinc-900 dark:text-white">{fmt(a.amount)} {GREEN_FACTORS[a.kind]?.units} · {GREEN_FACTORS[a.kind]?.label.toLowerCase()}</span><span className="block truncate text-xs text-zinc-600 dark:text-zinc-300">{[a.note, a.feeling && `felt ${FELT[a.feeling].toLowerCase()}`, formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })].filter(Boolean).join(' · ')}</span></span>
                  {a.verifiedAt ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200"><ShieldCheck className="h-3.5 w-3.5" aria-hidden />Confirmed</span>
                    : a.photoUrl ? <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-200"><Clock className="h-3.5 w-3.5" aria-hidden />Waiting</span>
                    : <label className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-zinc-200 px-2 py-0.5 text-xs font-semibold text-zinc-700 hover:border-emerald-500/60 dark:border-white/10 dark:text-zinc-200"><Camera className="h-3.5 w-3.5" aria-hidden />Add proof<input type="file" accept="image/*" className="sr-only" onChange={(e) => void addPhoto(a.id, e.target.files?.[0])} /></label>}
                  <span className="w-16 text-end font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">−{a.co2Kg} kg</span>
                  <button type="button" onClick={() => again(a)} aria-label={`Log ${GREEN_FACTORS[a.kind]?.label.toLowerCase()} again`} title="Log it again" className="grid h-7 w-7 place-items-center rounded-full text-zinc-500 hover:bg-emerald-500/10 hover:text-emerald-700"><RotateCcw className="h-3.5 w-3.5" aria-hidden /></button>
                  <button type="button" onClick={() => void remove(a.id)} aria-label="Delete this action" className="grid h-7 w-7 place-items-center rounded-full text-zinc-500 hover:bg-rose-500/10 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
                </li>
              ); })}
            </ul>
          )}
          {data && shown.length > RECENT && <button type="button" onClick={() => setAllRecent((v) => !v)} className="btn-secondary btn-sm mx-5 mb-4 mt-2 lg:hidden">{allRecent ? 'Show less' : `Show all ${shown.length}`}</button>}
        </section>

        <section className="panel p-5" aria-labelledby="badges-h">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="badges-h" className="text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-white">Badges</h2>
            <span className="text-sm tabular-nums text-zinc-600 dark:text-zinc-300">{data?.badges.filter((b) => b.earned).length ?? 0} of {data?.badges.length ?? 0}</span>
          </div>
          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(data?.badges ?? []).map((b) => (
              <li key={b.id} className={cn('flex items-start gap-2.5 rounded-xl p-2.5 ring-1', b.earned ? 'bg-emerald-500/[0.07] ring-emerald-500/25' : 'ring-zinc-200 dark:ring-white/10')}>
                {b.earned ? <Award className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden /> : <Lock className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" aria-hidden />}
                <span className="min-w-0"><span className="block text-sm font-semibold text-zinc-900 dark:text-white">{b.label}<span className="sr-only">{b.earned ? ', earned' : ', not yet'}</span></span><span className="block text-xs text-zinc-600 dark:text-zinc-300">{b.text}</span></span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Neighbourhood />
        <TeamProofs onDone={() => void mutate()} />
      </div>

      {/* M216: the year at a glance, what it means, a picture of it. */}
      {data && t && <GreenYear year={data.year ?? {}} totals={t} />}

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
          <Link href="/student/life/green?view=teams" className="btn-secondary btn-sm mt-3 inline-flex">Join or start a team</Link>
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

/** The Green Pass (M60, after the owner's "Candour" idea): a collectable card. Its tier grows with
 *  the CO₂ saved; a stamp for each kind of action ever logged, eight to collect. Leans toward the
 *  pointer on computers (transform only; still with Reduce Motion). */
function PassSection({ totals, easiest, onTry }: { totals: GreenMe['totals']; easiest: GreenKind | null; onTry: (k: GreenKind) => void }) {
  const name = useAuthStore((s) => s.user?.name) ?? 'You';
  const id = useAuthStore((s) => s.user?.id) ?? '';
  const reduce = useReducedMotion();
  const p = greenPass(totals);
  const missing = GREEN_KINDS.filter((k) => !p.stamps.includes(k));
  // A stable member number from the account id (not the id itself).
  const no = useMemo(() => { let h = 2166136261; for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return String(h >>> 0).padStart(10, '0').replace(/(\d{4})(\d{4})(\d{2})/, '$1 $2 $3'); }, [id]);
  // The card leans towards the mouse: written straight to its style (a re-render per move stuttered).
  const lean = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType !== 'mouse') return;
    const el = e.currentTarget, r = el.getBoundingClientRect();
    el.style.transform = `rotateX(${((e.clientY - r.top) / r.height - 0.5) * -8}deg) rotateY(${((e.clientX - r.left) / r.width - 0.5) * 10}deg)`;
  };
  return (
    <section className="panel p-5 grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,340px)_1fr] lg:grid-cols-1 2xl:grid-cols-[minmax(0,300px)_1fr] items-center" aria-labelledby="pass-h">
      <div style={{ perspective: 900 }}>
        <div
          onPointerMove={lean} onPointerLeave={(e) => { e.currentTarget.style.transform = ''; }}
          style={{ background: 'radial-gradient(90% 120% at 100% 0%, rgba(240,204,138,0.28), transparent 55%), linear-gradient(135deg, #111113 0%, #0d3a33 70%, #0f5a45 100%)' }}
          className="relative h-[212px] rounded-[22px] p-5 text-white shadow-[0_24px_50px_-24px_rgba(16,185,129,0.6)] ring-1 ring-white/10 overflow-hidden transition-transform duration-200 ease-out"
        >
          <span aria-hidden className="absolute -end-10 -bottom-16 w-48 h-48 rounded-full border border-white/10" />
          <span aria-hidden className="absolute -end-2 -bottom-8 w-32 h-32 rounded-full border border-white/10" />
          <div className="relative flex items-center gap-2 text-sm font-bold"><Leaf className="w-4 h-4 text-emerald-300" aria-hidden />Green Pass<span className="ms-auto text-xs font-semibold text-emerald-100/80">Level {p.level} of {PASS_TIERS.length}</span></div>
          <p className="relative mt-3 text-3xl font-extrabold tracking-tight">{p.tier}</p>
          <p className="relative text-sm text-emerald-50/80 truncate" translate="no">{name}</p>
          <ul className="relative mt-4 flex gap-1.5" aria-label={`${p.stamps.length} of ${GREEN_KINDS.length} stamps`}>
            {GREEN_KINDS.map((k) => { const I = GREEN_ICON[k], has = p.stamps.includes(k); return (
              <li key={k} title={GREEN_FACTORS[k].label} className={cn('w-7 h-7 rounded-full grid place-items-center', has ? 'bg-emerald-300 text-[#0d3a33] shadow-[0_0_12px_rgba(110,231,183,0.6)]' : 'border border-dashed border-white/30 text-white/40')}>
                <I className="w-3.5 h-3.5" aria-hidden /><span className="sr-only">{GREEN_FACTORS[k].label}: {has ? 'collected' : 'not yet'}</span>
              </li>
            ); })}
          </ul>
          <p className="absolute bottom-4 start-5 font-mono text-[11px] tracking-widest text-emerald-100/70" aria-hidden>GP {no}</p>
        </div>
      </div>
      <div className="min-w-0">
        <h2 id="pass-h" className="font-bold text-zinc-900 dark:text-white">Your Green Pass</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{p.next ? <>{fmt(p.next.kgToGo)} kg of CO₂ to go until <b className="text-zinc-900 dark:text-white">{p.next.label}</b>.</> : 'Forest: the top level. Thank you.'}</p>
        <div className="mt-2 h-2 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden" role="progressbar" aria-label={`Progress to ${p.next?.label ?? 'the top'}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.progress * 100)}>
          <div className="h-full rounded-full bg-emerald-500 origin-left rtl:origin-right transition-transform duration-500 ease-out" style={{ transform: `scaleX(${p.progress})` }} />
        </div>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300"><b className="font-mono text-zinc-900 dark:text-white">{p.stamps.length}/{GREEN_KINDS.length}</b> stamps. {missing.length ? `Still to collect: ${missing.map((k) => GREEN_FACTORS[k].label.toLowerCase()).join(', ')}.` : 'Every stamp collected.'}</p>
        {easiest && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            {GREEN_FACTORS[easiest].label} felt easy for you.
            <button type="button" onClick={() => onTry(easiest)} className="btn-secondary btn-sm">Log it again</button>
          </p>
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
  const { data } = useSWR<{ cells: { lat: number; lng: number; kg: number; actions: number; place: string | null }[] }>('/green/map', fetcher);
  const cells = useMemo(() => (data?.cells ?? []).map((c) => { const [bx, by] = toBase(c.lng, c.lat); return { ...c, bx, by }; }), [data]);
  const max = Math.max(1, ...cells.map((c) => c.kg));
  // M172: each place says what was saved there: a card under the pointer, the name and kilograms close in.
  const frame = useRef<Frame | null>(null), hoverView = useRef('');
  const [hover, setHover] = useState<{ i: number; x: number; y: number; mw: number } | null>(null);
  const viewKey = (f: Frame) => `${f.view.k.toFixed(4)},${f.view.x.toFixed(1)},${f.view.y.toFixed(1)}`;
  const onPoint = (pt: { x: number; y: number } | null, kind: 'hover' | 'click') => {
    const f = frame.current;
    if (!f) return;
    let best = -1, bd = 18;
    if (pt) cells.forEach((c, i) => { const d = Math.hypot(pt.x - f.sx(c.bx), pt.y - f.sy(c.by)); if (d < bd) { bd = d; best = i; } });
    if (kind === 'click') { if (best >= 0) { const c = cells[best]; mapRef.current?.flyTo([c.lng - 0.4, c.lat - 0.25, c.lng + 0.4, c.lat + 0.25], { maxZoom: 120 }); } return; }
    if (best !== (hover?.i ?? -1)) { hoverView.current = best >= 0 ? viewKey(f) : ''; setHover(best >= 0 ? { i: best, x: f.sx(cells[best].bx), y: f.sy(cells[best].by), mw: f.w } : null); }
  };
  const mapRef = useRef<MapHandle>(null);
  const draw = (f: Frame) => {
    frame.current = f;
    if (hoverView.current && hoverView.current !== viewKey(f)) { hoverView.current = ''; setHover(null); }
    const { ctx } = f, g = glow(EMERALD);
    const zf = Math.min(2.4, Math.max(1, Math.pow(f.zoom, 0.3)));
    ctx.save(); ctx.globalCompositeOperation = f.dark ? 'lighter' : 'source-over';
    cells.forEach((c) => {
      const x = f.sx(c.bx), y = f.sy(c.by);
      if (x < -40 || x > f.w + 40 || y < -40 || y > f.h + 40) return;
      const n = Math.sqrt(c.kg / max), r = (8 + n * 26) * zf; // M225: still (they breathed: the whole map redrawn on the page's thread every frame)
      ctx.globalAlpha = f.dark ? 0.3 + n * 0.5 : 0.2 + n * 0.35; ctx.drawImage(g, x - r, y - r, r * 2, r * 2);
    });
    ctx.restore();
    for (const c of cells) {
      const x = f.sx(c.bx), y = f.sy(c.by);
      if (x < 0 || x > f.w || y < 0 || y > f.h) continue;
      const r = 2 + Math.sqrt(c.kg / max) * 4;
      ctx.fillStyle = f.dark ? '#6ee7b7' : '#059669'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      if (f.zoom > 16 && c.place) {
        const text = `${c.place} · −${fmt(c.kg)} kg`;
        ctx.font = '600 11px ui-sans-serif, system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = 3;
        ctx.strokeStyle = f.dark ? 'rgba(10,10,12,0.9)' : 'rgba(255,255,255,0.95)'; ctx.strokeText(text, x + r + 5, y);
        ctx.fillStyle = f.dark ? '#d1fae5' : '#064e3b'; ctx.fillText(text, x + r + 5, y);
      }
    }
  };
  const hc = hover ? cells[hover.i] : null;
  return (
    <section className="panel overflow-hidden p-0" aria-labelledby="gmap-h">
      <div className="px-5 pt-5 pb-3 flex flex-wrap items-center gap-2">
        <h2 id="gmap-h" className="font-bold text-zinc-900 dark:text-white flex-1">Everyone’s actions</h2>
        <span className="text-xs text-zinc-500">{fmt(cells.reduce((a, c) => a + c.kg, 0))} kg CO₂ in the last 90 days</span>
      </div>
      <WorldCanvas ref={mapRef} label="Map of climate actions logged on UniVerse" homeBox={WORLD} dark={dark} live={false} draw={draw} onPoint={onPoint} className="w-full h-[46vh] min-h-[320px]">
        <MapButtons className="absolute end-3 top-3 z-10" items={[{ label: 'Zoom in', icon: Plus, onClick: () => mapRef.current?.zoomBy(1.8) }, { label: 'Zoom out', icon: Minus, onClick: () => mapRef.current?.zoomBy(1 / 1.8) }, { label: 'See everything', icon: Globe2, onClick: () => mapRef.current?.home() }]} />
        <AnimatePresence>
          {hover && hc && (
            <motion.div key={hover.i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-none absolute z-10 w-56 rounded-xl border border-zinc-200/70 bg-white/95 p-3 text-xs text-zinc-600 shadow-xl dark:border-white/10 dark:bg-[#111113]/95 dark:text-zinc-300"
              style={{ left: Math.max(8, Math.min(hover.x + 14, hover.mw - 236)), top: hover.y > 130 ? hover.y - 14 : hover.y + 16, translate: hover.y > 130 ? '0 -100%' : undefined, transformOrigin: hover.y > 130 ? 'left bottom' : 'left top' }}>
              <p className="font-semibold text-sm text-zinc-900 dark:text-white" translate="no">{hc.place ?? 'Around here'}</p>
              <p className="mt-1 font-mono text-emerald-700 dark:text-emerald-300">−{fmt(hc.kg)} kg CO₂</p>
              <p>{hc.actions.toLocaleString()} {hc.actions === 1 ? 'action' : 'actions'} in the last 90 days · within about 10 km</p>
              <p className="mt-1.5 font-medium text-zinc-500">Click to zoom in</p>
            </motion.div>
          )}
        </AnimatePresence>
        {data && cells.length === 0 && (
          <div className="absolute inset-x-3 bottom-3 sm:inset-x-auto sm:start-3 sm:w-[420px] rounded-2xl bg-white dark:bg-[#111113] p-4 shadow-xl border border-zinc-200/70 dark:border-white/10">
            <p className="text-sm text-zinc-700 dark:text-zinc-200">No actions on the map yet. Log one with “Put it on the shared map” and yours is the first light. It glows brighter as friends join.</p>
            <InviteButton app="campus" text="I’m logging my climate actions on UniVerse and seeing the CO₂ I save. Join me:" label="Invite friends" className="mt-3 flex-wrap" />
          </div>
        )}
      </WorldCanvas>
    </section>
  );
}
