'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { m as motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { formatDistanceToNowStrict } from 'date-fns';
import { ChevronDown, Loader2, RefreshCw, Users, Wand2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadError } from '@/components/ui/LoadError';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { fadeUp, list, spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Course board → Group projects, for the course's teacher (Stage 5 · D6): student groups that linked
// their Project autopilot plan to this course, with each one's latest weekly report (progress,
// lateness, fair share per member). Reports are made weekly by themselves; Update makes one now.

type Member = { userId: string; name: string; tasksAssigned: number; tasksCompleted: number; tasksOverdue: number; contributionSharePercent: number; status: 'BALANCED' | 'OVERLOADED' | 'UNDER_CONTRIBUTING' };
type Project = {
  id: string; title: string; targetDueDate: string | null; createdAt: string;
  group: { id: string; name: string; _count: { members: number } };
  report: { id: string; weekNumber: number; summary: string; health: 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK'; createdAt: string; metrics: { members?: Member[]; totalTasks?: number; completedTasks?: number; overdueTasks?: number; fair?: number | null } } | null;
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
// Off track first, then at risk, then on track; projects without a report last.
const RANK = { OFF_TRACK: 0, AT_RISK: 1, ON_TRACK: 2 } as const;

export function CourseGroupProjects({ courseId }: { courseId: string }) {
  const key = `/api/courses/${courseId}/group-projects`;
  const { data, error, isLoading, mutate } = useSWR<{ projects: Project[] }>(key, authedJson);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const update = async (p: Project) => {
    setBusy(p.id);
    try {
      await authedJson(key, { method: 'POST', body: JSON.stringify({ planId: p.id }) });
      await mutate();
      toast.success(`Report updated for ${p.group.name}`);
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t update the report.')); }
    finally { setBusy(null); }
  };

  if (error && !data) return <LoadError onRetry={() => mutate()} />;
  if (isLoading && !data) return <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-2xl skeleton" />)}</div>;
  const projects = [...(data?.projects ?? [])].sort((a, b) => (a.report ? RANK[a.report.health] : 3) - (b.report ? RANK[b.report.health] : 3));
  if (!projects.length) {
    return <EmptyState icon={Wand2} title="No group projects yet" hint="When a student group makes a plan in Project autopilot and picks this course, its weekly progress shows here." />;
  }
  const behind = projects.filter((p) => p.report && p.report.health !== 'ON_TRACK').length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {projects.length} group project{projects.length === 1 ? '' : 's'}{behind ? ` · ${behind} need attention` : ' · all on track'}. A report is made by itself at the end of each week; you’re told in the app when a project slips.
      </p>
      <motion.ul variants={list} initial="hidden" animate="show" className="space-y-3">
        {projects.map((p) => {
          const r = p.report, m = r?.metrics ?? {};
          const expanded = open === p.id;
          return (
            <motion.li key={p.id} variants={fadeUp} className="rounded-2xl border border-zinc-200/70 dark:border-white/[0.07] bg-white dark:bg-zinc-900/50 overflow-hidden">
              <button type="button" onClick={() => setOpen(expanded ? null : p.id)} aria-expanded={expanded} className="w-full text-start p-4 flex items-start gap-3 hover:bg-zinc-50 dark:hover:bg-white/[0.03] focus-visible:outline-none focus-visible:bg-zinc-50 dark:focus-visible:bg-white/[0.04]">
                <span className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0"><Users className="w-5 h-5 text-indigo-600 dark:text-indigo-300" /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-zinc-900 dark:text-white truncate">{p.group.name} · {p.title}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {p.group._count.members} member{p.group._count.members === 1 ? '' : 's'}
                    {r ? ` · week ${r.weekNumber} · ${m.completedTasks ?? 0}/${m.totalTasks ?? 0} done${m.overdueTasks ? ` · ${m.overdueTasks} late` : ''}` : ' · no report yet'}
                    {p.targetDueDate ? ` · due ${new Date(p.targetDueDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}
                  </p>
                </div>
                {r && <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold', HEALTH[r.health].cls)}>{HEALTH[r.health].label}</span>}
                <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={spring.snappy} className="text-zinc-400 mt-1"><ChevronDown className="w-4 h-4" /></motion.span>
              </button>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.smooth} className="overflow-hidden">
                    <div className="px-4 pb-4 space-y-3">
                      {r ? (
                        <>
                          <p className="text-sm text-zinc-700 dark:text-zinc-300">{r.summary}</p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">Fair share: {m.fair == null ? 'not enough finished work yet' : `${Math.round(m.fair * 100)}%`} · updated {formatDistanceToNowStrict(new Date(r.createdAt), { addSuffix: true })}</p>
                          {!!m.members?.length && (
                            <ul className="divide-y divide-zinc-100 dark:divide-white/[0.05] rounded-xl border border-zinc-200/70 dark:border-white/[0.07]">
                              {m.members.map((x) => (
                                <li key={x.userId} className="flex items-center gap-3 px-3 py-2">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">{x.name}</p>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{x.tasksCompleted} of {x.tasksAssigned} done{x.tasksOverdue ? ` · ${x.tasksOverdue} late` : ''} · {x.contributionSharePercent}% of finished work</p>
                                  </div>
                                  <span className={cn('text-xs font-semibold shrink-0', STATUS[x.status].cls)}>{STATUS[x.status].label}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      ) : <p className="text-sm text-zinc-500">No report yet. The first one is made at the end of the group’s first week, or now with Update.</p>}
                      <button type="button" onClick={() => void update(p)} disabled={busy === p.id} className="btn-secondary btn-sm">
                        {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Update report
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.li>
          );
        })}
      </motion.ul>
    </div>
  );
}
