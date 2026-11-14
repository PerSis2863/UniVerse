'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { m as motion } from 'framer-motion';
import { BellRing, HandHeart, Inbox, Loader2, LocateFixed } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import Link from '@/components/ui/Link';
import { PostCard, type ReliefPost } from '@/components/relief/ReliefApp';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { RELIEF_KINDS, RELIEF_KIND_LABEL, SKILLS, SKILL_LABEL, type ReliefKind, type Skill } from '@/lib/relief';
import { cn } from '@/lib/utils';
import { useNow } from '@/lib/use-now';

// UniVerse Relief → mine: what I asked for or offered, and the needs I'm helping with (src/server/relief.ts).

const STATUS: Record<string, string> = { OPEN: 'Waiting', TAKEN: 'Someone’s helping', DONE: 'Delivered', CLOSED: 'Closed' };

export default function ReliefMinePage() {
  const now = useNow();
  const { data, mutate } = useSWR<{ mine: ReliefPost[]; helping: ReliefPost[]; helped: number }>('/relief/mine', fetcher);
  const list = (rows: ReliefPost[], empty: string) => (
    !data ? <div className="panel h-32 skeleton" /> : rows.length === 0 ? <p className="panel p-6 text-sm text-zinc-500 text-center">{empty}</p> : (
      <div className="grid md:grid-cols-2 gap-3">
        {rows.map((p, i) => (
          <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }} className="panel p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{STATUS[p.status] ?? p.status}</p>
            <PostCard p={p} now={now} here={null} onChange={() => void mutate()} />
          </motion.div>
        ))}
      </div>
    )
  );
  return (
    <>
      <Topbar title="My requests & tasks" subtitle={data ? `You’ve helped ${data.helped} ${data.helped === 1 ? 'person' : 'people'}` : 'What you asked for and who you’re helping'} />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="w-full space-y-8">
          <Alerts />
          <section aria-labelledby="helping-h">
            <h2 id="helping-h" className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2"><HandHeart className="w-5 h-5 text-orange-500" aria-hidden />I’m helping</h2>
            <div className="mt-3">{list(data?.helping ?? [], 'You aren’t helping with anything yet. The live map shows the most urgent needs first.')}</div>
          </section>
          <section aria-labelledby="mine-h">
            <h2 id="mine-h" className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Inbox className="w-5 h-5 text-orange-500" aria-hidden />My posts</h2>
            <div className="mt-3">{list(data?.mine ?? [], 'Nothing posted yet.')}</div>
          </section>
          <Link href="/relief" className="btn-primary inline-flex">Open the live map</Link>
        </div>
      </div>
    </>
  );
}

interface Watch { lat: number; lng: number; radiusKm: number; urgentOnly: boolean; kinds: string | null; skills?: string | null; email?: boolean; smsTo?: string | null }

/** "Tell me about needs near me" (PUT /relief/watch): a place, a radius, urgent only or all, which kinds. */
function Alerts() {
  const { data, mutate, isLoading } = useSWR<Watch | null>('/relief/watch', fetcher);
  const [radius, setRadius] = useState<number | null>(null);
  const [urgentOnly, setUrgentOnly] = useState<boolean | null>(null);
  const [kinds, setKinds] = useState<Set<ReliefKind> | null>(null);
  const [skills, setSkills] = useState<Set<Skill> | null>(null);
  const [email, setEmail] = useState<boolean | null>(null);
  const [sms, setSms] = useState<boolean | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const { data: smsOn } = useSWR<{ on: boolean }>('/relief/sms', fetcher);
  const [busy, setBusy] = useState(false);
  const r = radius ?? data?.radiusKm ?? 5, u = urgentOnly ?? data?.urgentOnly ?? true;
  const k = kinds ?? new Set((data?.kinds?.split(',') ?? []) as ReliefKind[]);
  const sk = skills ?? new Set((data?.skills?.split(',') ?? []) as Skill[]);
  const em = email ?? data?.email ?? false;
  const tx = sms ?? !!data?.smsTo, num = phone ?? data?.smsTo ?? '';
  const save = (pos: { lat: number; lng: number }) => {
    setBusy(true);
    api.put('/relief/watch', { ...pos, radiusKm: r, urgentOnly: u, kinds: [...k], skills: [...sk], email: em, ...(smsOn?.on ? { sms: tx, smsTo: num } : {}) })
      .then(() => { toast.success(`Alerts on: new ${u ? 'urgent ' : ''}needs within ${r} km`); void mutate(); })
      .catch((e) => toast.error(errorMessage(e, 'Could not save the alert.')))
      .finally(() => setBusy(false));
  };
  const locate = () => {
    if (data) { save({ lat: data.lat, lng: data.lng }); return; }
    if (!('geolocation' in navigator)) { toast.error('This device can’t share its location.'); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition((g) => save({ lat: g.coords.latitude, lng: g.coords.longitude }), () => { setBusy(false); toast.error('Allow location for this site to set your area.'); }, { timeout: 10_000, maximumAge: 600_000 });
  };
  const off = () => { setBusy(true); api.delete('/relief/watch').then(() => { toast('Alerts off'); void mutate(null, false); }).catch((e) => toast.error(errorMessage(e, 'Could not turn it off.'))).finally(() => setBusy(false)); };
  const toggle = (x: ReliefKind) => { const n = new Set(k); if (n.has(x)) n.delete(x); else n.add(x); setKinds(n); };
  const toggleSkill = (x: Skill) => { const n = new Set(sk); if (n.has(x)) n.delete(x); else n.add(x); setSkills(n); };
  return (
    <section className={cn('panel p-5', data && 'ring-1 ring-orange-500/30')} aria-labelledby="alerts-h">
      <div className="flex flex-wrap items-start gap-3">
        <span className="w-10 h-10 shrink-0 grid place-items-center rounded-xl bg-orange-500/12 text-orange-600 dark:text-orange-300"><BellRing className="w-5 h-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h2 id="alerts-h" className="font-bold text-zinc-900 dark:text-white">Tell me about needs near me</h2>
          <p className="text-sm text-zinc-500">{isLoading ? '…' : data ? `On: new ${data.urgentOnly ? 'urgent ' : ''}needs within ${data.radiusKm} km of the place you set reach your phone${data.email ? ' and your email' : ''}.` : 'Get a notification when someone near you asks for help. Your place is rounded to about 500 m and never shown to anyone.'}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="text-sm text-zinc-600 dark:text-zinc-300">Within
          <select value={r} onChange={(e) => setRadius(Number(e.target.value))} className="input ms-2 inline-block w-auto py-1.5">{[1, 2, 5, 10, 25].map((n) => <option key={n} value={n}>{n} km</option>)}</select>
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300"><input type="checkbox" checked={u} onChange={(e) => setUrgentOnly(e.target.checked)} className="accent-orange-500" />Urgent only</label>
        {/* M152: by email too (off by default: these can come often) */}
        <label className="inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300"><input type="checkbox" checked={em} onChange={(e) => setEmail(e.target.checked)} className="accent-orange-500" />Also email me</label>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Which kinds (none chosen means all)">
        {RELIEF_KINDS.map((x) => (
          <button key={x} type="button" aria-pressed={k.has(x)} onClick={() => toggle(x)} className={cn('rounded-full px-3 py-1 text-xs font-semibold transition-colors', k.has(x) ? 'bg-orange-500 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10')}>{RELIEF_KIND_LABEL[x]}</button>
        ))}
      </div>
      {/* M153: a text in an emergency, only when the owner has emergency texts on */}
      {smsOn?.on && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300"><input type="checkbox" checked={tx} onChange={(e) => setSms(e.target.checked)} className="accent-orange-500" />Text me in an emergency</label>
          {tx && <input type="tel" inputMode="tel" autoComplete="tel" value={num} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" aria-label="Your phone number, with the country code" className="input w-52 py-1.5" />}
          {tx && <p className="basis-full text-xs text-zinc-500 dark:text-zinc-400">One text when an organisation declares an emergency near you. Your number is never shown to anyone.</p>}
        </div>
      )}
      {/* M149: helpers with a skill hear when a need nearby asks for it, whatever they filtered above */}
      <p className="mt-4 text-sm font-medium text-zinc-700 dark:text-zinc-200">What I can do</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">When a need near you asks for one of these, you hear about it even if it isn’t urgent.</p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="What I can do">
        {SKILLS.map((x) => (
          <button key={x} type="button" aria-pressed={sk.has(x)} onClick={() => toggleSkill(x)} className={cn('rounded-full px-3 py-1 text-xs font-semibold transition-colors', sk.has(x) ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10')}>{SKILL_LABEL[x]}</button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={locate} disabled={busy} className="btn-primary btn-sm">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}{data ? 'Save changes' : 'Turn on, near where I am'}</button>
        {data && <button type="button" onClick={() => { if ('geolocation' in navigator) { setBusy(true); navigator.geolocation.getCurrentPosition((g) => save({ lat: g.coords.latitude, lng: g.coords.longitude }), () => setBusy(false)); } }} disabled={busy} className="btn-secondary btn-sm">Move it to where I am now</button>}
        {data && <button type="button" onClick={off} disabled={busy} className="btn-secondary btn-sm">Turn off</button>}
      </div>
    </section>
  );
}
