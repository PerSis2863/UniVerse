'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Award, CheckCircle2, Clock, HandHeart, Loader2, LogOut, MapPin, Navigation, QrCode, Users } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, OPPORTUNITY_TABS } from '@/components/layout/SectionTabs';
import { ImpactMap, type Place } from '@/components/impact/ImpactMap';
import { authedJson } from '@/lib/authed-fetch';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Verified volunteering (upgrade 5): sign up for NGO project shifts, check in on site (scan the
// supervisor's QR code, which opens this page with ?checkin=<code>, or by location), check out,
// and the hours are verified: impact points, passport evidence and a ready-filled certificate.

interface Shift {
  id: string; title: string; startAt: string; endAt: string; location: string | null; lat: number | null; lng: number | null; radiusM: number; capacity: number; taken: number;
  project: { id: string; name: string; sdgNumber: number | null; ngo: { name: string } | null };
  mine: { checkInAt: string | null; checkOutAt: string | null; minutes: number; verified: boolean; method: string | null } | null;
}
interface Report { year: number; totals: { hours: number; volunteers: number; shifts: number }; places: Place[] }

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const hrs = (m: number) => `${Math.round((m / 60) * 10) / 10} h`;

export default function ShiftsPage() {
  const router = useRouter();
  const { data, isLoading, error, mutate } = useSWR<Shift[]>('/api/volunteer/shifts', authedJson);
  const { data: report } = useSWR<Report>('/api/volunteer/report', authedJson, { revalidateOnFocus: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const handled = useRef(false);

  // Opened from the supervisor's QR code: check in straight away (with location if allowed).
  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const code = new URLSearchParams(window.location.search).get('checkin');
    if (!code) return;
    window.history.replaceState(null, '', window.location.pathname);
    const send = (pos?: GeolocationPosition) => authedJson<{ title: string; already: boolean }>('/api/volunteer/checkin', { method: 'POST', body: JSON.stringify({ code, lat: pos?.coords.latitude, lng: pos?.coords.longitude }) })
      .then((r) => { toast.success(r.already ? `You’d already checked in to ${r.title}.` : `Checked in to ${r.title}. Check out when you leave.`); void mutate(); })
      .catch((e: Error) => toast.error(e.message));
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => void send(p), () => void send(), { timeout: 6000, maximumAge: 60_000 });
    else void send();
  }, [mutate]);

  const act = async (s: Shift, what: 'signup' | 'leave' | 'gps' | 'checkout') => {
    setBusy(s.id);
    try {
      if (what === 'signup' || what === 'leave') {
        await authedJson(`/api/volunteer/shifts/${s.id}/signup`, { method: 'POST', body: JSON.stringify({ on: what === 'signup' }) });
        toast.success(what === 'signup' ? 'You’re signed up. Check in when you arrive.' : 'You’ve given up your place.');
      } else if (what === 'gps') {
        const pos = await new Promise<GeolocationPosition>((ok, no) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(ok, no, { enableHighAccuracy: true, timeout: 10_000 }) : no(new Error('This device can’t share its location.')))
          .catch(() => { throw new Error('Allow location to check in here, or scan the supervisor’s QR code.'); });
        await authedJson('/api/volunteer/checkin', { method: 'POST', body: JSON.stringify({ shiftId: s.id, lat: pos.coords.latitude, lng: pos.coords.longitude }) });
        toast.success('Checked in. Check out when you leave.');
      } else {
        const r = await authedJson<{ minutes: number; verified: boolean; prefill: { project: string; org: string; hours: string } | null }>(`/api/volunteer/shifts/${s.id}/checkout`, { method: 'POST' });
        toast.success(`${hrs(r.minutes)} verified. Thank you!`, r.prefill ? { action: { label: 'Request certificate', onClick: () => router.push(`/student/credentials?${new URLSearchParams(r.prefill!).toString()}`) } } : undefined);
      }
      void mutate();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  const shifts = data ?? [];
  const mine = shifts.filter((s) => s.mine?.verified);
  const verifiedMinutes = mine.reduce((t, s) => t + (s.mine?.minutes ?? 0), 0);

  return (
    <>
      <Topbar title="Volunteer shifts" subtitle="Sign up, check in on site, and your hours are verified automatically" />
      <SectionTabs tabs={OPPORTUNITY_TABS} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-6">
          {verifiedMinutes > 0 && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth} className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-4 flex items-center gap-3">
              <Award className="w-7 h-7 text-emerald-500" />
              <p className="text-sm text-zinc-800 dark:text-zinc-200"><b>{hrs(verifiedMinutes)}</b> verified on {mine.length} shift{mine.length === 1 ? '' : 's'}. They’re on your passport and count toward your impact points.</p>
            </motion.div>
          )}
          {isLoading ? <div className="grid gap-3">{[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-2xl skeleton" />)}</div> : error ? <p className="text-sm text-rose-500">{(error as Error).message}</p> : !shifts.length ? (
            <div className={`panel p-8 text-center space-y-2`}>
              <HandHeart className="w-10 h-10 text-zinc-400 mx-auto" />
              <p className="font-semibold text-zinc-900 dark:text-white">No shifts yet</p>
              <p className="text-sm text-zinc-500">When an NGO project needs volunteers on site, its shifts appear here.</p>
            </div>
          ) : (
            <ul className="grid gap-3">
              {shifts.map((s) => {
                const live = now >= Date.parse(s.startAt) - 30 * 60_000 && now <= Date.parse(s.endAt);
                const over = now > Date.parse(s.endAt);
                const m = s.mine;
                return (
                  <motion.li key={s.id} layout transition={spring.smooth} className={cn('panel', 'p-4 sm:p-5 space-y-3', over && !m && 'opacity-60')}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-zinc-900 dark:text-white">{s.title}</p>
                        <p className="text-xs text-zinc-500">{s.project.name}{s.project.ngo ? ` · ${s.project.ngo.name}` : ''}{s.project.sdgNumber ? ` · SDG ${s.project.sdgNumber}` : ''}</p>
                        <p className="text-xs text-zinc-500 flex flex-wrap gap-x-3 mt-1">
                          <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{when(s.startAt)}–{time(s.endAt)}</span>
                          {s.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{s.location}</span>}
                          <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />{s.taken}/{s.capacity}</span>
                        </p>
                      </div>
                      {live && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">Check-in open</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {m?.checkOutAt ? (
                        <span className={cn('inline-flex items-center gap-1.5 text-sm font-semibold', m.verified ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500')}><CheckCircle2 className="w-4 h-4" /> {hrs(m.minutes)} {m.verified ? 'verified' : ''}</span>
                      ) : m?.checkInAt ? (
                        <>
                          <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-300">Checked in at {time(m.checkInAt)}</span>
                          <button type="button" className="btn-primary btn-sm rounded-full" disabled={busy === s.id} onClick={() => void act(s, 'checkout')}>{busy === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />} Check out</button>
                        </>
                      ) : m ? (
                        <>
                          <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-300">Signed up</span>
                          {live && <span className="text-xs text-zinc-500 inline-flex items-center gap-1"><QrCode className="w-3.5 h-3.5" /> Scan the supervisor’s code</span>}
                          {live && s.lat != null && <button type="button" className="btn-secondary btn-sm rounded-full" disabled={busy === s.id} onClick={() => void act(s, 'gps')}><Navigation className="w-4 h-4" /> Check in here</button>}
                          {!over && <button type="button" className="btn-ghost btn-sm" disabled={busy === s.id} onClick={() => void act(s, 'leave')}>Can’t make it</button>}
                        </>
                      ) : !over ? (
                        <button type="button" className="btn-primary btn-sm rounded-full" disabled={busy === s.id || s.taken >= s.capacity} onClick={() => void act(s, 'signup')}>{s.taken >= s.capacity ? 'Full' : 'Sign up'}</button>
                      ) : null}
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          )}
          <AnimatePresence>
            {report && (
              <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={spring.smooth} className="space-y-2" aria-label="Impact map">
                <h2 className="font-bold text-zinc-900 dark:text-white">Where students volunteered in {report.year}</h2>
                <p className="text-sm text-zinc-500">{report.totals.hours} verified hours · {report.totals.volunteers} volunteers · {report.totals.shifts} shifts</p>
                <ImpactMap places={report.places} />
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
