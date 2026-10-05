'use client';

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import useSWR from 'swr';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, Eye, EyeOff, HeartHandshake, Info, ListChecks, Loader2, Mail, Minus, MessageSquare, PhoneCall, RefreshCw, Search, Send, ShieldCheck, Sparkles, TrendingDown, TrendingUp, X } from 'lucide-react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { spring } from '@/lib/motion';
import { authedJson } from '@/lib/authed-fetch';
import { cn } from '@/lib/utils';

interface Flag {
  id: string; score: number; level: 'AT_RISK' | 'WATCH' | 'OK'; status: 'OPEN' | 'CONTACTED' | 'RESOLVED' | 'DISMISSED';
  reasons: { code: string; text: string }[]; note: string | null; handledByName: string | null; handledAt: string | null; computedAt: string;
  student: { id: string; name: string; email?: string; avatar: string | null; department: string | null; year?: number | null; lastSeenAt?: string | null };
  course: { id: string; code: string; name: string; teacher?: { id: string; name: string; email: string } | null };
  plan: SupportPlan | null;
}
interface SupportPlan {
  id: string; status: 'ACTIVE' | 'DONE'; plan: { intro: string; steps: { title: string; detail: string; minutes: number }[]; closing: string };
  message: string | null; stepsDone: number[]; followUpAt: string; followUpNotifiedAt: string | null; followUpDoneAt: string | null;
  startScore: number | null; endScore: number | null; outcome: 'IMPROVED' | 'SAME' | 'WORSE' | null; createdByName: string; createdAt: string;
}
interface Board { flags: Flag[]; summary: { atRisk: number; watch: number; contacted: number; resolved: number }; courses: { id: string; code: string; name: string }[] }

const LEVEL = {
  AT_RISK: { label: 'Needs attention', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' },
  WATCH: { label: 'Keep an eye on', cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20' },
  OK: { label: 'Improving', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
};
const STATUS_LABEL: Record<Flag['status'], string> = { OPEN: 'New', CONTACTED: 'Contacted', RESOLVED: 'Resolved', DISMISSED: 'Dismissed' };
const VIEWS = [{ id: 'open', label: 'To review' }, { id: 'handled', label: 'Handled' }, { id: 'all', label: 'All' }] as const;

/** Early warning for teachers (their courses) and admins (all courses). `inboxBase`: /teacher or /admin. */
export function EarlyWarningBoard({ inboxBase }: { inboxBase: string }) {
  const router = useRouter();
  const [view, setView] = useState<(typeof VIEWS)[number]['id']>('open');
  const [courseId, setCourseId] = useState('');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const key = `/api/early-warning?view=${view}${courseId ? `&courseId=${courseId}` : ''}${debouncedQ ? `&q=${encodeURIComponent(debouncedQ)}` : ''}`;
  const { data, error, isLoading, mutate } = useSWR<Board>(key, authedJson);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const r = await authedJson<{ courses: number; newlyAtRisk: number }>('/api/early-warning/refresh', { method: 'POST' });
      toast.success(`Checked ${r.courses} course${r.courses === 1 ? '' : 's'}${r.newlyAtRisk ? ` · ${r.newlyAtRisk} new` : ''}`);
      await mutate();
    } catch (e) { toast.error((e as Error).message); }
    finally { setRefreshing(false); }
  };

  const update = async (f: Flag, body: { status?: Flag['status']; note?: string }, done?: string) => {
    try {
      await authedJson(`/api/early-warning/${f.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      if (done) toast.success(done);
      await mutate();
    } catch (e) { toast.error((e as Error).message); }
  };

  const message = async (f: Flag) => {
    try {
      const { id } = await authedJson<{ id: string }>('/api/chat/conversations', { method: 'POST', body: JSON.stringify({ userId: f.student.id }) });
      if (f.status === 'OPEN') void update(f, { status: 'CONTACTED' });
      router.push(`${inboxBase}/inbox?c=${id}`);
    } catch (e) { toast.error((e as Error).message); }
  };

  const s = data?.summary;
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-5 min-w-0">
      <div className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.06] p-4 text-sm text-sky-900 dark:text-sky-100 flex gap-3">
        <Info className="w-5 h-5 shrink-0 text-sky-500 mt-0.5" />
        <p className="leading-relaxed">
          Each day UniVerse looks at attendance, grades, missed quizzes and activity, and lists students who may be struggling — with the reasons. <b>It’s a prompt, not a verdict:</b> you decide whether to reach out. Students aren’t told they were flagged and nothing changes for them automatically. Please treat this list as confidential.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Need attention', value: s?.atRisk, icon: AlertTriangle, cls: 'text-rose-500' },
          { label: 'Keep an eye on', value: s?.watch, icon: Eye, cls: 'text-amber-500' },
          { label: 'Contacted', value: s?.contacted, icon: PhoneCall, cls: 'text-sky-500' },
          { label: 'Resolved', value: s?.resolved, icon: CheckCircle2, cls: 'text-emerald-500' },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4">
            <p className="text-xs text-zinc-500 flex items-center gap-1.5"><c.icon className={cn('w-4 h-4', c.cls)} /> {c.label}</p>
            <p className="mt-1 text-2xl font-black text-zinc-900 dark:text-white">{c.value ?? '—'}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="inline-flex p-1 rounded-xl bg-zinc-100 dark:bg-white/[0.06]">
          {VIEWS.map((v) => (
            <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)} className={cn('px-3 py-1.5 rounded-lg text-sm font-semibold', view === v.id ? 'bg-white dark:bg-white/10 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500')}>{v.label}</button>
          ))}
        </div>
        <select aria-label="Course" value={courseId} onChange={(e) => setCourseId(e.target.value)} className="text-sm rounded-xl bg-zinc-100 dark:bg-white/[0.06] px-3 py-2 text-zinc-700 dark:text-zinc-200 max-w-[16rem]">
          <option value="">All courses</option>
          {data?.courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
        </select>
        <button onClick={refresh} disabled={refreshing} className="btn-primary ml-auto">
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Check now
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search student name, email or course" aria-label="Search early warnings"
          className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/60 pl-9 pr-9 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40" />
        {q && <button onClick={() => setQ('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"><X className="w-4 h-4" /></button>}
      </div>
      {debouncedQ && data && <p className="text-xs text-zinc-500">{data.flags.length} student{data.flags.length === 1 ? '' : 's'} match “{debouncedQ}”{data.flags.length >= 200 ? ' (first 200 shown)' : ''}</p>}

      {error ? <p className="text-sm text-rose-500">{(error as Error).message}</p>
        : isLoading ? <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>
        : !data?.flags.length ? (
          <div className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-10 text-center">
            <ShieldCheck className="w-10 h-10 mx-auto text-emerald-500" />
            <p className="mt-3 font-bold text-zinc-900 dark:text-white">{debouncedQ ? `No students match “${debouncedQ}”` : view === 'open' ? 'No one needs attention right now' : 'Nothing here yet'}</p>
            <p className="mt-1 text-sm text-zinc-500">{debouncedQ ? 'Try another name, email or course code.' : view === 'open' ? 'The list updates every morning. Use “Check now” after entering new grades or attendance.' : 'Students you mark as resolved or dismissed appear here.'}</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {data.flags.map((f) => {
              const expanded = open === f.id;
              const initials = f.student.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
              return (
                <li key={f.id} className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03]">
                  <button onClick={() => setOpen(expanded ? null : f.id)} aria-expanded={expanded} className="w-full flex items-center gap-3 p-4 text-left">
                    {f.student.avatar ? <img loading="lazy" decoding="async" src={f.student.avatar} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" /> : <span className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white text-sm font-bold flex items-center justify-center shrink-0">{initials}</span>}
                    <span className="flex-1 min-w-0">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold text-zinc-900 dark:text-white">{f.student.name}</span>
                        <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full border', LEVEL[f.level].cls)}>{LEVEL[f.level].label}</span>
                        {f.status !== 'OPEN' && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-300">{STATUS_LABEL[f.status]}</span>}
                      </span>
                      {f.student.email && <span className="block text-xs text-zinc-500 truncate">{f.student.email}{f.student.year ? ` · Year ${f.student.year}` : ''}{f.student.department ? ` · ${f.student.department}` : ''}</span>}
                      <span className="block text-xs text-zinc-500 truncate">{f.course.code} · {f.course.name}{f.course.teacher ? ` · ${f.course.teacher.name}` : ''} · {f.reasons[0]?.text ?? 'No current concerns'}</span>
                    </span>
                    <span className="hidden sm:flex flex-col items-end shrink-0">
                      <span className="text-lg font-black text-zinc-900 dark:text-white">{f.score}</span>
                      <span className="text-[10px] text-zinc-500">concern score</span>
                    </span>
                    <ChevronDown className={cn('w-4 h-4 text-zinc-400 shrink-0 transition-transform', expanded && 'rotate-180')} />
                  </button>
                  {expanded && <FlagDetail f={f} inboxBase={inboxBase} onMessage={() => message(f)} onUpdate={(b, done) => update(f, b, done)} onChanged={() => void mutate()} />}
                </li>
              );
            })}
          </ul>
        )}
    </div>
  );
}

function FlagDetail({ f, inboxBase, onMessage, onUpdate, onChanged }: { f: Flag; inboxBase: string; onMessage: () => void; onUpdate: (b: { status?: Flag['status']; note?: string }, done?: string) => void; onChanged: () => void }) {
  const [note, setNote] = useState(f.note ?? '');
  return (
    <>
    <EarlyHelp f={f} inboxBase={inboxBase} onChanged={onChanged} />
    <div className="px-4 pb-4 border-t border-zinc-100 dark:border-white/[0.06] pt-4 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_18rem] gap-5">
      <div className="min-w-0">
        <dl className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {f.student.email && (
            <div className="min-w-0"><dt className="text-xs text-zinc-500">Student email</dt><dd><a href={`mailto:${f.student.email}`} className="inline-flex items-center gap-1 text-indigo-500 break-all"><Mail className="w-3.5 h-3.5 shrink-0" />{f.student.email}</a></dd></div>
          )}
          {(f.student.department || f.student.year) && (
            <div className="min-w-0"><dt className="text-xs text-zinc-500">Programme</dt><dd className="text-zinc-800 dark:text-zinc-100">{[f.student.department, f.student.year ? `Year ${f.student.year}` : null].filter(Boolean).join(' · ')}</dd></div>
          )}
          {f.course.teacher && (
            <div className="min-w-0"><dt className="text-xs text-zinc-500">Course teacher</dt><dd className="text-zinc-800 dark:text-zinc-100 break-words">{f.course.teacher.name} · <a href={`mailto:${f.course.teacher.email}`} className="text-indigo-500 break-all">{f.course.teacher.email}</a></dd></div>
          )}
          {f.student.lastSeenAt !== undefined && (
            <div className="min-w-0"><dt className="text-xs text-zinc-500">Last active</dt><dd className="text-zinc-800 dark:text-zinc-100">{f.student.lastSeenAt ? formatDistanceToNow(new Date(f.student.lastSeenAt), { addSuffix: true }) : 'No activity recorded'}</dd></div>
          )}
        </dl>
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Why they’re on this list</p>
        {f.reasons.length ? (
          <ul className="mt-2 space-y-1.5">
            {f.reasons.map((r, i) => <li key={i} className="text-sm text-zinc-700 dark:text-zinc-200 flex gap-2"><TrendingUp className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5 rotate-180" /> {r.text}</li>)}
          </ul>
        ) : <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">The latest check found no concerns — things look better.</p>}
        <p className="mt-3 text-[11px] text-zinc-500">Last checked {new Date(f.computedAt).toLocaleString()}{f.handledByName ? ` · ${STATUS_LABEL[f.status].toLowerCase()} by ${f.handledByName}${f.handledAt ? ` on ${new Date(f.handledAt).toLocaleDateString()}` : ''}` : ''}</p>
        <label className="block mt-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Private note</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (f.note ?? '') && onUpdate({ note }, 'Note saved')} rows={2} maxLength={1000}
            placeholder="e.g. Spoke after class — family situation, extension agreed" className="mt-1.5 w-full rounded-xl bg-zinc-100 dark:bg-white/[0.06] p-3 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500/40" />
        </label>
      </div>
      <div className="flex flex-col gap-2">
        <button onClick={onMessage} className="btn-primary"><MessageSquare className="w-4 h-4" /> Message {f.student.name.split(' ')[0]}</button>
        {f.status !== 'CONTACTED' && <button onClick={() => onUpdate({ status: 'CONTACTED' }, 'Marked as contacted')} className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-sm font-semibold text-zinc-700 dark:text-zinc-200"><PhoneCall className="w-4 h-4" /> I reached out another way</button>}
        {f.status !== 'RESOLVED' && <button onClick={() => onUpdate({ status: 'RESOLVED' }, 'Marked as resolved')} className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-sm font-semibold"><CheckCircle2 className="w-4 h-4" /> Resolved</button>}
        {f.status !== 'DISMISSED' && <button onClick={() => onUpdate({ status: 'DISMISSED' }, 'Dismissed — it comes back only if things get clearly worse')} className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"><EyeOff className="w-4 h-4" /> Not a concern</button>}
        {(f.status === 'RESOLVED' || f.status === 'DISMISSED') && <button onClick={() => onUpdate({ status: 'OPEN' }, 'Moved back to review')} className="text-xs font-semibold text-indigo-500 hover:underline">Move back to review</button>}
      </div>
    </div>
    </>
  );
}

const OUTCOME = {
  IMPROVED: { label: 'Improved', icon: TrendingDown, cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20' },
  SAME: { label: 'About the same', icon: Minus, cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20' },
  WORSE: { label: 'Not improved yet', icon: TrendingUp, cls: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20' },
} as const;
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** Early help: notice → act → follow up → measure. Check in, make a study plan, follow up in 7 days, see the outcome. */
function EarlyHelp({ f, inboxBase, onChanged }: { f: Flag; inboxBase: string; onChanged: () => void }) {
  const router = useRouter();
  const first = f.student.name.split(/\s+/)[0];
  const [step, setStep] = useState<null | 'checkin' | 'plan'>(null);
  const [text, setText] = useState(`Hi ${first}, I wanted to check in on how ${f.course.code} is going for you. Is there anything I can help with, or anything making things harder at the moment? I’m happy to talk here or in office hours.`);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<null | 'send' | 'plan' | 'close'>(null);
  const [now] = useState(() => Date.now());
  const p = f.plan;
  const followUpDue = p && p.status === 'ACTIVE' && new Date(p.followUpAt).getTime() <= now + 60_000;

  const checkIn = async () => {
    setBusy('send');
    try {
      const { id } = await authedJson<{ id: string }>('/api/chat/conversations', { method: 'POST', body: JSON.stringify({ userId: f.student.id }) });
      await authedJson(`/api/chat/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ type: 'TEXT', body: text.trim() }) });
      if (f.status === 'OPEN') await authedJson(`/api/early-warning/${f.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'CONTACTED' }) });
      toast.success(`Message sent to ${first}`, { action: { label: 'Open chat', onClick: () => router.push(`${inboxBase}/inbox?c=${id}`) } });
      setStep(null); onChanged();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const makePlan = async () => {
    setBusy('plan');
    try {
      const r = await authedJson<{ usedAi: boolean }>(`/api/early-warning/${f.id}/plan`, { method: 'POST', body: JSON.stringify({ message: note.trim() || undefined }) });
      toast.success(`Plan sent to ${first}. You’ll be reminded to follow up in 7 days.${r.usedAi ? '' : ' (AI wasn’t available, so it’s a simple plan from their weak topics.)'}`, { duration: 7000 });
      setStep(null); onChanged();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const close = async () => {
    if (!p) return;
    setBusy('close');
    try {
      await authedJson(`/api/support-plans/${p.id}`, { method: 'PATCH', body: JSON.stringify({ followUpDone: true }) });
      toast.success('Follow-up closed'); onChanged();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  const steps = [
    { n: 1, title: 'Check in', done: f.status !== 'OPEN' || !!p, icon: MessageSquare },
    { n: 2, title: 'Study plan', done: !!p, icon: ListChecks },
    { n: 3, title: 'Follow up', done: !!p?.followUpDoneAt, icon: CalendarClock },
    { n: 4, title: 'Outcome', done: !!p?.outcome, icon: TrendingDown },
  ];
  return (
    <div className="px-4 pb-4 pt-4 border-t border-zinc-100 dark:border-white/[0.06]">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5"><HeartHandshake className="w-4 h-4 text-indigo-500" /> Early help</p>
      <ol className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {steps.map((s) => (
          <li key={s.n} className={cn('rounded-xl border px-3 py-2 flex items-center gap-2 text-xs font-semibold transition-colors', s.done ? 'border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-700 dark:text-emerald-300' : 'border-zinc-200 dark:border-white/10 text-zinc-500')}>
            <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0', s.done ? 'bg-emerald-500 text-white' : 'bg-zinc-200 dark:bg-white/10')}>{s.done ? <CheckCircle2 className="w-3.5 h-3.5" /> : s.n}</span>{s.title}
          </li>
        ))}
      </ol>

      {!p && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => setStep(step === 'checkin' ? null : 'checkin')} className="btn-secondary btn-sm rounded-full inline-flex"><MessageSquare className="w-3.5 h-3.5" /> Check in</button>
          <button onClick={() => setStep(step === 'plan' ? null : 'plan')} className="btn-primary btn-sm rounded-full inline-flex"><Sparkles className="w-3.5 h-3.5" /> Make a study plan</button>
        </div>
      )}
      <AnimatePresence initial={false} mode="wait">
        {step === 'checkin' && (
          <motion.div key="checkin" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring.smooth} className="overflow-hidden">
            <div className="mt-3 rounded-2xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200 dark:border-white/10 p-3 space-y-2">
              <p className="text-xs text-zinc-500">A kind first message to {first}. Edit it as you like; it opens your one-to-one chat.</p>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={2000} aria-label="Check-in message" className="w-full rounded-xl bg-white dark:bg-zinc-900/60 p-3 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500/40 border border-zinc-200 dark:border-white/10" />
              <button onClick={checkIn} disabled={busy !== null || !text.trim()} className="btn-primary btn-sm rounded-full inline-flex">{busy === 'send' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send</button>
            </div>
          </motion.div>
        )}
        {step === 'plan' && (
          <motion.div key="plan" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring.smooth} className="overflow-hidden">
            <div className="mt-3 rounded-2xl bg-indigo-500/[0.05] border border-indigo-500/15 p-3 space-y-2">
              <p className="text-xs text-zinc-600 dark:text-zinc-300">AI writes 3–5 encouraging steps for the next week from {first}’s weak topics (low rubric scores and missed quiz questions). {first} sees it in their Study planner, never as a warning. You’re reminded in 7 days to follow up.</p>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder={`Optional note to ${first}, e.g. “Let’s meet on Thursday after class.”`} aria-label="Note to the student" className="w-full rounded-xl bg-white dark:bg-zinc-900/60 p-3 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500/40 border border-zinc-200 dark:border-white/10" />
              <button onClick={makePlan} disabled={busy !== null} className="btn-primary btn-sm rounded-full inline-flex">{busy === 'plan' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Make and send the plan</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {p && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth} className="mt-3 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white/60 dark:bg-white/[0.02] p-3">
          <p className="text-xs text-zinc-500">Plan sent {day(p.createdAt)} by {p.createdByName} · {p.stepsDone.length}/{p.plan.steps.length} steps ticked by {first}</p>
          <ul className="mt-2 space-y-1">
            {p.plan.steps.map((st, i) => (
              <li key={i} className="text-sm text-zinc-700 dark:text-zinc-200 flex gap-2">
                {p.stepsDone.includes(i) ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> : <span className="w-4 h-4 rounded-full border-2 border-zinc-300 dark:border-white/20 shrink-0 mt-0.5" />}
                <span><b className="font-semibold">{st.title}</b> · {st.minutes} min</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {p.outcome && (() => { const o = OUTCOME[p.outcome]; return (
              <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full border inline-flex items-center gap-1', o.cls)}><o.icon className="w-3.5 h-3.5" /> {o.label}{p.startScore !== null && p.endScore !== null ? ` · concern ${p.startScore} → ${p.endScore}` : ''}</span>
            ); })()}
            {p.status === 'ACTIVE' ? (
              <>
                <span className={cn('text-xs inline-flex items-center gap-1', followUpDue ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-zinc-500')}><CalendarClock className="w-3.5 h-3.5" /> {followUpDue ? 'Follow-up due now' : `Follow up on ${day(p.followUpAt)}`}</span>
                {followUpDue && <button onClick={close} disabled={busy !== null} className="btn-primary btn-sm rounded-full inline-flex ml-auto">{busy === 'close' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Close follow-up</button>}
              </>
            ) : <span className="text-xs text-zinc-500">Follow-up closed {p.followUpDoneAt ? day(p.followUpDoneAt) : ''}</span>}
          </div>
        </motion.div>
      )}
    </div>
  );
}
