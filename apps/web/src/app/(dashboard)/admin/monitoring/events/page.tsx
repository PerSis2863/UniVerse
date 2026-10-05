'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { AnimatePresence, m as motion } from 'framer-motion';
import { CheckCircle2, Clock, QrCode as QrIcon, Users } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, MONITORING_TABS } from '@/components/layout/SectionTabs';
import { RotatingQr } from '@/components/ui/RotatingQr';
import Link from '@/components/ui/Link';
import { authedJson } from '@/lib/authed-fetch';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Campus events (upgrade 7), admin side: who's coming, and the rotating check-in QR code to show at
// the door. The code changes every 30 seconds (signed on the server, nothing stored), so a photo of
// it shared in a group chat stops working almost straight away. Events are added in Student Life.

interface Event { id: string; title: string; startAt: string | null; location: string | null; capacity: number | null; going: number; waiting: number }
interface Attendees { item: { id: string; title: string; capacity: number | null }; people: { id: string; status: string; checkedInAt: string | null; createdAt: string; user: { id: string; name: string; email: string } }[] }

const card = 'rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl';
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function AdminEventsPage() {
  const { data: events, isLoading } = useSWR<Event[]>('/api/campus/events', authedJson);
  const [open, setOpen] = useState<string | null>(null);
  const [door, setDoor] = useState<Event | null>(null);

  return (
    <>
      <Topbar title="Campus events" subtitle="RSVPs, waiting lists and check-in at the door" />
      <SectionTabs tabs={MONITORING_TABS} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-4">
          <p className="text-sm text-zinc-500">Add or edit events (and their number of seats) in <Link href="/admin/student-life" className="text-indigo-500 hover:underline">Student Life management</Link>.</p>
          {isLoading ? <div className="h-32 rounded-2xl skeleton" /> : !events?.length ? (
            <p className={`${card} p-6 text-sm text-zinc-500 text-center`}>No upcoming events.</p>
          ) : (
            <ul className="space-y-3">
              {events.map((ev) => (
                <li key={ev.id} className={`${card} overflow-hidden`}>
                  <div className="p-4 flex flex-wrap items-center gap-3">
                    <button type="button" onClick={() => setOpen(open === ev.id ? null : ev.id)} className="flex-1 min-w-0 text-left" aria-expanded={open === ev.id}>
                      <p className="font-semibold text-zinc-900 dark:text-white truncate">{ev.title}</p>
                      <p className="text-xs text-zinc-500 flex flex-wrap gap-x-3">
                        {ev.startAt && <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{when(ev.startAt)}</span>}
                        <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />{ev.going}{ev.capacity ? `/${ev.capacity}` : ''} going{ev.waiting ? ` · ${ev.waiting} waiting` : ''}</span>
                      </p>
                    </button>
                    <button type="button" className="btn-primary btn-sm rounded-full" onClick={() => setDoor(ev)}><QrIcon className="w-4 h-4" /> Check-in code</button>
                  </div>
                  <AnimatePresence initial={false}>
                    {open === ev.id && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.smooth} className="overflow-hidden border-t border-zinc-100 dark:border-white/[0.06]">
                        <AttendeeList id={ev.id} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <AnimatePresence>{door && <RotatingQr endpoint={`/api/campus/events/${door.id}/code`} path="/student/life/events" title={door.title} onClose={() => setDoor(null)} />}</AnimatePresence>
    </>
  );
}

function AttendeeList({ id }: { id: string }) {
  const { data } = useSWR<Attendees>(`/api/campus/events/${id}/attendees`, authedJson);
  if (!data) return <div className="p-4"><div className="h-16 rounded-xl skeleton" /></div>;
  if (!data.people.length) return <p className="p-4 text-sm text-zinc-500">Nobody has signed up yet.</p>;
  const checked = data.people.filter((p) => p.checkedInAt).length;
  return (
    <div className="p-4 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{checked} of {data.people.filter((p) => p.status === 'GOING').length} checked in</p>
      <ul className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
        {data.people.map((p) => (
          <li key={p.id} className="py-2 flex items-center gap-3 text-sm">
            <span className="flex-1 min-w-0"><span className="text-zinc-900 dark:text-white">{p.user.name}</span> <span className="text-xs text-zinc-500">{p.user.email}</span></span>
            {p.checkedInAt ? <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {new Date(p.checkedInAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
              : <span className={cn('text-xs font-semibold', p.status === 'WAITLIST' ? 'text-amber-500' : 'text-zinc-500')}>{p.status === 'WAITLIST' ? 'Waiting list' : 'Going'}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
