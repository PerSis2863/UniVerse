'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { BellRing, ChevronRight, DoorClosed, DoorOpen, Loader2, NotebookPen, Plus, Users, X } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Segmented } from '@/components/ui/Segmented';
import { authedJson } from '@/lib/authed-fetch';
import { chime } from '@/lib/call-sounds';
import { fadeUp, spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Office hours with a queue (Stage 4 · 4.7; src/server/office-hours.ts, the line itself is the call
// room o_<teacher> in cloudflare/worker.ts). On the Calls page: teachers open and close them and see
// who's waiting; students see their teachers' open office hours and join the line. In the call: the
// line for whoever waits (QueueStatus) and the teacher's bar with "Next student" and notes (OfficeBar).

interface Note { id: string; body: string; createdAt: string }
interface TeacherState {
  role: 'teacher'; open: boolean; until: string | null; topic: string | null; callId: string; waiting: number; inTurn: number; avgMin: number;
  notes: (Note & { student: { id: string; name: string; avatar: string | null } })[];
}
interface StudentState { role: 'student'; open: { teacherId: string; id: string; name: string; avatar: string | null; courses: string[]; topic: string | null; until: string | null; callId: string }[] }

const LENGTHS = [{ value: '30', label: '30 min' }, { value: '60', label: '1 hour' }, { value: '90', label: '1½ hours' }, { value: '120', label: '2 hours' }] as const;
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;

/** The Calls page card: a teacher's office hours, or a student's teachers' open ones (nothing when none are). */
export function OfficeHoursCard({ role }: { role?: string }) {
  const teacher = role === 'TEACHER' || role === 'ADMIN';
  const { data, mutate } = useSWR<TeacherState | StudentState>('/api/office-hours', authedJson, {
    // While open, a teacher sees the line grow; students check now and then (and on coming back).
    refreshInterval: (d) => (d?.role === 'teacher' && d.open ? 15_000 : 120_000),
  });
  if (!data) return null;
  if (data.role === 'student' || !teacher) return data.role === 'student' ? <StudentOffice open={data.open} /> : null;
  return <TeacherOffice s={data} onChange={(s) => void mutate(s, { revalidate: false })} />;
}

function StudentOffice({ open }: { open: StudentState['open'] }) {
  const router = useRouter();
  if (!open.length) return null;
  return (
    <motion.section variants={fadeUp} initial="hidden" animate="show" className={`panel p-4 space-y-3`} aria-label="Office hours">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5"><DoorOpen className="w-3.5 h-3.5" />Office hours now</p>
      <ul className="space-y-2">
        {open.map((o) => (
          <li key={o.teacherId} className="flex items-center gap-3">
            <Avatar name={o.name} src={o.avatar} size={44} />
            <span className="flex-1 min-w-0">
              <span className="block font-semibold text-zinc-900 dark:text-white truncate">{o.name}</span>
              <span className="block text-xs text-zinc-500 truncate">{[o.courses.slice(0, 3).join(', '), o.topic, o.until ? `until ${format(new Date(o.until), 'HH:mm')}` : null].filter(Boolean).join(' · ')}</span>
            </span>
            <motion.button whileTap={{ scale: 0.92 }} type="button" onClick={() => router.push(`/call/${o.callId}`)} className="shrink-0 px-4 py-2 rounded-full bg-emerald-500 text-white text-sm font-bold shadow-lg shadow-emerald-500/25">Join the line</motion.button>
          </li>
        ))}
      </ul>
    </motion.section>
  );
}

function TeacherOffice({ s, onChange }: { s: TeacherState; onChange: (s: TeacherState) => void }) {
  const router = useRouter();
  const [minutes, setMinutes] = useState<string>('60');
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [allNotes, setAllNotes] = useState(false);
  const post = async (what: string, body: Record<string, unknown>) => {
    setBusy(what);
    try { onChange(await authedJson<TeacherState>('/api/office-hours', { method: 'POST', body: JSON.stringify(body) })); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const notes = allNotes ? s.notes : s.notes.slice(0, 3);
  return (
    <motion.section variants={fadeUp} initial="hidden" animate="show" className={`panel p-4 space-y-3`} aria-label="Office hours">
      <div className="flex items-start gap-3">
        <span className={cn('w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 text-white shadow-lg', s.open ? 'bg-emerald-500 shadow-emerald-500/25' : 'bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow-fuchsia-500/25')}>
          {s.open ? <DoorOpen className="w-5 h-5" /> : <DoorClosed className="w-5 h-5" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-zinc-900 dark:text-white">{s.open ? `Office hours are open${s.until ? ` until ${format(new Date(s.until), 'HH:mm')}` : ''}` : 'Office hours'}</p>
          <p className="text-xs text-zinc-500">
            {s.open
              ? [s.topic, s.waiting ? `${s.waiting} waiting` : 'Nobody waiting yet', s.inTurn ? 'someone with you now' : null].filter(Boolean).join(' · ')
              : 'Your students join a line and you see them one at a time. They’re told when you open.'}
          </p>
        </div>
      </div>
      <AnimatePresence initial={false} mode="wait">
        {s.open ? (
          <motion.div key="open" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={spring.smooth} className="flex flex-wrap gap-2">
            <motion.button whileTap={{ scale: 0.95 }} type="button" onClick={() => router.push(`/call/${s.callId}`)} className="h-10 px-4 rounded-full bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white text-sm font-semibold inline-flex items-center gap-1.5">
              <Users className="w-4 h-4" />Go to office hours
            </motion.button>
            <button type="button" disabled={!!busy} onClick={() => void post('extend', { extend: true })} className="h-10 px-3.5 rounded-full bg-zinc-100 dark:bg-white/[0.07] text-sm font-semibold text-zinc-700 dark:text-zinc-200 inline-flex items-center gap-1 disabled:opacity-50">
              {busy === 'extend' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}30 min
            </button>
            <button type="button" disabled={!!busy} onClick={() => void post('close', { open: false })} className="h-10 px-3.5 rounded-full text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 inline-flex items-center gap-1 disabled:opacity-50">
              {busy === 'close' ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}Close
            </button>
          </motion.div>
        ) : (
          <motion.form key="closed" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={spring.smooth} className="space-y-2.5"
            onSubmit={(e) => { e.preventDefault(); void post('open', { open: true, minutes: Number(minutes), topic }); }}>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={80} placeholder="Topic (optional), e.g. Essay questions" aria-label="Topic"
              className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.04] px-3 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40" />
            <Segmented label="How long" value={minutes} onChange={setMinutes} segments={LENGTHS.map((l) => ({ value: l.value, label: l.label }))} className="w-full" />
            <button type="submit" disabled={!!busy} className="btn-primary w-full">
              {busy === 'open' ? <Loader2 className="w-4 h-4 animate-spin" /> : <DoorOpen className="w-4 h-4" />}Open office hours
            </button>
          </motion.form>
        )}
      </AnimatePresence>
      {s.notes.length > 0 && (
        <div className="pt-1 border-t border-zinc-200/70 dark:border-white/[0.06]">
          <p className="pt-2.5 pb-1 text-xs font-semibold text-zinc-500 flex items-center gap-1.5"><NotebookPen className="w-3.5 h-3.5" />Your notes from office hours</p>
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="flex gap-2.5 text-sm">
                <Avatar name={n.student.name} src={n.student.avatar} size={28} />
                <span className="min-w-0">
                  <span className="text-xs text-zinc-500"><span className="font-semibold text-zinc-700 dark:text-zinc-300">{n.student.name}</span> · {formatDistanceToNowStrict(new Date(n.createdAt), { addSuffix: true })}</span>
                  <span className="block text-zinc-700 dark:text-zinc-200 whitespace-pre-line line-clamp-3">{n.body}</span>
                </span>
              </li>
            ))}
          </ul>
          {s.notes.length > 3 && <button type="button" onClick={() => setAllNotes((v) => !v)} className="mt-2 text-xs font-semibold text-indigo-600 dark:text-indigo-300">{allNotes ? 'Show fewer' : `Show all ${s.notes.length}`}</button>}
        </div>
      )}
    </motion.section>
  );
}

/** In the waiting room of office hours: my place in line and the expected wait. */
export function QueueStatus({ queue, hostHere }: { queue: { pos: number; waiting: number; etaMin: number } | null; hostHere: boolean }) {
  const [alerts, setAlerts] = useState(() => (typeof Notification === 'undefined' ? 'denied' : Notification.permission));
  const head = !queue ? 'You’re in line' : queue.pos === 1 ? 'You’re next' : `You’re ${ordinal(queue.pos)} in line`;
  const wait = !queue ? null : queue.etaMin <= 1 ? 'Any moment now' : `About ${queue.etaMin} min`;
  return (
    <div className="space-y-3">
      <div>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p key={head} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring.snappy} className="text-2xl font-bold" role="status" aria-live="polite">{head}</motion.p>
        </AnimatePresence>
        <p className="text-sm text-zinc-400 mt-1">
          {[wait, queue && queue.waiting > 1 ? `${queue.waiting} in line` : null].filter(Boolean).join(' · ') || ' '}
        </p>
      </div>
      <p className="text-sm text-zinc-400">{hostHere ? 'Keep this page open: the call starts by itself when it’s your turn.' : 'Your teacher isn’t in yet. You keep your place, and the call starts by itself when it’s your turn.'}</p>
      {alerts === 'default' && (
        <button type="button" onClick={() => void Notification.requestPermission().then(setAlerts).catch(() => {})} className="px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/20 text-sm font-medium inline-flex items-center gap-1.5">
          <BellRing className="w-4 h-4" />Alert me when it’s my turn
        </button>
      )}
    </div>
  );
}

/** The teacher's bar in office hours: how many wait, notes about the student with them, "Next student". */
export function OfficeBar({ line, students, onNext }: { line: { waiting: number; avgMin: number } | null; students: { userId: string; name: string }[]; onNext: () => void }) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [who, setWho] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const student = students.find((p) => p.userId === who) ?? students[0] ?? null;
  const { data: earlier, mutate } = useSWR<Note[]>(notesOpen && student ? `/api/office-hours/notes?studentId=${encodeURIComponent(student.userId)}` : null, authedJson);
  const save = async () => {
    if (!student || !body.trim()) return;
    setSaving(true);
    try {
      const n = await authedJson<Note>('/api/office-hours/notes', { method: 'POST', body: JSON.stringify({ studentId: student.userId, body }) });
      void mutate((l) => [n, ...(l ?? [])], { revalidate: false });
      setBody('');
      toast.success(`Saved to your notes about ${student.name}`);
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  const waiting = line?.waiting ?? 0;
  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring.smooth} className="pointer-events-auto w-[min(94vw,26rem)] flex flex-col items-stretch gap-2">
      <div className="flex items-center gap-2 rounded-full bg-black/55 backdrop-blur-xl border border-white/10 pl-3.5 pr-1.5 py-1.5">
        <DoorOpen className="w-4 h-4 text-emerald-300 shrink-0" />
        <span className="flex-1 min-w-0 text-xs font-semibold truncate" role="status" aria-live="polite">
          {waiting ? `${waiting} waiting · about ${Math.round(line?.avgMin ?? 5)} min each` : 'Nobody waiting'}
        </span>
        {student && (
          <button type="button" onClick={() => setNotesOpen((v) => !v)} aria-expanded={notesOpen} className={cn('h-8 px-3 rounded-full text-xs font-semibold inline-flex items-center gap-1', notesOpen ? 'bg-white text-zinc-900' : 'bg-white/10 hover:bg-white/20')}>
            <NotebookPen className="w-3.5 h-3.5" />Notes
          </button>
        )}
        <motion.button whileTap={{ scale: 0.94 }} type="button" onClick={onNext} disabled={!waiting && !students.length} className="h-8 px-3 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-xs font-bold inline-flex items-center gap-0.5 disabled:opacity-40">
          {students.length ? (waiting ? 'Next student' : 'End turn') : 'Let next in'}<ChevronRight className="w-3.5 h-3.5" />
        </motion.button>
      </div>
      <AnimatePresence>
        {notesOpen && student && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={spring.smooth}
            className="rounded-2xl bg-[#121830]/95 backdrop-blur-xl border border-white/10 p-3 shadow-2xl space-y-2" role="dialog" aria-label="Office hours notes">
            {students.length > 1 ? (
              <Segmented label="About" value={student.userId} onChange={setWho} segments={students.map((p) => ({ value: p.userId, label: p.name.split(' ')[0] }))} className="w-full" />
            ) : (
              <p className="text-xs font-semibold text-zinc-300">Notes about {student.name} <span className="font-normal text-zinc-500">· only you see these</span></p>
            )}
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={2000} placeholder="What you talked about, what to follow up on…" aria-label={`Note about ${student.name}`}
              className="w-full rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400/40 resize-none" />
            <div className="flex justify-end">
              <button type="button" disabled={saving || !body.trim()} onClick={() => void save()} className="h-8 px-3.5 rounded-full bg-white text-zinc-900 text-xs font-bold inline-flex items-center gap-1 disabled:opacity-40">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Save note
              </button>
            </div>
            {!!earlier?.length && (
              <ul className="max-h-36 overflow-y-auto space-y-1.5 border-t border-white/10 pt-2">
                {earlier.map((n) => (
                  <li key={n.id} className="text-xs"><span className="text-zinc-500">{formatDistanceToNowStrict(new Date(n.createdAt), { addSuffix: true })}</span><span className="block text-zinc-200 whitespace-pre-line">{n.body}</span></li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** It's my turn: a chime, and a system notification if I'm looking at another tab or app. */
export function turnAlert(title: string) {
  chime();
  if (typeof document === 'undefined' || !document.hidden || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const opts = { body: `${title}: you can talk now.`, tag: 'office-turn', icon: '/icon-192x192.png' };
  // Phones only show notifications through the service worker.
  void navigator.serviceWorker?.getRegistration().then((r) => { if (r) return r.showNotification('It’s your turn', opts); new Notification('It’s your turn', opts); }).catch(() => {});
}
