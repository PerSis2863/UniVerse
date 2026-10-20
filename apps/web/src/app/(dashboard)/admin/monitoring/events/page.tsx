'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { LoadError } from '@/components/ui/LoadError';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { CheckCircle2, Clock, QrCode as QrIcon, Users } from 'lucide-react';
import { ScanField } from '@/components/library/ScanField';
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
// Stage 5 · Q17: scan attendees' tickets (signed QR codes, each works once) under the attendee list.

interface Event { id: string; title: string; startAt: string | null; location: string | null; capacity: number | null; going: number; waiting: number }
interface Attendees { item: { id: string; title: string; capacity: number | null }; people: { id: string; status: string; checkedInAt: string | null; createdAt: string; user: { id: string; name: string; email: string } }[] }

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function AdminEventsPage() {
  const { data: events, isLoading, error, mutate } = useSWR<Event[]>('/api/campus/events', authedJson);
  const [open, setOpen] = useState<string | null>(null);
  const [door, setDoor] = useState<Event | null>(null);

  return (
    <>
      <Topbar title="Campus events" subtitle="RSVPs, waiting lists and check-in at the door" />
      <SectionTabs tabs={MONITORING_TABS} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-4">
          <p className="text-sm text-zinc-500">Add or edit events (their seats and ticket price) in <Link href="/admin/student-life" className="text-indigo-700 dark:text-indigo-300 underline underline-offset-2">Student Life management</Link>.</p>
          {error && !events ? <LoadError onRetry={() => mutate()} message="Couldn’t load events." /> : isLoading ? <div className="h-32 rounded-2xl skeleton" /> : !events?.length ? (
            <p className={`panel p-6 text-sm text-zinc-500 text-center`}>No upcoming events.</p>
          ) : (
            <ul className="space-y-3">
              {events.map((ev) => (
                <li key={ev.id} className={`panel overflow-hidden`}>
                  <div className="p-4 flex flex-wrap items-center gap-3">
                    <button type="button" onClick={() => setOpen(open === ev.id ? null : ev.id)} className="flex-1 min-w-0 text-start" aria-expanded={open === ev.id}>
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

/** The door: scan (or type) a ticket's code; each ticket works once. */
function TicketScan({ id, onScanned }: { id: string; onScanned: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ ok: boolean; text: string } | null>(null);
  const scan = async (c: string) => {
    setBusy(true);
    try {
      const r = await authedJson<{ ok: boolean; name: string; usedAt: string | null }>(`/api/campus/events/${id}/scan`, { method: 'POST', body: JSON.stringify({ code: c }) });
      setLast(r.ok ? { ok: true, text: `${r.name}: welcome in` } : { ok: false, text: `${r.name}: already used${r.usedAt ? ` at ${new Date(r.usedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : ''}` });
      if (r.ok) onScanned();
    } catch (e) { setLast({ ok: false, text: (e as Error).message }); toast.error((e as Error).message); }
    finally { setBusy(false); setCode(''); }
  };
  return (
    <div className="space-y-2">
      <ScanField label="Scan a ticket" value={code} onChange={setCode} onScan={(c) => void scan(c)} placeholder="Scan the QR, or type the code" busy={busy} />
      {last && <p role="status" className={cn('text-sm font-semibold', last.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300')}>{last.text}</p>}
    </div>
  );
}

function AttendeeList({ id }: { id: string }) {
  const { data, mutate } = useSWR<Attendees>(`/api/campus/events/${id}/attendees`, authedJson);
  if (!data) return <div className="p-4"><div className="h-16 rounded-xl skeleton" /></div>;
  if (!data.people.length) return <p className="p-4 text-sm text-zinc-500">Nobody has signed up yet.</p>;
  const checked = data.people.filter((p) => p.checkedInAt).length;
  return (
    <div className="p-4 space-y-2">
      <TicketScan id={id} onScanned={() => void mutate()} />
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{checked} of {data.people.filter((p) => p.status === 'GOING').length} checked in</p>
      <ul className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
        {data.people.map((p) => (
          <li key={p.id} className="py-2 flex items-center gap-3 text-sm">
            <span className="flex-1 min-w-0"><span className="text-zinc-900 dark:text-white">{p.user.name}</span> <span className="text-xs text-zinc-500">{p.user.email}</span></span>
            {p.checkedInAt ? <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {new Date(p.checkedInAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
              : <span className={cn('text-xs font-semibold', p.status === 'WAITLIST' ? 'text-amber-800 dark:text-amber-400' : 'text-zinc-600 dark:text-zinc-400')}>{p.status === 'WAITLIST' ? 'Waiting list' : p.status === 'HELD' ? 'Paying' : 'Going'}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
