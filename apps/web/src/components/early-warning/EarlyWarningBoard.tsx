'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ChevronDown, Eye, EyeOff, Info, Loader2, MessageSquare, PhoneCall, RefreshCw, ShieldCheck, TrendingUp } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { cn } from '@/lib/utils';

interface Flag {
  id: string; score: number; level: 'AT_RISK' | 'WATCH' | 'OK'; status: 'OPEN' | 'CONTACTED' | 'RESOLVED' | 'DISMISSED';
  reasons: { code: string; text: string }[]; note: string | null; handledByName: string | null; handledAt: string | null; computedAt: string;
  student: { id: string; name: string; avatar: string | null; department: string | null };
  course: { id: string; code: string; name: string };
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
  const key = `/api/early-warning?view=${view}${courseId ? `&courseId=${courseId}` : ''}`;
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
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-5">
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
        <button onClick={refresh} disabled={refreshing} className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white disabled:opacity-60">
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Check now
        </button>
      </div>

      {error ? <p className="text-sm text-rose-500">{(error as Error).message}</p>
        : isLoading ? <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>
        : !data?.flags.length ? (
          <div className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-10 text-center">
            <ShieldCheck className="w-10 h-10 mx-auto text-emerald-500" />
            <p className="mt-3 font-bold text-zinc-900 dark:text-white">{view === 'open' ? 'No one needs attention right now' : 'Nothing here yet'}</p>
            <p className="mt-1 text-sm text-zinc-500">{view === 'open' ? 'The list updates every morning. Use “Check now” after entering new grades or attendance.' : 'Students you mark as resolved or dismissed appear here.'}</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {data.flags.map((f) => {
              const expanded = open === f.id;
              const initials = f.student.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
              return (
                <li key={f.id} className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03]">
                  <button onClick={() => setOpen(expanded ? null : f.id)} aria-expanded={expanded} className="w-full flex items-center gap-3 p-4 text-left">
                    {f.student.avatar ? <img src={f.student.avatar} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" /> : <span className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white text-sm font-bold flex items-center justify-center shrink-0">{initials}</span>}
                    <span className="flex-1 min-w-0">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold text-zinc-900 dark:text-white">{f.student.name}</span>
                        <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full border', LEVEL[f.level].cls)}>{LEVEL[f.level].label}</span>
                        {f.status !== 'OPEN' && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-300">{STATUS_LABEL[f.status]}</span>}
                      </span>
                      <span className="block text-xs text-zinc-500 truncate">{f.course.code} · {f.course.name} · {f.reasons[0]?.text ?? 'No current concerns'}</span>
                    </span>
                    <span className="hidden sm:flex flex-col items-end shrink-0">
                      <span className="text-lg font-black text-zinc-900 dark:text-white">{f.score}</span>
                      <span className="text-[10px] text-zinc-500">concern score</span>
                    </span>
                    <ChevronDown className={cn('w-4 h-4 text-zinc-400 shrink-0 transition-transform', expanded && 'rotate-180')} />
                  </button>
                  {expanded && <FlagDetail f={f} onMessage={() => message(f)} onUpdate={(b, done) => update(f, b, done)} />}
                </li>
              );
            })}
          </ul>
        )}
    </div>
  );
}

function FlagDetail({ f, onMessage, onUpdate }: { f: Flag; onMessage: () => void; onUpdate: (b: { status?: Flag['status']; note?: string }, done?: string) => void }) {
  const [note, setNote] = useState(f.note ?? '');
  return (
    <div className="px-4 pb-4 border-t border-zinc-100 dark:border-white/[0.06] pt-4 grid md:grid-cols-[1fr_18rem] gap-5">
      <div>
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
        <button onClick={onMessage} className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold"><MessageSquare className="w-4 h-4" /> Message {f.student.name.split(' ')[0]}</button>
        {f.status !== 'CONTACTED' && <button onClick={() => onUpdate({ status: 'CONTACTED' }, 'Marked as contacted')} className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-sm font-semibold text-zinc-700 dark:text-zinc-200"><PhoneCall className="w-4 h-4" /> I reached out another way</button>}
        {f.status !== 'RESOLVED' && <button onClick={() => onUpdate({ status: 'RESOLVED' }, 'Marked as resolved')} className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-sm font-semibold"><CheckCircle2 className="w-4 h-4" /> Resolved</button>}
        {f.status !== 'DISMISSED' && <button onClick={() => onUpdate({ status: 'DISMISSED' }, 'Dismissed — it comes back only if things get clearly worse')} className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"><EyeOff className="w-4 h-4" /> Not a concern</button>}
        {(f.status === 'RESOLVED' || f.status === 'DISMISSED') && <button onClick={() => onUpdate({ status: 'OPEN' }, 'Moved back to review')} className="text-xs font-semibold text-indigo-500 hover:underline">Move back to review</button>}
      </div>
    </div>
  );
}
