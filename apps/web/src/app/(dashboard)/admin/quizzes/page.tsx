'use client';
import { confirmDialog } from '@/components/ui/Dialogs';

import useSWR from 'swr';
import { toast } from 'sonner';
import { ClipboardCheck, Trash2 } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';
import { fetcher } from '@/lib/fetcher';
import { api } from '@/lib/api';

type Quiz = { id: string; title: string; status: string; dueDate: string | null; timeLimit: number | null; createdAt: string; course: { name: string } };
const STATUS: Record<string, string> = { DRAFT: 'bg-zinc-500/10 text-zinc-500', PUBLISHED: 'bg-emerald-500/10 text-emerald-600', CLOSED: 'bg-rose-500/10 text-rose-500' };

export default function AdminQuizzesPage() {
  const { data, isLoading, mutate } = useSWR<Quiz[]>('/quizzes', fetcher);
  const quizzes = Array.isArray(data) ? data : [];

  const remove = async (q: Quiz) => {
    if (!(await confirmDialog({ title: `Delete "${q.title}"?`, message: 'Student submissions will be removed too.', destructive: true }))) return;
    try { await api.delete(`/quizzes/${q.id}`); toast.success('Quiz deleted'); mutate(); } catch { toast.error('Could not delete the quiz.'); }
  };

  return (
    <>
      <Topbar title="Quizzes" subtitle="Every quiz across your courses" />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          {isLoading ? <div className="h-48 rounded-3xl skeleton" /> : quizzes.length === 0 ? (
            <FeatureGuide
              icon={ClipboardCheck}
              title="Quizzes will appear here"
              description="Teachers create quizzes for their courses; they're graded automatically when students submit. You can oversee all of them from here."
              steps={['Teachers open Quizzes in their portal and create one', 'They publish it with a due date', 'Students take it and get their score instantly']}
              example={<div><ExampleRow title="Memory Management Quiz" meta="Operating Systems · due Fri 18:00 · 20 min" right="Published" /><ExampleRow title="SDG Case Study Check" meta="Sustainable Development · draft" right="Draft" accent="from-zinc-400 to-zinc-500" /></div>}
            />
          ) : (
            <div className="space-y-3">
              {quizzes.map((q) => (
                <div key={q.id} className="p-4 rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-zinc-900 dark:text-white truncate">{q.title}</p>
                    <p className="text-xs text-zinc-500 truncate">{q.course.name}{q.dueDate ? ` · due ${new Date(q.dueDate).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : ''}{q.timeLimit ? ` · ${q.timeLimit} min` : ''}</p>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS[q.status] ?? ''}`}>{q.status.toLowerCase()}</span>
                  <button onClick={() => remove(q)} aria-label="Delete quiz" className="p-2 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
