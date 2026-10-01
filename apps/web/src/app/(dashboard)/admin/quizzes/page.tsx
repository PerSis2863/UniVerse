'use client';
import { confirmDialog } from '@/components/ui/Dialogs';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ChevronDown, ClipboardCheck, Loader2, Mail, Search, Trash2, X } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';
import { fetcher } from '@/lib/fetcher';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type Quiz = {
  id: string; title: string; description: string | null; status: string; dueDate: string | null; timeLimit: number | null; createdAt: string;
  course: { id?: string; code?: string; name: string; teacher?: { id: string; name: string; email: string } | null; _count?: { enrollments: number } };
  _count?: { questions: number; submissions: number };
};
type Submission = { id: string; score: number | null; maxScore: number | null; submittedAt: string; student: { id: string; name: string; email: string } };
const STATUS: Record<string, string> = { DRAFT: 'bg-zinc-500/10 text-zinc-500', PUBLISHED: 'bg-emerald-500/10 text-emerald-600', CLOSED: 'bg-rose-500/10 text-rose-500' };
const pct = (s: Submission) => (s.score != null && s.maxScore ? Math.round((s.score / s.maxScore) * 100) : null);

export default function AdminQuizzesPage() {
  const { data, isLoading, mutate } = useSWR<Quiz[]>('/quizzes', fetcher);
  const quizzes = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const term = q.trim().toLowerCase();
  const shown = useMemo(() => quizzes.filter((x) =>
    (!term || [x.title, x.course.name, x.course.code, x.course.teacher?.name, x.course.teacher?.email].filter(Boolean).join(' ').toLowerCase().includes(term))
    && (!status || x.status === status)), [quizzes, term, status]);

  const remove = async (q: Quiz) => {
    if (!(await confirmDialog({ title: `Delete "${q.title}"?`, message: 'Student submissions will be removed too.', destructive: true }))) return;
    try { await api.delete(`/quizzes/${q.id}`); toast.success('Quiz deleted'); mutate(); } catch { toast.error('Could not delete the quiz.'); }
  };

  return (
    <>
      <Topbar title="Quizzes" subtitle="Every quiz across your courses, who set it and who has taken it" />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-4">
          {isLoading ? <div className="h-48 rounded-3xl skeleton" /> : quizzes.length === 0 ? (
            <FeatureGuide
              icon={ClipboardCheck}
              title="Quizzes will appear here"
              description="Teachers create quizzes for their courses; they're graded automatically when students submit. You can oversee all of them from here."
              steps={['Teachers open Quizzes in their portal and create one', 'They publish it with a due date', 'Students take it and get their score instantly']}
              example={<div><ExampleRow title="Memory Management Quiz" meta="Operating Systems · due Fri 18:00 · 20 min" right="Published" /><ExampleRow title="SDG Case Study Check" meta="Sustainable Development · draft" right="Draft" accent="from-zinc-400 to-zinc-500" /></div>}
            />
          ) : (
            <>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search quiz, course or teacher…" aria-label="Search quizzes"
                    className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/60 pl-9 pr-9 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40" />
                  {q && <button onClick={() => setQ('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400"><X className="w-4 h-4" /></button>}
                </div>
                <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status"
                  className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/60 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200">
                  <option value="">Any status</option>
                  <option value="PUBLISHED">Published</option>
                  <option value="DRAFT">Draft</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </div>
              <p className="text-xs text-zinc-500">{shown.length === quizzes.length ? `${quizzes.length} quiz${quizzes.length === 1 ? '' : 'zes'}` : `${shown.length} of ${quizzes.length} quizzes`}{quizzes.length >= 1000 ? ' (the newest 1,000)' : ''}</p>

              {shown.length === 0 ? (
                <p className="p-10 text-center text-sm text-zinc-500 rounded-2xl border border-dashed border-zinc-200 dark:border-white/10">No quizzes match these filters.</p>
              ) : (
                <div className="space-y-3">
                  {shown.map((x) => {
                    const expanded = open === x.id;
                    const enrolled = x.course._count?.enrollments;
                    const subs = x._count?.submissions;
                    return (
                      <div key={x.id} className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03]">
                        <div className="p-4 flex items-start gap-3">
                          <button onClick={() => setOpen(expanded ? null : x.id)} aria-expanded={expanded} className="min-w-0 flex-1 text-left">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-zinc-900 dark:text-white break-words">{x.title}</p>
                              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS[x.status] ?? ''}`}>{x.status.toLowerCase()}</span>
                            </div>
                            <p className="text-xs text-zinc-500 mt-0.5 break-words">
                              {x.course.code ? `${x.course.code} · ` : ''}{x.course.name}
                              {x.course.teacher ? ` · ${x.course.teacher.name}` : ''}
                            </p>
                            <p className="text-xs text-zinc-500 mt-0.5">
                              {[
                                x._count ? `${x._count.questions} question${x._count.questions === 1 ? '' : 's'}` : null,
                                subs != null ? `${subs}${enrolled != null ? ` of ${enrolled}` : ''} submitted` : null,
                                x.dueDate ? `due ${format(new Date(x.dueDate), 'd MMM yyyy, HH:mm')}` : 'no due date',
                                x.timeLimit ? `${x.timeLimit} min` : null,
                                `created ${format(new Date(x.createdAt), 'd MMM yyyy')}`,
                              ].filter(Boolean).join(' · ')}
                            </p>
                          </button>
                          <ChevronDown className={cn('w-4 h-4 mt-1 text-zinc-400 shrink-0 transition-transform', expanded && 'rotate-180')} />
                          <button onClick={() => remove(x)} aria-label="Delete quiz" className="p-2 -m-1 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button>
                        </div>
                        {expanded && <QuizDetail quiz={x} />}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function QuizDetail({ quiz }: { quiz: Quiz }) {
  const { data, isLoading, error } = useSWR<Submission[]>(`/quizzes/${quiz.id}/submissions`, fetcher);
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const subs = data ?? [];
  const rows = subs.filter((s) => !term || `${s.student.name} ${s.student.email}`.toLowerCase().includes(term));
  const scored = subs.map(pct).filter((p): p is number => p != null);
  const avg = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null;

  return (
    <div className="border-t border-zinc-100 dark:border-white/[0.06] p-4 space-y-3">
      {quiz.course.teacher && (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Set by <b className="text-zinc-900 dark:text-white">{quiz.course.teacher.name}</b>{' '}
          <a href={`mailto:${quiz.course.teacher.email}`} className="inline-flex items-center gap-1 text-indigo-500 break-all"><Mail className="w-3.5 h-3.5" />{quiz.course.teacher.email}</a>
        </p>
      )}
      {quiz.description && <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap break-words">{quiz.description}</p>}
      {isLoading ? (
        <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>
      ) : error ? (
        <p className="text-sm text-rose-500">Could not load submissions.</p>
      ) : subs.length === 0 ? (
        <p className="text-sm text-zinc-500">No student has submitted this quiz yet.</p>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{subs.length} submission{subs.length === 1 ? '' : 's'}{avg != null ? ` · average ${avg}%` : ''}</p>
            <div className="relative sm:w-60">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search students" aria-label="Search submissions"
                className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/60 pl-8 pr-3 py-1.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40" />
            </div>
          </div>
          {rows.length === 0 ? <p className="text-sm text-zinc-500">No students match “{q}”.</p> : (
            <ul className="divide-y divide-zinc-100 dark:divide-white/[0.05] rounded-xl border border-zinc-200 dark:border-white/[0.06]">
              {rows.map((s) => {
                const p = pct(s);
                return (
                  <li key={s.id} className="px-3 py-2 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">{s.student.name}</p>
                      <a href={`mailto:${s.student.email}`} className="text-xs text-zinc-500 hover:text-indigo-500 break-all">{s.student.email}</a>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={cn('text-sm font-bold', p == null ? 'text-zinc-500' : p >= 50 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500')}>
                        {s.score != null && s.maxScore != null ? `${s.score}/${s.maxScore}` : 'Not scored'}{p != null ? ` · ${p}%` : ''}
                      </p>
                      <p className="text-[11px] text-zinc-500">{format(new Date(s.submittedAt), 'd MMM yyyy, HH:mm')}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
