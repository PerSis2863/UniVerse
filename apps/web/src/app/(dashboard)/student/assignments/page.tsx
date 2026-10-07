'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { ChevronRight, ClipboardList } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, PROGRESS_TABS } from '@/components/layout/SectionTabs';
import { authedJson } from '@/lib/authed-fetch';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';

interface Row {
  id: string;
  title: string;
  dueDate: string | null;
  status: 'OPEN' | 'CLOSED';
  maxScore: number;
  course: { code: string; name: string };
  mine: { status: string; score: number | null; submittedAt: string } | null;
}


function state(a: Row) {
  if (a.mine?.status === 'RETURNED') return { label: `${a.mine.score}/${a.maxScore}`, style: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' };
  if (a.mine) return { label: 'Handed in', style: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300' };
  if (a.status === 'CLOSED') return { label: 'Closed', style: 'bg-zinc-500/10 text-zinc-500' };
  if (a.dueDate && new Date(a.dueDate).getTime() < Date.now()) return { label: 'Overdue', style: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' };
  return { label: 'To do', style: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' };
}

export default function StudentAssignmentsPage() {
  const { data, isLoading, error } = useSWR<Row[]>('/api/assignments', authedJson);
  const todo = (data ?? []).filter((a) => !a.mine && a.status === 'OPEN');
  const rest = (data ?? []).filter((a) => a.mine || a.status !== 'OPEN');

  return (
    <>
      <Topbar title="Assignments" subtitle="Written work from your courses" />
      <SectionTabs tabs={PROGRESS_TABS} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          {error ? (
            <p className="text-sm text-rose-500">{(error as Error).message}</p>
          ) : isLoading ? (
            <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-2xl skeleton" />)}</div>
          ) : !data?.length ? (
            <FeatureGuide
              icon={ClipboardList}
              title="No assignments yet"
              description="When your teachers set written work, it appears here. You write and hand it in here, and see your grade and feedback once it's marked."
              steps={['Your teacher sets an assignment', 'You write your answer and hand it in', 'You get a grade and comments for each part of the rubric']}
              example={<ExampleRow title="Essay: why recursion matters" meta="CS101 · due Friday" right="To do" />}
            />
          ) : (
            [{ title: 'To do', list: todo }, { title: 'Handed in and past', list: rest }].filter((g) => g.list.length).map((g) => (
              <section key={g.title} className="space-y-3 stagger">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">{g.title}</h2>
                {g.list.map((a) => {
                  const s = state(a);
                  return (
                    <Link key={a.id} href={`/student/assignments/${a.id}`} className={`panel lift p-4 flex items-center gap-4 hover:border-indigo-400/50`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold text-indigo-600 dark:text-indigo-300">{a.course.code}</p>
                        <h3 data-shared={`assignment:${a.id}`} className="font-semibold text-zinc-900 dark:text-white truncate">{a.title}</h3>
                        {a.dueDate && <p className="text-xs text-zinc-500 mt-0.5">Due {new Date(a.dueDate).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>}
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${s.style}`}>{s.label}</span>
                      <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                    </Link>
                  );
                })}
              </section>
            ))
          )}
        </div>
      </div>
    </>
  );
}
