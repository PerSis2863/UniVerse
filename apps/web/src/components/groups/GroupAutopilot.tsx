'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { m as motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Bell, CalendarClock, CheckCircle2, Clock, Loader2, RefreshCw, Sparkles, Wand2, X } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { LoadError } from '@/components/ui/LoadError';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { fadeUp, list, spring } from '@/lib/motion';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

// Group project autopilot (Stage 5 · D6, server: src/server/group-autopilot.ts). Paste the brief,
// get tasks with suggested owners and a meeting time everyone can make, put them on the group's
// board, then follow progress and fairness week by week and nudge late tasks.

type Task = { title: string; notes: string; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'; estimateHours: number; requiredSkills: string[]; suggestedAssigneeId: string | null; suggestedAssigneeName: string | null; suggestedAssigneeReason: string; dueDaysFromStart: number };
type Slot = { dayOfWeek: number; dayName: string; startTime: string; endTime: string; availableMemberIds: string[]; totalMembers: number; conflicts: { userId: string; userName: string; reason: string }[]; score: number };
type Plan = { id: string; title: string; brief: string; status: 'DRAFT' | 'ACTIVE'; breakdown: Task[]; meetingSlot: Slot | null; board: { id: string; title: string } | null; scheduledCall: { id: string; title: string; startAt: string; durationMin: number } | null };
type Member = { userId: string; name: string; tasksAssigned: number; tasksCompleted: number; tasksOverdue: number; contributionSharePercent: number; status: 'BALANCED' | 'OVERLOADED' | 'UNDER_CONTRIBUTING' };
type Nudge = { taskId: string; taskTitle: string; userId: string; userName: string };
type Report = { id: string; weekNumber: number; summary: string; health: 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK'; createdAt: string; metrics: { members?: Member[]; totalTasks?: number; completedTasks?: number; overdueTasks?: number; fair?: number | null }; nudges: Nudge[] };

const PRIORITY: Record<Task['priority'], string> = {
  LOW: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300',
  MEDIUM: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  HIGH: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  URGENT: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
};
const HEALTH = {
  ON_TRACK: { label: 'On track', cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  AT_RISK: { label: 'At risk', cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  OFF_TRACK: { label: 'Off track', cls: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
} as const;
const STATUS = {
  BALANCED: { label: 'Balanced', cls: 'text-emerald-700 dark:text-emerald-300' },
  OVERLOADED: { label: 'Doing a lot', cls: 'text-amber-700 dark:text-amber-300' },
  UNDER_CONTRIBUTING: { label: 'Needs a hand', cls: 'text-rose-700 dark:text-rose-300' },
} as const;

/** The next time this weekday and time come round in the viewer's own time zone (at least an hour away). */
function nextOccurrence(dayOfWeek: number, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const now = new Date();
  const d = new Date(now);
  d.setHours(h || 0, m || 0, 0, 0);
  const today = (now.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() + ((dayOfWeek - today + 7) % 7));
  if (d.getTime() < now.getTime() + 3_600_000) d.setDate(d.getDate() + 7);
  return d;
}

export function GroupAutopilot({ group, onClose }: { group: { id: string | number; name: string }; onClose: () => void }) {
  const [tab, setTab] = useState<'plan' | 'progress'>('plan');
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-0 sm:p-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div role="dialog" aria-modal="true" aria-labelledby="autopilot-title" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} transition={spring.smooth} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 sm:rounded-2xl w-full max-w-2xl h-full sm:h-[85vh] flex flex-col shadow-2xl">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center gap-3 bg-indigo-50 dark:bg-indigo-900/20 sm:rounded-t-2xl sheet-safe-top">
          <div className="min-w-0">
            <h3 id="autopilot-title" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Wand2 className="w-4 h-4 text-indigo-500" /> Project autopilot</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{group.name}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close autopilot" className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-4 pt-3">
          <Segmented<'plan' | 'progress'> label="Autopilot view" value={tab} onChange={setTab} segments={[{ value: 'plan', label: 'Plan' }, { value: 'progress', label: 'Progress' }]} className="w-full" />
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={tab} variants={fadeUp} initial="hidden" animate="show" exit={{ opacity: 0 }}>
              {tab === 'plan' ? <PlanTab groupId={String(group.id)} onApplied={() => setTab('progress')} /> : <ProgressTab groupId={String(group.id)} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

function PlanTab({ groupId, onApplied }: { groupId: string; onApplied: () => void }) {
  const key = `/api/groups/${groupId}/autopilot/plan`;
  const { data, error, isLoading, mutate } = useSWR<{ plan: Plan | null; candidateMeetingSlots: Slot[] }>(key, authedJson);
  const [editing, setEditing] = useState(false);

  if (error && !data) return <LoadError onRetry={() => mutate()} />;
  if (isLoading && !data) return <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-2xl skeleton" />)}</div>;
  const plan = data?.plan ?? null;
  if (!plan || editing) return <BriefForm groupId={groupId} start={plan} onMade={() => { setEditing(false); void mutate(); }} onCancel={plan ? () => setEditing(false) : undefined} />;
  return plan.status === 'DRAFT'
    ? <DraftPlan groupId={groupId} plan={plan} slots={data?.candidateMeetingSlots ?? []} onRedo={() => setEditing(true)} onApplied={() => { void mutate(); onApplied(); }} />
    : <ActivePlan plan={plan} onNew={() => setEditing(true)} />;
}

function BriefForm({ groupId, start, onMade, onCancel }: { groupId: string; start: Plan | null; onMade: () => void; onCancel?: () => void }) {
  const [f, setF] = useState({ title: start?.title ?? '', brief: start?.brief ?? '', due: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await authedJson<{ aiUsed: boolean; tasks: number }>(`/api/groups/${groupId}/autopilot/plan`, { method: 'POST', body: JSON.stringify({ title: f.title, brief: f.brief, targetDueDate: f.due || undefined }) });
      toast.success(`${r.tasks} tasks planned`, { description: r.aiUsed ? 'Split by AI from your brief.' : 'Split from the lines of your brief.' });
      onMade();
    } catch (err) { toast.error(errorMessage(err, 'Couldn’t make a plan right now.')); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-2xl bg-indigo-500/5 border border-indigo-500/15 p-4 text-sm text-zinc-700 dark:text-zinc-300">
        Paste your assignment brief. Autopilot splits it into tasks, suggests who takes each one from the group’s skills, and finds a weekly meeting time that fits everyone’s classes. Nothing changes until you put the plan on the board.
      </div>
      <Field label="Project name">{(p) => <input {...p} className="input" maxLength={120} placeholder="e.g. Smart campus app" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />}</Field>
      <Field label="Assignment brief" hint="A list (one deliverable per line) gives the most exact tasks." count={f.brief.length} max={4000}>
        {(p) => <textarea {...p} className="input min-h-[9rem]" maxLength={4000} placeholder={'- Research existing solutions\n- Design the screens\n- Build the prototype\n- Test with 5 users\n- Write the report and slides'} value={f.brief} onChange={(e) => setF({ ...f, brief: e.target.value })} />}
      </Field>
      <Field label="Due date (optional)">{(p) => <input {...p} type="date" className="input" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />}</Field>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy || f.brief.trim().length < 10} className="btn-primary">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {busy ? 'Planning…' : 'Make a plan'}</button>
        {onCancel && <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>}
      </div>
    </form>
  );
}

function TaskList({ tasks }: { tasks: Task[] }) {
  return (
    <motion.ul variants={list} initial="hidden" animate="show" className="space-y-2">
      {tasks.map((t, i) => (
        <motion.li key={i} variants={fadeUp} className="rounded-2xl border border-zinc-200/70 dark:border-white/[0.07] p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-sm text-zinc-900 dark:text-white">{t.title}</p>
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', PRIORITY[t.priority] ?? PRIORITY.MEDIUM)}>{t.priority.charAt(0) + t.priority.slice(1).toLowerCase()}</span>
          </div>
          {t.notes && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">{t.notes}</p>}
          <p className="mt-2 text-xs text-zinc-700 dark:text-zinc-300">
            {t.suggestedAssigneeName ? <><b>{t.suggestedAssigneeName}</b> · {t.suggestedAssigneeReason}</> : 'Nobody suggested'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-zinc-500 dark:text-zinc-400"><Clock className="inline w-3 h-3 mr-0.5" />{t.estimateHours} h · due in {t.dueDaysFromStart} day{t.dueDaysFromStart === 1 ? '' : 's'}</span>
            {t.requiredSkills.slice(0, 3).map((s) => <span key={s} className="rounded-full bg-zinc-100 dark:bg-white/[0.06] px-2 py-0.5 text-zinc-700 dark:text-zinc-300">{s}</span>)}
          </div>
        </motion.li>
      ))}
    </motion.ul>
  );
}

function DraftPlan({ groupId, plan, slots, onRedo, onApplied }: { groupId: string; plan: Plan; slots: Slot[]; onRedo: () => void; onApplied: () => void }) {
  const [slotIndex, setSlotIndex] = useState(0);
  const [meet, setMeet] = useState(slots.length > 0);
  const [busy, setBusy] = useState(false);
  const slot = slots[slotIndex];

  const apply = async () => {
    setBusy(true);
    try {
      const startAt = meet && slot ? nextOccurrence(slot.dayOfWeek, slot.startTime).toISOString() : undefined;
      const r = await authedJson<{ tasksCreated: number; callScheduled: boolean }>(`/api/groups/${groupId}/autopilot/apply`, { method: 'POST', body: JSON.stringify({ planId: plan.id, startAt, slot: meet ? slot : undefined }) });
      toast.success(`${r.tasksCreated} tasks are on the group’s board`, { description: r.callScheduled ? 'The first team meeting is scheduled. Everyone was told.' : 'Everyone with a task was told.' });
      onApplied();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t put the plan on the board.')); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">Draft plan</p>
          <h4 className="text-lg font-bold text-zinc-900 dark:text-white">{plan.title}</h4>
        </div>
        <button type="button" onClick={onRedo} className="btn-ghost btn-sm shrink-0"><RefreshCw className="w-4 h-4" /> Change brief</button>
      </div>
      <TaskList tasks={plan.breakdown} />

      <section aria-labelledby="slots-title">
        <h4 id="slots-title" className="text-sm font-semibold text-zinc-900 dark:text-white mb-1 flex items-center gap-2"><CalendarClock className="w-4 h-4 text-indigo-500" /> Weekly team meeting</h4>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">Times that fit everyone’s classes come first.</p>
        {slots.length ? (
          <>
            <div role="radiogroup" aria-label="Meeting time" className="grid gap-2 sm:grid-cols-2">
              {slots.map((s, i) => (
                <button key={`${s.dayOfWeek}-${s.startTime}`} type="button" role="radio" aria-checked={meet && i === slotIndex} onClick={() => { setSlotIndex(i); setMeet(true); }}
                  className={cn('text-left rounded-2xl border p-3 transition-colors', meet && i === slotIndex ? 'border-indigo-500 bg-indigo-500/5' : 'border-zinc-200/70 dark:border-white/[0.07] hover:bg-zinc-50 dark:hover:bg-white/[0.03]')}>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">{s.dayName} · {s.startTime}–{s.endTime}</p>
                  <p className={cn('text-xs', s.conflicts.length ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300')}>
                    {s.conflicts.length ? `${s.availableMemberIds.length} of ${s.totalMembers} free · ${s.conflicts.map((c) => `${c.userName.split(' ')[0]} has ${c.reason}`).join(', ')}` : `Everyone is free (${s.totalMembers})`}
                  </p>
                </button>
              ))}
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={meet} onChange={(e) => setMeet(e.target.checked)} /> Schedule the first meeting (45 min, in Calls)
            </label>
          </>
        ) : <p className="text-sm text-zinc-500">No class timetable to compare yet. You can schedule a call from Calls.</p>}
      </section>

      <button type="button" onClick={() => void apply()} disabled={busy} className="btn-primary w-full">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Put on the group’s board{meet && slot ? ' and schedule' : ''}
      </button>
    </div>
  );
}

function ActivePlan({ plan, onNew }: { plan: Plan; onNew: () => void }) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-emerald-500/5 border border-emerald-500/20 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">On the board</p>
        <h4 className="text-lg font-bold text-zinc-900 dark:text-white">{plan.title}</h4>
        {plan.scheduledCall && (
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
            Team meeting: {new Date(plan.scheduledCall.startAt).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            {plan.meetingSlot ? ` (then ${plan.meetingSlot.dayName}s at ${plan.meetingSlot.startTime})` : ''}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {plan.board && <Link href={`/tasks/${plan.board.id}`} className="btn-primary btn-sm">Open the board</Link>}
          {plan.scheduledCall && <Link href="/calls" className="btn-secondary btn-sm">Calls</Link>}
          <button type="button" onClick={onNew} className="btn-ghost btn-sm">Make a new plan</button>
        </div>
      </div>
      <TaskList tasks={plan.breakdown} />
    </div>
  );
}

function ProgressTab({ groupId }: { groupId: string }) {
  const key = `/api/groups/${groupId}/autopilot/reports`;
  const myId = useAuthStore((s) => s.user?.id);
  const { data, error, isLoading, mutate } = useSWR<{ reports: Report[] }>(key, authedJson);
  const [busy, setBusy] = useState(false);
  const [nudged, setNudged] = useState<Set<string>>(new Set());

  const refresh = async () => {
    setBusy(true);
    try { await authedJson(key, { method: 'POST' }); await mutate(); toast.success('Report updated'); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t make the report.')); }
    finally { setBusy(false); }
  };
  const nudge = async (n: Nudge) => {
    try {
      await authedJson(`/api/groups/${groupId}/autopilot/nudge`, { method: 'POST', body: JSON.stringify({ taskId: n.taskId }) });
      setNudged((s) => new Set(s).add(n.taskId));
      toast.success(`${n.userName.split(' ')[0]} got a reminder`);
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t send the reminder.')); }
  };

  if (error && !data) return <LoadError onRetry={() => mutate()} />;
  if (isLoading && !data) return <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-24 rounded-2xl skeleton" />)}</div>;
  const [latest, ...older] = data?.reports ?? [];
  const m = latest?.metrics ?? {};

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Who’s done what this week, from the group’s board.</p>
        <button type="button" onClick={() => void refresh()} disabled={busy} className="btn-secondary btn-sm shrink-0">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} {latest ? 'Update' : 'Make report'}</button>
      </div>
      {!latest ? (
        <p className="text-sm text-zinc-500 rounded-2xl border border-dashed border-zinc-300 dark:border-white/10 p-6 text-center">No report yet. Put a plan on the board, then make this week’s report.</p>
      ) : (
        <>
          <div className="rounded-2xl border border-zinc-200/70 dark:border-white/[0.07] p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-zinc-900 dark:text-white">Week {latest.weekNumber}</p>
              <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', HEALTH[latest.health].cls)}>{HEALTH[latest.health].label}</span>
            </div>
            <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{latest.summary}</p>
            <dl className="mt-3 grid grid-cols-3 gap-2">
              {[['Done', `${m.completedTasks ?? 0}/${m.totalTasks ?? 0}`], ['Late', String(m.overdueTasks ?? 0)], ['Fair share', m.fair == null ? '—' : `${Math.round(m.fair * 100)}%`]].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-zinc-100/70 dark:bg-white/[0.04] px-3 py-2"><dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{k}</dt><dd className="font-bold tabular-nums text-zinc-900 dark:text-white">{v}</dd></div>
              ))}
            </dl>
            <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">Fair share is 100% when everyone has finished an even part of the work (by task hours).</p>
          </div>

          {!!m.members?.length && (
            <ul className="divide-y divide-zinc-100 dark:divide-white/[0.05] rounded-2xl border border-zinc-200/70 dark:border-white/[0.07]">
              {m.members.map((p) => (
                <li key={p.userId} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">{p.name}{p.userId === myId ? ' (you)' : ''}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{p.tasksCompleted} of {p.tasksAssigned} done{p.tasksOverdue ? ` · ${p.tasksOverdue} late` : ''} · {p.contributionSharePercent}% of finished work</p>
                  </div>
                  <span className={cn('text-xs font-semibold shrink-0', STATUS[p.status].cls)}>{STATUS[p.status].label}</span>
                </li>
              ))}
            </ul>
          )}

          {latest.nudges.some((n) => n.userId !== myId) && (
            <section aria-labelledby="nudge-title">
              <h4 id="nudge-title" className="text-sm font-semibold text-zinc-900 dark:text-white mb-2">Late tasks</h4>
              <ul className="space-y-2">
                {latest.nudges.filter((n) => n.userId !== myId).map((n) => (
                  <li key={n.taskId} className="flex items-center gap-3 rounded-2xl border border-zinc-200/70 dark:border-white/[0.07] p-3">
                    <div className="min-w-0 flex-1"><p className="text-sm font-medium text-zinc-900 dark:text-white truncate">{n.taskTitle}</p><p className="text-xs text-zinc-500 dark:text-zinc-400">{n.userName}</p></div>
                    <button type="button" onClick={() => void nudge(n)} disabled={nudged.has(n.taskId)} className="btn-secondary btn-sm shrink-0"><Bell className="w-4 h-4" /> {nudged.has(n.taskId) ? 'Reminded' : 'Nudge'}</button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {older.length > 0 && (
            <section aria-labelledby="past-title">
              <h4 id="past-title" className="text-sm font-semibold text-zinc-900 dark:text-white mb-2">Earlier weeks</h4>
              <ul className="space-y-1.5">
                {older.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-sm"><span className="text-zinc-700 dark:text-zinc-300">Week {r.weekNumber} · {r.metrics.completedTasks ?? 0}/{r.metrics.totalTasks ?? 0} done</span><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', HEALTH[r.health].cls)}>{HEALTH[r.health].label}</span></li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
