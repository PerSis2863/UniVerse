'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { CalendarOff, CalendarPlus, Clock, Loader2, LogIn, LogOut, MapPin, Users, X } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Field } from '@/components/ui/Field';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { LoadError } from '@/components/ui/LoadError';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { fadeUp, list } from '@/lib/motion';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { LeaveChip, LEAVE_LABEL, dayLabel, range } from './shared';
import { MyRegisters } from '@/components/registers/MyRegisters';

// A teacher's staff page (Stage 5 · B15.8; src/server/staff.ts): mark yourself in and out today,
// ask for leave (and cancel it), and see the classes you've been asked to cover.

interface Leave { id: string; type: string; fromDate: string; toDate: string; reason: string | null; status: string; decisionNote: string | null; decidedAt: string | null }
interface Cover { id: string; date: string; start: string; end: string; type: string; room: string | null; course: { code: string; name: string }; absent: string; note: string | null }
interface Data { today: string; inAt: string | null; outAt: string | null; leave: Leave[]; covers: Cover[] }

const card = 'rounded-3xl tone-panel border border-zinc-200 dark:border-white/10';
const todayLocal = () => format(new Date(), 'yyyy-MM-dd');

export function MyStaff() {
  const [today] = useState(todayLocal);
  const key = `/api/staff/me?today=${today}`;
  const { data, error, mutate } = useSWR<Data>(key, authedJson);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  if (error && !data) return <LoadError onRetry={() => mutate()} />;
  if (!data) return <ContentSkeleton variant="list" />;

  const mark = async (action: 'in' | 'out') => {
    setBusy(action);
    try {
      await authedJson('/api/staff/me', { method: 'POST', body: JSON.stringify({ action, date: data.today }) });
      haptic('success');
      toast.success(action === 'in' ? 'Marked in. Have a good day!' : 'Marked out');
      void mutate();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t do that.')); }
    finally { setBusy(null); }
  };
  const cancel = async (l: Leave) => {
    if (!(await confirmDialog({ title: 'Cancel this leave?', message: `${range(l.fromDate, l.toDate)}.${l.status === 'APPROVED' ? ' Anyone covering your classes is told.' : ''}`, confirmLabel: 'Cancel leave', destructive: true }))) return;
    try {
      await authedJson('/api/staff/me', { method: 'POST', body: JSON.stringify({ action: 'cancel', leaveId: l.id }) });
      toast.success('Leave cancelled');
      void mutate();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t cancel the leave.')); }
  };
  const onLeave = data.leave.find((l) => l.status === 'APPROVED' && l.fromDate <= data.today && l.toDate >= data.today);

  return (
    <div className="space-y-4">
      <motion.section variants={fadeUp} initial="hidden" animate="show" className={`${card} p-4 sm:p-5`} aria-labelledby="today-title">
        <h2 id="today-title" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Today · {format(new Date(`${data.today}T12:00:00`), 'EEEE d MMMM')}</h2>
        {onLeave ? (
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200 flex items-center gap-2"><CalendarOff className="w-4 h-4 text-indigo-500" aria-hidden /> You’re on {LEAVE_LABEL[onLeave.type]?.toLowerCase() ?? 'leave'} today.</p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-200">
              {data.inAt ? <>In since <span className="font-semibold tabular-nums">{format(new Date(data.inAt), 'HH:mm')}</span>{data.outAt ? <> · out at <span className="font-semibold tabular-nums">{format(new Date(data.outAt), 'HH:mm')}</span></> : null}</> : 'You haven’t marked yourself in yet.'}
            </p>
            {!data.inAt || data.outAt
              ? <button type="button" onClick={() => void mark('in')} disabled={!!busy} className="btn-primary btn-sm">{busy === 'in' ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />} {data.outAt ? 'Back in' : 'I’m in'}</button>
              : <button type="button" onClick={() => void mark('out')} disabled={!!busy} className="btn-secondary btn-sm">{busy === 'out' ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />} I’m leaving</button>}
          </div>
        )}
      </motion.section>

      <motion.section variants={fadeUp} initial="hidden" animate="show" className={`${card} p-2 sm:p-3`} aria-labelledby="covers-title">
        <h2 id="covers-title" className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Classes you’re covering</h2>
        {data.covers.length === 0 ? <p className="px-3 pb-3 text-sm text-zinc-500">None coming up.</p> : (
          <motion.ul variants={list} initial="hidden" animate="show" className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
            {data.covers.map((c) => (
              <motion.li key={c.id} variants={fadeUp} className="px-3 py-2.5 flex items-start gap-3">
                <span className="w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-700 dark:text-amber-300 flex flex-col items-center justify-center shrink-0 leading-none">
                  <span className="text-[10px] font-semibold uppercase">{format(new Date(`${c.date}T12:00:00`), 'EEE')}</span>
                  <span className="text-sm font-black">{format(new Date(`${c.date}T12:00:00`), 'd')}</span>
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-zinc-900 dark:text-white">{c.course.code} · {c.course.name}</span>
                  <span className="block text-xs text-zinc-500 flex flex-wrap gap-x-3">
                    <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" aria-hidden />{dayLabel(c.date)} {c.start}–{c.end}</span>
                    {c.room && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" aria-hidden />{c.room}</span>}
                    <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" aria-hidden />for {c.absent}</span>
                  </span>
                  {c.note && <span className="block text-xs text-zinc-600 dark:text-zinc-300 mt-0.5">{c.note}</span>}
                </span>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </motion.section>

      <motion.section variants={fadeUp} initial="hidden" animate="show" className={`${card} p-2 sm:p-3`} aria-labelledby="leave-title">
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <h2 id="leave-title" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Your leave</h2>
          <button type="button" onClick={() => setAsking(true)} className="btn-primary btn-sm"><CalendarPlus className="w-4 h-4" /> Ask for leave</button>
        </div>
        {data.leave.length === 0 ? <p className="px-3 pb-3 text-sm text-zinc-500">No leave in the last three months.</p> : (
          <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
            {data.leave.map((l) => (
              <li key={l.id} className="px-3 py-2.5 flex items-start gap-3">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-zinc-900 dark:text-white">{LEAVE_LABEL[l.type] ?? 'Leave'} · {range(l.fromDate, l.toDate)}</span>
                  {l.reason && <span className="block text-xs text-zinc-500 break-words">{l.reason}</span>}
                  {l.decisionNote && <span className="block text-xs text-zinc-600 dark:text-zinc-300">Note: {l.decisionNote}</span>}
                </span>
                <span className="flex flex-col items-end gap-1 shrink-0">
                  <LeaveChip status={l.status} />
                  {['PENDING', 'APPROVED'].includes(l.status) && l.toDate >= data.today && <button type="button" onClick={() => void cancel(l)} className="text-xs font-semibold text-rose-600 dark:text-rose-400 min-h-8 px-1"><X className="inline w-3 h-3 -mt-0.5" aria-hidden /> Cancel</button>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </motion.section>
      {/* Equipment the school lent me (Stage 5 · B15.5); nothing when none. */}
      <MyRegisters url="/api/registers/me" title="Equipment lent to you" />
      {asking && <AskLeave today={data.today} onClose={() => setAsking(false)} onSent={() => { setAsking(false); void mutate(); }} />}
    </div>
  );
}

function AskLeave({ today, onClose, onSent }: { today: string; onClose: () => void; onSent: () => void }) {
  const [type, setType] = useState('PERSONAL');
  const [fromDate, setFrom] = useState(today);
  const [toDate, setTo] = useState(today);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await authedJson('/api/staff/me', { method: 'POST', body: JSON.stringify({ action: 'leave', type, fromDate, toDate: toDate < fromDate ? fromDate : toDate, reason }) });
      haptic('success');
      toast.success('Leave request sent', { description: 'You’ll hear in the app when it’s decided.' });
      onSent();
    } catch (err) { setProblem(errorMessage(err, 'Couldn’t send the request.')); setBusy(false); }
  };
  return (
    <Sheet title="Ask for leave" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <fieldset>
          <legend className="label">Type</legend>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {Object.entries(LEAVE_LABEL).map(([k, v]) => (
              <label key={k} className={cn('min-h-11 px-3 rounded-xl border text-sm flex items-center gap-2 cursor-pointer', type === k ? 'border-indigo-600 bg-indigo-500/10' : 'border-zinc-200 dark:border-white/10')}>
                <input type="radio" name="leave-type" checked={type === k} onChange={() => setType(k)} className="accent-indigo-600" />{v}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First day">{(p) => <input {...p} type="date" required value={fromDate} onChange={(e) => { setFrom(e.target.value); if (toDate < e.target.value) setTo(e.target.value); }} className="input" />}</Field>
          <Field label="Last day">{(p) => <input {...p} type="date" required value={toDate} min={fromDate} onChange={(e) => setTo(e.target.value)} className="input" />}</Field>
        </div>
        <Field label="Reason (optional)" hint="Seen by whoever approves leave." count={reason.length} max={500}>
          {(p) => <textarea {...p} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="input" />}
        </Field>
        {problem && <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">{problem}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Send request</button>
      </form>
    </Sheet>
  );
}
