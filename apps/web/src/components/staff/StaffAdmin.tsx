'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR, { mutate as revalidate } from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { addDays, format } from 'date-fns';
import { Check, ChevronLeft, ChevronRight, Loader2, MapPin, UserCheck, X } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Segmented } from '@/components/ui/Segmented';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { LoadError } from '@/components/ui/LoadError';
import { promptDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { fadeUp, list } from '@/lib/motion';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { LeaveChip, LEAVE_LABEL, dayLabel, range } from './shared';

// Staff for managers (Stage 5 · B15.8; src/server/staff.ts): today's register (in, on leave, not in
// yet), leave requests to approve or decline, and cover: every class an absent teacher misses this
// week, with the teachers free at that time (fewest covers this week first).

type View = 'today' | 'leave' | 'cover';
interface RegisterRow { id: string; name: string; email: string; avatar: string | null; status: 'in' | 'leave' | 'missing'; inAt: string | null; outAt: string | null; leaveType: string | null }
interface Register { date: string; counts: { in: number; leave: number; missing: number }; rows: RegisterRow[] }
interface LeaveRow { id: string; type: string; fromDate: string; toDate: string; reason: string | null; status: string; decisionNote: string | null; user: { id: string; name: string; avatar: string | null }; _count: { covers: number } }
interface Need { date: string; slotId: string; start: string; end: string; type: string; room: string | null; course: { code: string; name: string }; absent: { id: string; name: string }; leaveId: string; cover: { id: string; name: string } | null }
interface Cover { from: string; to: string; needs: Need[]; uncovered: number }

const card = 'rounded-3xl tone-panel border border-zinc-200 dark:border-white/10';
const ymd = (d: Date) => format(d, 'yyyy-MM-dd');

export function StaffAdmin() {
  const [view, setView] = useState<View>('today');
  useEffect(() => {
    const t = setTimeout(() => { const v = new URLSearchParams(window.location.search).get('view'); if (v === 'leave' || v === 'cover') setView(v); }, 0);
    return () => clearTimeout(t);
  }, []);
  const { data: pending } = useSWR<{ pending: number }>('/api/staff/leave?status=PENDING', authedJson);
  return (
    <div className="space-y-4">
      <Segmented<View> label="Show" value={view} onChange={setView} className="w-full sm:w-auto" segments={[
        { value: 'today', label: 'Today' },
        { value: 'leave', label: <span className="inline-flex items-center gap-1.5">Leave{pending?.pending ? <><span aria-hidden className="min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold inline-flex items-center justify-center">{pending.pending}</span><span className="sr-only">, {pending.pending} waiting</span></> : null}</span> },
        { value: 'cover', label: 'Cover' },
      ]} />
      <motion.div key={view} variants={fadeUp} initial="hidden" animate="show">
        {view === 'today' ? <TodayView /> : view === 'leave' ? <LeaveView /> : <CoverView />}
      </motion.div>
    </div>
  );
}

function TodayView() {
  const [date, setDate] = useState(() => ymd(new Date()));
  const { data, error, mutate } = useSWR<Register>(`/api/staff/register?date=${date}`, authedJson, { refreshInterval: 60_000 });
  if (error && !data) return <LoadError onRetry={() => mutate()} />;
  if (!data) return <ContentSkeleton variant="list" />;
  const groups: [RegisterRow['status'], string][] = [['missing', 'Not in yet'], ['in', 'In'], ['leave', 'On leave']];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Previous day" onClick={() => setDate(ymd(addDays(new Date(`${date}T12:00:00`), -1)))} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10"><ChevronLeft className="w-4 h-4" /></button>
        <input type="date" aria-label="Day" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="input w-auto" />
        <button type="button" aria-label="Next day" onClick={() => setDate(ymd(addDays(new Date(`${date}T12:00:00`), 1)))} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10"><ChevronRight className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[['In', data.counts.in, 'text-emerald-700 dark:text-emerald-300'], ['On leave', data.counts.leave, 'text-indigo-700 dark:text-indigo-300'], ['Not in yet', data.counts.missing, 'text-amber-800 dark:text-amber-300']].map(([k, v, tone]) => (
          <div key={k as string} className={`${card} p-3`}><p className={cn('text-2xl font-black tabular-nums', tone as string)}>{v as number}</p><p className="text-[11px] text-zinc-500">{k as string}</p></div>
        ))}
      </div>
      {groups.map(([status, title]) => {
        const rows = data.rows.filter((r) => r.status === status);
        if (!rows.length) return null;
        return (
          <section key={status} className={`${card} p-2 sm:p-3`} aria-label={title}>
            <h2 className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title} · {rows.length}</h2>
            <motion.ul variants={list} initial="hidden" animate="show" className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
              {rows.map((r) => (
                <motion.li key={r.id} variants={fadeUp} className="px-3 py-2 flex items-center gap-3">
                  <Avatar name={r.name} src={r.avatar} size={32} />
                  <span className="flex-1 min-w-0 text-sm font-semibold text-zinc-900 dark:text-white truncate">{r.name}</span>
                  <span className="text-xs text-zinc-500 tabular-nums shrink-0">{r.status === 'in' ? `${format(new Date(r.inAt!), 'HH:mm')}${r.outAt ? `–${format(new Date(r.outAt), 'HH:mm')}` : ''}` : r.status === 'leave' ? LEAVE_LABEL[r.leaveType ?? ''] ?? 'Leave' : ''}</span>
                </motion.li>
              ))}
            </motion.ul>
          </section>
        );
      })}
      {data.rows.length === 0 && <p className={`${card} p-8 text-center text-sm text-zinc-500`}>No staff accounts yet.</p>}
    </div>
  );
}

function LeaveView() {
  const { data, error, mutate } = useSWR<{ pending: number; rows: LeaveRow[] }>('/api/staff/leave', authedJson);
  const [busy, setBusy] = useState<string | null>(null);
  if (error && !data) return <LoadError onRetry={() => mutate()} />;
  if (!data) return <ContentSkeleton variant="list" />;
  const decide = async (l: LeaveRow, action: 'approve' | 'decline') => {
    const note = action === 'decline'
      ? await promptDialog({ title: `Decline ${l.user.name.split(' ')[0]}’s leave?`, message: range(l.fromDate, l.toDate), placeholder: 'A short reason they’ll see (optional)', confirmLabel: 'Decline' })
      : '';
    if (note == null) return;
    setBusy(l.id);
    try {
      await authedJson(`/api/staff/leave/${l.id}`, { method: 'POST', body: JSON.stringify({ action, note }) });
      haptic('success');
      toast.success(action === 'approve' ? 'Approved' : 'Declined', { description: action === 'approve' ? 'Plan cover for their classes under Cover.' : undefined });
      void mutate();
      void revalidate('/api/staff/leave?status=PENDING');
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t do that.')); }
    finally { setBusy(null); }
  };
  if (!data.rows.length) return <p className={`${card} p-8 text-center text-sm text-zinc-500`}>No leave requests in the last two months.</p>;
  return (
    <motion.ul variants={list} initial="hidden" animate="show" className={`${card} p-2 sm:p-3 divide-y divide-zinc-200/70 dark:divide-white/[0.06]`}>
      {data.rows.map((l) => (
        <motion.li key={l.id} variants={fadeUp} className="px-3 py-3 flex items-start gap-3">
          <Avatar name={l.user.name} src={l.user.avatar} size={36} />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-zinc-900 dark:text-white">{l.user.name}</span>
            <span className="block text-xs text-zinc-600 dark:text-zinc-300">{LEAVE_LABEL[l.type] ?? 'Leave'} · {range(l.fromDate, l.toDate)}</span>
            {l.reason && <span className="block text-xs text-zinc-500 break-words">{l.reason}</span>}
            {l.decisionNote && <span className="block text-xs text-zinc-500">Note: {l.decisionNote}</span>}
            {l.status === 'APPROVED' && l._count.covers > 0 && <span className="block text-[11px] text-emerald-700 dark:text-emerald-300">{l._count.covers} class{l._count.covers === 1 ? '' : 'es'} covered</span>}
            {l.status === 'PENDING' && (
              <span className="mt-2 flex gap-2">
                <button type="button" disabled={busy === l.id} onClick={() => void decide(l, 'approve')} className="btn-primary btn-sm">{busy === l.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Approve</button>
                <button type="button" disabled={busy === l.id} onClick={() => void decide(l, 'decline')} className="btn-secondary btn-sm"><X className="w-4 h-4" /> Decline</button>
              </span>
            )}
          </span>
          <LeaveChip status={l.status} />
        </motion.li>
      ))}
    </motion.ul>
  );
}

function CoverView() {
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); });
  const to = ymd(addDays(new Date(`${from}T12:00:00`), 6));
  const key = `/api/staff/cover?from=${from}&to=${to}`;
  const { data, error, mutate } = useSWR<Cover>(key, authedJson);
  const days = useMemo(() => {
    const out: { date: string; needs: Need[] }[] = [];
    for (const n of data?.needs ?? []) { const last = out.at(-1); if (last?.date === n.date) last.needs.push(n); else out.push({ date: n.date, needs: [n] }); }
    return out;
  }, [data]);
  const shift = (n: number) => setFrom(ymd(addDays(new Date(`${from}T12:00:00`), n * 7)));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" aria-label="Previous week" onClick={() => shift(-1)} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10"><ChevronLeft className="w-4 h-4" /></button>
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{dayLabel(from)} – {dayLabel(to)}</p>
        <button type="button" aria-label="Next week" onClick={() => shift(1)} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10"><ChevronRight className="w-4 h-4" /></button>
      </div>
      {error && !data ? <LoadError onRetry={() => mutate()} />
        : !data ? <ContentSkeleton variant="list" />
        : days.length === 0 ? <p className={`${card} p-8 text-center text-sm text-zinc-500`}>No approved leave this week, so no classes to cover.</p>
        : (
          <>
            <p className={cn('text-sm', data.uncovered ? 'text-amber-800 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300')}>{data.uncovered ? `${data.uncovered} of ${data.needs.length} classes still need someone` : `All ${data.needs.length} classes are covered`}</p>
            {days.map((d) => (
              <section key={d.date} className={`${card} p-2 sm:p-3`} aria-label={dayLabel(d.date)}>
                <h2 className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{format(new Date(`${d.date}T12:00:00`), 'EEEE d MMMM')}</h2>
                <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
                  {d.needs.map((n) => <NeedRow key={`${n.date}-${n.slotId}`} n={n} onChanged={() => void mutate()} />)}
                </ul>
              </section>
            ))}
          </>
        )}
    </div>
  );
}

function NeedRow({ n, onChanged }: { n: Need; onChanged: () => void }) {
  const [picking, setPicking] = useState(false);
  const { data } = useSWR<{ free: { id: string; name: string; avatar: string | null; coversThisWeek: number }[] }>(picking ? `/api/staff/cover/free?date=${n.date}&slotId=${n.slotId}` : null, authedJson);
  const [busy, setBusy] = useState(false);
  const set = async (coverTeacherId: string | null) => {
    setBusy(true);
    try {
      await authedJson('/api/staff/cover', { method: 'POST', body: JSON.stringify({ date: n.date, slotId: n.slotId, leaveId: n.leaveId, coverTeacherId }) });
      haptic('success');
      toast.success(coverTeacherId ? 'Cover set: they’ve been told' : 'Cover cleared');
      setPicking(false);
      onChanged();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t set the cover.')); }
    finally { setBusy(false); }
  };
  return (
    <li className="px-3 py-2.5">
      <div className="flex items-start gap-3">
        <span className="w-24 shrink-0 text-sm font-semibold tabular-nums text-zinc-900 dark:text-white">{n.start}–{n.end}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{n.course.code} · {n.course.name}</span>
          <span className="block text-xs text-zinc-500">{n.absent.name} away{n.room ? <> · <MapPin className="inline w-3 h-3 -mt-0.5" aria-hidden /> {n.room}</> : null}</span>
          {n.cover && <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><UserCheck className="w-3.5 h-3.5" aria-hidden /> {n.cover.name}</span>}
        </span>
        <button type="button" onClick={() => setPicking((p) => !p)} aria-expanded={picking} className={cn('btn-sm shrink-0', n.cover ? 'btn-ghost' : 'btn-primary')}>{n.cover ? 'Change' : 'Find cover'}</button>
      </div>
      {picking && (
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="mt-2 rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] p-2">
          {!data ? <p className="text-sm text-zinc-500 p-2">Finding who’s free…</p> : data.free.length === 0 ? <p className="text-sm text-zinc-500 p-2">Nobody is free then.</p> : (
            <ul className="max-h-60 overflow-y-auto">
              {data.free.map((t) => (
                <li key={t.id}>
                  <button type="button" disabled={busy || n.cover?.id === t.id} onClick={() => void set(t.id)} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.05] disabled:opacity-60">
                    <Avatar name={t.name} src={t.avatar} size={28} />
                    <span className="flex-1 min-w-0 text-sm text-zinc-900 dark:text-white truncate">{t.name}</span>
                    <span className="text-[11px] text-zinc-500 shrink-0">{t.coversThisWeek ? `${t.coversThisWeek} cover${t.coversThisWeek === 1 ? '' : 's'} this week` : 'No covers this week'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {n.cover && <button type="button" disabled={busy} onClick={() => void set(null)} className="btn-ghost btn-sm mt-1 text-rose-600 dark:text-rose-400">Nobody covers</button>}
        </motion.div>
      )}
    </li>
  );
}
