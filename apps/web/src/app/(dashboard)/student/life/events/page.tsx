'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { CalendarDays, CheckCircle2, Clock, ExternalLink, Loader2, MapPin, QrCode, Ticket, Users } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, LIFE_TABS } from '@/components/layout/SectionTabs';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';
import { authedJson } from '@/lib/authed-fetch';
import { safeHref } from '@/lib/safe-href';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Campus events (upgrade 7): RSVP (a seat, or the waiting list when it's full) and check in at the
// door by scanning the organiser's QR code, which opens this page with ?checkin=<code>.

interface Event {
  id: string; title: string; description: string | null; category: string | null; location: string | null; url: string | null;
  startAt: string | null; capacity: number | null; going: number; waiting: number;
  mine: { status: 'GOING' | 'WAITLIST'; checkedInAt: string | null } | null;
}

const card = 'rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl';
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function EventsPage() {
  const { data, error, isLoading, mutate } = useSWR<Event[]>('/api/campus/events', authedJson);
  const [busy, setBusy] = useState<string | null>(null);
  const [checkedIn, setCheckedIn] = useState<{ title: string } | null>(null);
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const handled = useRef(false);

  // Opened from the QR code at the door: check in straight away.
  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const code = new URLSearchParams(window.location.search).get('checkin');
    if (!code) return;
    window.history.replaceState(null, '', window.location.pathname);
    authedJson<{ title: string; already: boolean }>('/api/campus/events/checkin', { method: 'POST', body: JSON.stringify({ code }) })
      .then((r) => { setCheckedIn({ title: r.title }); if (r.already) toast('You’d already checked in.'); void mutate(); })
      .catch((e: Error) => toast.error(e.message));
  }, [mutate]);

  const rsvp = async (ev: Event, going: boolean) => {
    setBusy(ev.id);
    try {
      const r = await authedJson<{ status: 'GOING' | 'WAITLIST' | null }>(`/api/campus/events/${ev.id}/rsvp`, { method: 'POST', body: JSON.stringify({ going }) });
      toast.success(r.status === 'GOING' ? 'You’re going. Scan the code at the door to check in.' : r.status === 'WAITLIST' ? 'It’s full, so you’re on the waiting list. We’ll tell you if a seat frees up.' : 'You’ve given up your place.');
      void mutate();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  const list = (data ?? []).filter((e) => filter === 'all' || e.mine);

  return (
    <>
      <Topbar title="Campus events" subtitle="Save your seat, then check in at the door with the QR code" />
      <SectionTabs tabs={LIFE_TABS} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-5">
          <AnimatePresence>
            {checkedIn && (
              <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={spring.smooth} className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-5 flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 shrink-0" />
                <div className="flex-1"><p className="font-bold text-zinc-900 dark:text-white">You’re checked in</p><p className="text-sm text-zinc-600 dark:text-zinc-300">{checkedIn.title}. Enjoy!</p></div>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setCheckedIn(null)}>Close</button>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex p-1 rounded-xl bg-zinc-100 dark:bg-white/[0.05]" role="tablist">
              {(['all', 'mine'] as const).map((f) => (
                <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={cn('relative px-3 py-1.5 text-sm font-medium rounded-lg', filter === f ? 'text-zinc-900 dark:text-white' : 'text-zinc-500')}>
                  {filter === f && <motion.span layoutId="events-filter" transition={spring.snappy} className="absolute inset-0 rounded-lg bg-white dark:bg-white/10 shadow-sm" />}
                  <span className="relative">{f === 'all' ? 'Upcoming' : 'My tickets'}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500 hidden sm:flex items-center gap-1"><QrCode className="w-3.5 h-3.5" /> At the door, scan the code on the organiser’s screen with your phone camera.</p>
          </div>
          {isLoading ? (
            <div className="grid gap-3">{[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-2xl skeleton" />)}</div>
          ) : error ? (
            <p className="text-sm text-rose-500">{(error as Error).message}</p>
          ) : !list.length ? (
            filter === 'mine'
              ? <p className={`${card} p-6 text-sm text-zinc-500 text-center`}>No tickets yet. Pick an event under Upcoming.</p>
              : <FeatureGuide icon={CalendarDays} title="Campus events will appear here" description="Career fairs, festivals, workshops and talks on your campus, added by your campus admin." steps={['Tap Going to save a seat', 'If it’s full you join the waiting list and get a seat when one frees up', 'Scan the QR code at the door to check in']} example={<div><ExampleRow title="Career Fair 2026" meta="Fri, 14 Nov · 10:00 · Main Hall" right="42/100" /></div>} />
          ) : (
            <ul className="grid gap-3">
              {list.map((ev) => {
                const full = !!ev.capacity && ev.going >= ev.capacity;
                const pct = ev.capacity ? Math.min(100, Math.round((ev.going / ev.capacity) * 100)) : null;
                return (
                  <motion.li key={ev.id} layout transition={spring.smooth} className={`${card} p-4 sm:p-5 space-y-3`}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-zinc-900 dark:text-white">{ev.title}</p>
                        <p className="text-xs text-zinc-500 flex flex-wrap gap-x-3 gap-y-1 mt-1">
                          {ev.startAt && <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{when(ev.startAt)}</span>}
                          {ev.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{ev.location}</span>}
                          <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />{ev.going}{ev.capacity ? `/${ev.capacity}` : ''} going{ev.waiting ? ` · ${ev.waiting} waiting` : ''}</span>
                        </p>
                      </div>
                      {ev.category && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 shrink-0">{ev.category}</span>}
                    </div>
                    {ev.description && <p className="text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-line">{ev.description}</p>}
                    {pct !== null && (
                      <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden" aria-hidden>
                        <motion.div className={cn('h-full rounded-full', full ? 'bg-amber-500' : 'bg-indigo-500')} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={spring.gentle} />
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      {ev.mine?.checkedInAt ? (
                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="w-4 h-4" /> Checked in</span>
                      ) : ev.mine ? (
                        <>
                          <span className={cn('inline-flex items-center gap-1.5 text-sm font-semibold', ev.mine.status === 'GOING' ? 'text-indigo-600 dark:text-indigo-300' : 'text-amber-600 dark:text-amber-400')}>
                            <Ticket className="w-4 h-4" /> {ev.mine.status === 'GOING' ? 'You’re going' : 'On the waiting list'}
                          </span>
                          <button type="button" className="btn-ghost btn-sm" disabled={busy === ev.id} onClick={() => void rsvp(ev, false)}>Can’t make it</button>
                        </>
                      ) : (
                        <button type="button" className="btn-primary btn-sm rounded-full" disabled={busy === ev.id} onClick={() => void rsvp(ev, true)}>
                          {busy === ev.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ticket className="w-4 h-4" />} {full ? 'Join the waiting list' : 'Going'}
                        </button>
                      )}
                      {ev.url && <a href={safeHref(ev.url)} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm ml-auto inline-flex"><ExternalLink className="w-4 h-4" /> More</a>}
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
