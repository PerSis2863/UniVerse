'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import { AnimatePresence, m as motion } from 'framer-motion';
import { Building2, CalendarClock, ChevronRight, KeyRound, Loader2, LocateFixed, MapPin, Plus, TriangleAlert, Users, X } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import Link from '@/components/ui/Link';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { RELIEF_ORG_KINDS, RELIEF_ORG_KIND_LABEL, RELIEF_ORG_ROLE_LABEL, shiftState, type ReliefOrgKind, type ReliefOrgRole } from '@/lib/relief';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';
import { OrgDashboard } from './OrgDashboard';

// UniVerse Relief → Organisations (M106, src/server/relief-orgs.ts): the organisations I'm in, the
// volunteer shifts that need people, and each organisation's own page (?org=<id>, OrgDashboard).
// ?join=<code> opens "Join with a code" filled in; ?shift=<id> (a reminder) shows that shift first.

export interface ShiftView {
  id: string; orgId: string; title: string; details: string | null; place: string | null; startsAt: string; endsAt: string;
  slots: number; filled: number; membersOnly: boolean; signedUp: boolean;
  org?: { id: string; name: string; kind: string; place: string | null } | null;
  people?: { id: string; name: string }[];
}
interface OrgCard { id: string; name: string; kind: ReliefOrgKind; place: string | null; role: ReliefOrgRole; members: number; low: number; shifts: number }
interface OrgsData { orgs: OrgCard[]; mine: ShiftView[]; shifts: ShiftView[] }

export const when = (s: { startsAt: string; endsAt: string }) => {
  const a = new Date(s.startsAt), b = new Date(s.endsAt);
  const day = a.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${t(a)}–${t(b)}`;
};

export function ReliefOrgs() {
  const q = useSearchParams();
  const org = q.get('org');
  if (org) return <OrgDashboard key={org} id={org} tab={q.get('tab')} />;
  return <Home join={q.get('join')} shift={q.get('shift')} />;
}

function Home({ join, shift }: { join: string | null; shift: string | null }) {
  const now = useNow();
  const { data, mutate } = useSWR<OrgsData>('/relief/orgs', fetcher);
  const [sheet, setSheet] = useState<'start' | 'join' | null>(join ? 'join' : null);
  const first = (rows: ShiftView[]) => (shift ? [...rows].sort((a, b) => Number(b.id === shift) - Number(a.id === shift)) : rows);
  return (
    <>
      <Topbar title="Organisations" subtitle="NGOs, food banks and shelters: stock, volunteers and needs in one place" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-8">
          <section aria-labelledby="orgs-h">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="orgs-h" className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Building2 className="w-5 h-5 text-orange-500" aria-hidden />Your organisations</h2>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setSheet('join')} className="btn-secondary btn-sm"><KeyRound className="w-4 h-4" aria-hidden />Join with a code</button>
                <button type="button" onClick={() => setSheet('start')} className="btn-primary btn-sm"><Plus className="w-4 h-4" aria-hidden />Start an organisation</button>
              </div>
            </div>
            <div className="mt-3">
              {!data ? <div className="grid sm:grid-cols-2 gap-3"><div className="panel h-28 skeleton" /><div className="panel h-28 skeleton" /></div>
                : data.orgs.length === 0 ? (
                  <div className="panel p-6 text-sm text-zinc-600 dark:text-zinc-300 max-w-[70ch]">
                    <p className="font-semibold text-zinc-900 dark:text-white">Run your NGO, food bank, shelter or community group here.</p>
                    <p className="mt-1">Keep count of your supplies, plan volunteer shifts, and take on needs from the live map together. Start one, or join with the code a coordinator shared with you.</p>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {data.orgs.map((o, i) => (
                      <motion.div key={o.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }}>
                        <Link href={`/relief/orgs?org=${o.id}`} className="panel p-4 flex items-start gap-3 hover:border-orange-500/40 transition-colors">
                          <span className="w-11 h-11 shrink-0 grid place-items-center rounded-2xl bg-orange-500/12 text-orange-600 dark:text-orange-300"><Building2 className="w-5 h-5" aria-hidden /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-bold text-zinc-900 dark:text-white truncate" translate="no">{o.name}</span>
                            <span className="block text-xs text-zinc-500">{RELIEF_ORG_KIND_LABEL[o.kind] ?? o.kind}{o.place ? ` · ${o.place}` : ''} · {RELIEF_ORG_ROLE_LABEL[o.role] ?? o.role}</span>
                            <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                              <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" aria-hidden />{o.members} {o.members === 1 ? 'member' : 'members'}</span>
                              <span className="inline-flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" aria-hidden />{o.shifts} {o.shifts === 1 ? 'shift' : 'shifts'} coming up</span>
                              {o.low > 0 && <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300"><TriangleAlert className="w-3.5 h-3.5" aria-hidden />{o.low} running low</span>}
                            </span>
                          </span>
                          <ChevronRight className="w-4 h-4 mt-1 text-zinc-400 rtl:rotate-180" aria-hidden />
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                )}
            </div>
          </section>

          {!!data?.mine.length && (
            <section aria-labelledby="my-shifts-h">
              <h2 id="my-shifts-h" className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2"><CalendarClock className="w-5 h-5 text-orange-500" aria-hidden />Your shifts</h2>
              <div className="mt-3 grid md:grid-cols-2 gap-3">{first(data.mine).map((s) => <ShiftCard key={s.id} s={s} now={now} hot={s.id === shift} onChange={() => void mutate()} />)}</div>
            </section>
          )}

          <section aria-labelledby="open-shifts-h">
            <h2 id="open-shifts-h" className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Users className="w-5 h-5 text-orange-500" aria-hidden />Volunteer: shifts that need people</h2>
            <p className="mt-1 text-sm text-zinc-500 max-w-[70ch]">Organisations near and far post the hours they need help. Sign up for a place; they see your name, and you get a reminder before it starts.</p>
            <div className="mt-3">
              {!data ? <div className="panel h-28 skeleton" />
                : data.shifts.length === 0 ? <p className="panel p-6 text-sm text-zinc-500 text-center">No open shifts in the next 30 days. Organisations post them here.</p>
                  : <div className="grid md:grid-cols-2 gap-3">{first(data.shifts).map((s) => <ShiftCard key={s.id} s={s} now={now} hot={s.id === shift} onChange={() => void mutate()} />)}</div>}
            </div>
          </section>

          <Link href="/relief" className="btn-secondary inline-flex">Open the live map</Link>
        </div>
      </div>
      <AnimatePresence>
        {sheet === 'start' && <StartSheet key="start" onClose={() => setSheet(null)} />}
        {sheet === 'join' && <JoinSheet key="join" code={join ?? ''} onClose={() => setSheet(null)} />}
      </AnimatePresence>
    </>
  );
}

/** One volunteer shift: when, where, places left, sign up or give the place back. */
export function ShiftCard({ s, now, hot, onChange, admin }: { s: ShiftView; now: number; hot?: boolean; onChange: () => void; admin?: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const st = shiftState(s, now || new Date(s.startsAt).getTime() - 1);
  const act = async (join: boolean) => {
    setBusy(true);
    try {
      if (join) await api.post(`/relief/shifts/${s.id}/signup`); else await api.delete(`/relief/shifts/${s.id}/signup`);
      toast.success(join ? 'You’re on the list. Thank you!' : 'Your place is free again.');
      onChange();
    } catch (e) { toast.error(errorMessage(e, 'Could not do that.')); } finally { setBusy(false); }
  };
  return (
    <div className={cn('panel p-4', hot && 'ring-2 ring-orange-500/50')}>
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 shrink-0 grid place-items-center rounded-xl bg-orange-500/12 text-orange-600 dark:text-orange-300"><CalendarClock className="w-5 h-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-zinc-900 dark:text-white">{s.title}</p>
          <p className="text-xs text-zinc-500">{s.org ? <span translate="no">{s.org.name}</span> : null}{s.org ? ' · ' : ''}{when(s)}</p>
        </div>
        {s.membersOnly && <span className="shrink-0 rounded-full bg-zinc-100 dark:bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">Members</span>}
      </div>
      {s.details && <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap">{s.details}</p>}
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
        {(s.place || s.org?.place) && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" aria-hidden />{s.place ?? s.org?.place}</span>}
        <span className={cn('inline-flex items-center gap-1', st.full ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : '')}><Users className="w-3.5 h-3.5" aria-hidden />{st.full ? 'All places taken' : `${st.left} of ${s.slots} ${s.slots === 1 ? 'place' : 'places'} left`}</span>
        {st.started && !st.over && <span className="font-semibold text-orange-700 dark:text-orange-300">On now</span>}
      </p>
      {!!s.people?.length && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Signed up">
          {s.people.map((p) => <li key={p.id} className="rounded-full bg-zinc-100 dark:bg-white/[0.06] px-2.5 py-1 text-xs text-zinc-700 dark:text-zinc-200" translate="no">{p.name}</li>)}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {!st.over && (s.signedUp
          ? <button type="button" disabled={busy} onClick={() => void act(false)} className="btn-secondary btn-sm">{busy && <Loader2 className="w-4 h-4 animate-spin" />}I can’t make it</button>
          : !st.full && <button type="button" disabled={busy} onClick={() => void act(true)} className="btn-primary btn-sm">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Sign up</button>)}
        {s.signedUp && <span className="self-center text-xs font-semibold text-emerald-700 dark:text-emerald-400">You’re signed up</span>}
        {admin}
      </div>
    </div>
  );
}

/** A bottom sheet on phones, a dialog on bigger screens (the same shape as the map's post form). */
export function Sheet({ title, onClose, onSubmit, children }: { title: string; onClose: () => void; onSubmit: (e: React.FormEvent) => void; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="fixed inset-0 z-[120] grid place-items-end sm:place-items-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <motion.form initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: 'spring', stiffness: 360, damping: 32 }} onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#0f0f11] p-5 sm:p-6 shadow-2xl border border-zinc-200 dark:border-white/10" aria-label={title}>
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-zinc-900 dark:text-white">{title}</h2><button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 grid place-items-center rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button></div>
        {children}
      </motion.form>
    </motion.div>
  );
}

const label = 'text-xs font-medium text-zinc-600 dark:text-zinc-300';

/** The organisation's name, kind, about and base, used to start one and to edit it. */
export function OrgFields({ f, set }: { f: { name: string; kind: ReliefOrgKind; about: string; place: string; at: { lat: number; lng: number } | null }; set: (f: { name: string; kind: ReliefOrgKind; about: string; place: string; at: { lat: number; lng: number } | null }) => void }) {
  const locate = () => {
    if (!('geolocation' in navigator)) { toast.error('This device can’t share its location.'); return; }
    navigator.geolocation.getCurrentPosition((g) => set({ ...f, at: { lat: g.coords.latitude, lng: g.coords.longitude } }), () => toast.error('Allow location for this site to set your base.'), { timeout: 10_000 });
  };
  return (
    <>
      <label className="mt-4 block"><span className={label}>Name</span><input required maxLength={80} value={f.name} onChange={(e) => set({ ...f, name: e.target.value })} className="input mt-1" placeholder="Riverside Food Bank" /></label>
      <label className="mt-3 block"><span className={label}>What kind</span>
        <select value={f.kind} onChange={(e) => set({ ...f, kind: e.target.value as ReliefOrgKind })} className="input mt-1">{RELIEF_ORG_KINDS.map((k) => <option key={k} value={k}>{RELIEF_ORG_KIND_LABEL[k]}</option>)}</select>
      </label>
      <label className="mt-3 block"><span className={label}>About (optional)</span><textarea rows={3} maxLength={600} value={f.about} onChange={(e) => set({ ...f, about: e.target.value })} className="input mt-1 resize-y" placeholder="What you do and who you help." /></label>
      <label className="mt-3 block"><span className={label}>Area name (optional)</span><input maxLength={120} value={f.place} onChange={(e) => set({ ...f, place: e.target.value })} className="input mt-1" placeholder="Riverside, Ward 12…" /></label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={locate} className="btn-secondary btn-sm"><LocateFixed className="w-4 h-4" aria-hidden />{f.at ? 'Move the base to where I am' : 'Set the base where I am'}</button>
        <span className="text-xs text-zinc-500">{f.at ? 'Base set (rounded to about 500 m). Needs near it show on your page.' : 'Optional: with a base, your page shows the needs near you.'}</span>
      </div>
    </>
  );
}

function StartSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ name: '', kind: 'NGO' as ReliefOrgKind, about: '', place: '', at: null as { lat: number; lng: number } | null });
  const [saving, setSaving] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post<{ id: string }>('/relief/orgs', { name: f.name, kind: f.kind, about: f.about, place: f.place, ...(f.at ?? {}) });
      toast.success('Your organisation is ready. Share its code with your team.');
      router.push(`/relief/orgs?org=${data.id}`);
    } catch (err) { toast.error(errorMessage(err, 'Could not start it.')); setSaving(false); }
  };
  return (
    <Sheet title="Start an organisation" onClose={onClose} onSubmit={(e) => void save(e)}>
      <OrgFields f={f} set={setF} />
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="btn-secondary">Cancel</button><button type="submit" disabled={saving || !f.name.trim()} className="btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Start it</button></div>
    </Sheet>
  );
}

function JoinSheet({ code: start, onClose }: { code: string; onClose: () => void }) {
  const router = useRouter();
  const [code, setCode] = useState(start.toUpperCase());
  const [saving, setSaving] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post<{ id: string; name: string }>('/relief/orgs/join', { code });
      toast.success(`Welcome to ${data.name}!`);
      router.push(`/relief/orgs?org=${data.id}`);
    } catch (err) { toast.error(errorMessage(err, 'Could not join.')); setSaving(false); }
  };
  return (
    <Sheet title="Join with a code" onClose={onClose} onSubmit={(e) => void save(e)}>
      <p className="mt-2 text-sm text-zinc-500">A coordinator can find the code on their organisation’s page. You join as a volunteer.</p>
      <label className="mt-4 block"><span className={label}>Code</span><input required maxLength={8} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="input mt-1 font-mono tracking-[0.3em] uppercase" placeholder="ABC123" autoComplete="off" /></label>
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="btn-secondary">Cancel</button><button type="submit" disabled={saving || code.replace(/[^0-9A-Z]/gi, '').length !== 6} className="btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}Join</button></div>
    </Sheet>
  );
}
