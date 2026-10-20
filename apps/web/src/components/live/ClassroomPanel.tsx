'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { formatDistanceToNowStrict } from 'date-fns';
import { Check, Link2, Loader2, Mic, MicOff, QrCode, School, Square, Video } from 'lucide-react';
import { Switch } from '@/components/ui/Switch';
import Link from '@/components/ui/Link';
import { RotatingQr } from '@/components/ui/RotatingQr';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { useLiveInterval } from '@/lib/realtime-client';
import { captionsSupported, useCaptions } from '@/lib/use-captions';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

// Teacher's Live page → In-person class (Stage 5 · D7, src/server/classroom.ts): start a session,
// project the changing code, watch who's here and who's lost, read questions, take notes with the
// laptop's microphone, and end it (the notes become the class's study pack).

type View = {
  id: string; course: { id: string; code: string; name: string }; startedAt: string; open: boolean; classSessionId: string | null; enrolled: number;
  mood: { lost: number; ok: number; total: number };
  questions: { id: string; text: string; answeredAt: string | null; createdAt: string }[];
  notes: number;
  /** The course's class call when it's running (Stage 5 · Q22): its students, lost and following. */
  call?: { lost: number; got: number; total: number; linked: boolean } | null;
  linked?: boolean;
};
type Line = { t: number; who: string; text: string };

export function ClassroomPanel({ courseId }: { courseId: string }) {
  const key = `/api/classroom?courseId=${courseId}`;
  const { data, mutate } = useSWR<{ session: { id: string } | null }>(key, authedJson);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try { await authedJson('/api/classroom', { method: 'POST', body: JSON.stringify({ courseId }) }); await mutate(); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t start the class.')); }
    finally { setBusy(false); }
  };

  if (!data) return <div className="h-28 rounded-2xl skeleton" />;
  if (!data.session) {
    return (
      <section className="panel p-5 flex flex-col sm:flex-row sm:items-center gap-4" aria-labelledby="inperson-title">
        <span className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center shrink-0"><School className="w-6 h-6 text-indigo-600 dark:text-indigo-300" /></span>
        <div className="flex-1">
          <h2 id="inperson-title" className="font-semibold text-zinc-900 dark:text-white">In-person class</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Show a code on the projector: students join on their phones (that takes attendance), tell you when they’re lost and send questions. Your laptop can take notes for a study pack.</p>
        </div>
        <button type="button" onClick={() => void start()} disabled={busy} className="btn-primary shrink-0">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <School className="w-4 h-4" />} Start class</button>
      </section>
    );
  }
  return <RunningClass id={data.session.id} onEnded={() => void mutate()} />;
}

function RunningClass({ id, onEnded }: { id: string; onEnded: () => void }) {
  const refreshInterval = useLiveInterval(8000, 30_000); // students' check-ins and moods arrive live
  const { data, mutate } = useSWR<View>(`/api/classroom/${id}`, authedJson, { refreshInterval });
  const me = useAuthStore((s) => s.user?.name) ?? 'Teacher';
  const [showCode, setShowCode] = useState(false);
  const [notesOn, setNotesOn] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const [ending, setEnding] = useState(false);
  const queue = useRef<Line[]>([]);

  // Notes: the laptop's speech recognition → lines, sent every 15 seconds (and when stopping).
  const startedAt = data ? new Date(data.startedAt).getTime() : 0;
  useCaptions(notesOn, (text, final) => {
    if (final) queue.current.push({ t: Math.max(0, Math.round((Date.now() - startedAt) / 1000)), who: me, text });
  }, (why) => { setNotesOn(false); toast.error(why); });
  const flush = async () => {
    const lines = queue.current.splice(0);
    if (!lines.length) return;
    try { const r = await authedJson<{ notes: number }>(`/api/classroom/${id}`, { method: 'POST', body: JSON.stringify({ action: 'transcript', lines }) }); setSaved(r.notes); }
    catch { queue.current.unshift(...lines); }
  };
  const flushRef = useRef(flush);
  useEffect(() => { flushRef.current = flush; });
  useEffect(() => {
    if (!notesOn) return;
    const t = setInterval(() => void flushRef.current(), 15_000);
    return () => { clearInterval(t); void flushRef.current(); };
  }, [notesOn]);

  const answer = async (qid: string) => {
    try { await authedJson(`/api/classroom/${id}`, { method: 'POST', body: JSON.stringify({ action: 'answer', questionId: qid }) }); void mutate(); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t update the question.')); }
  };

  const end = async () => {
    const notes = (saved ?? data?.notes ?? 0) + queue.current.length;
    if (!(await confirmDialog({ title: 'End the class?', message: notes ? `Students can’t join any more. Your ${notes} lines of notes become the study pack for the class.` : 'Students can’t join any more.', confirmLabel: 'End class' }))) return;
    setEnding(true);
    setNotesOn(false);
    await flush();
    try {
      const r = await authedJson<{ message: string; classSessionId: string | null }>(`/api/classroom/${id}`, { method: 'POST', body: JSON.stringify({ action: 'end' }) });
      toast.success(r.message);
      onEnded();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t end the class.')); }
    finally { setEnding(false); }
  };

  if (!data) return <div className="h-40 rounded-2xl skeleton" />;
  // A hybrid class: the linked call's students on the same meter.
  const online = data.linked && data.call ? data.call : null;
  const room = data.mood.total;
  const joined = room + (online?.total ?? 0);
  const lost = data.mood.lost + (online?.lost ?? 0), following = data.mood.ok + (online?.got ?? 0);
  const lostShare = joined ? lost / joined : 0;
  const link = async (on: boolean) => {
    try {
      const r = await authedJson<{ marked: number }>(`/api/classroom/${id}`, { method: 'POST', body: JSON.stringify({ action: 'link', on }) });
      toast.success(on ? `Linked: one class in the room and online${r.marked ? ` (${r.marked} marked present)` : ''}` : 'Not linked any more');
      void mutate();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t change that.')); }
  };
  const open = data.questions.filter((q) => !q.answeredAt);

  return (
    <section className="panel p-5 space-y-5" aria-labelledby="inperson-live-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">● In class now</p>
          <h2 id="inperson-live-title" className="font-semibold text-zinc-900 dark:text-white">{data.course.code} · {data.course.name}</h2>
          <p className="text-xs text-zinc-500">Started {formatDistanceToNowStrict(new Date(data.startedAt), { addSuffix: true })} · {online ? `${room} in the room, ${online.total} online, of ${data.enrolled}` : `${joined} of ${data.enrolled} joined`}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowCode(true)} className="btn-primary"><QrCode className="w-4 h-4" /> Show the code</button>
          <button type="button" onClick={() => void end()} disabled={ending} className="btn-secondary">{ending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />} End class</button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className={cn('rounded-2xl p-4 border', lostShare >= 0.2 ? 'border-amber-500/40 bg-amber-500/5' : 'border-zinc-200/70 dark:border-white/[0.07]')} aria-live="polite">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Right now</p>
          <p className="text-2xl font-black tabular-nums text-zinc-900 dark:text-white">{lost} lost <span className="text-base font-semibold text-zinc-500">· {following} following</span></p>
          {online && <p className="text-xs text-zinc-600 dark:text-zinc-400">Room and online together ({online.lost} lost online)</p>}
          <div className="mt-2 h-2 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden" role="img" aria-label={`${Math.round(lostShare * 100)}% of the class is lost`}>
            <div className="h-full rounded-full bg-amber-500 transition-[width] duration-500" style={{ width: `${Math.round(lostShare * 100)}%` }} />
          </div>
          {lostShare >= 0.2 && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">A fifth of the class is lost: a good moment to explain it another way.</p>}
        </div>
        <div className="rounded-2xl p-4 border border-zinc-200/70 dark:border-white/[0.07]">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Class notes for the study pack</p>
          {captionsSupported() ? (
            <>
              <p className="text-sm text-zinc-900 dark:text-white mt-1">{notesOn ? 'Listening through this laptop…' : 'Off'} · {saved ?? data.notes} lines saved</p>
              <button type="button" onClick={() => setNotesOn(!notesOn)} aria-pressed={notesOn} className={cn('btn-sm mt-2', notesOn ? 'btn-secondary' : 'btn-primary')}>
                {notesOn ? <><MicOff className="w-4 h-4" /> Stop notes</> : <><Mic className="w-4 h-4" /> Take notes</>}
              </button>
            </>
          ) : <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">Notes need Chrome, Edge or Safari on this laptop.</p>}
        </div>
      </div>

      {(data.call || data.linked) && (
        <div className="rounded-2xl p-4 border border-zinc-200/70 dark:border-white/[0.07] flex flex-wrap items-center gap-3">
          <Video className="w-5 h-5 text-indigo-600 dark:text-indigo-300 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">{data.call ? `This course’s class call is live: ${data.call.total} online` : 'No one is in the class call right now'}</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">Linked, it’s one class: students in the call count on the meter (never who) and are marked present like those in the room. They ask the class TA in the call.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-zinc-500" aria-hidden />
            <Switch checked={!!data.linked} onChange={(v) => void link(v)} label="Link the class call to this class" />
          </div>
          <Link href={`/call/c_${data.course.id}?kind=video`} className="btn-ghost btn-sm">Open the call</Link>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-2">Questions {open.length ? `(${open.length} new)` : ''}</h3>
        {data.questions.length ? (
          <ul className="space-y-2">
            {data.questions.map((q) => (
              <li key={q.id} className={cn('flex items-start gap-3 rounded-2xl border p-3', q.answeredAt ? 'border-zinc-200/50 dark:border-white/[0.05] opacity-70' : 'border-indigo-500/30 bg-indigo-500/5')}>
                <p className="flex-1 text-sm text-zinc-900 dark:text-white">{q.text}</p>
                <button type="button" onClick={() => void answer(q.id)} aria-pressed={!!q.answeredAt} className="btn-ghost btn-sm shrink-0"><Check className="w-4 h-4" /> {q.answeredAt ? 'Answered' : 'Mark answered'}</button>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-zinc-500">Students’ questions appear here, without their names.</p>}
      </div>
      <p className="text-xs text-zinc-500">Polls below go to everyone in the course, in the room and online. Attendance is in <Link href="/teacher/attendance" className="underline">Attendance</Link>.</p>

      <AnimatePresence>
        {showCode && <RotatingQr endpoint={`/api/classroom/${id}/code`} path="/student/live" title={`Join ${data.course.code}`} showCode onClose={() => setShowCode(false)} />}
      </AnimatePresence>
    </section>
  );
}
