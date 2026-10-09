'use client';

import useSWR from 'swr';
import { CheckCircle2, RotateCcw, X } from 'lucide-react';
import Link from '@/components/ui/Link';
import { authedJson } from '@/lib/authed-fetch';
import { cn } from '@/lib/utils';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';

// A student's answers to a finished quiz, with the right answers once the quiz has closed.
// Its own file so pages that only show this (the Quizzes page) don't load the whole course board.

export function QuizReview({ quizId, onClose }: { quizId: string; onClose: () => void }) {
  const { data, error } = useSWR<{
    courseId: string; title: string; score: number | null; maxScore: number | null; revealed: boolean;
    questions: { id: string; question: string; options: string[]; points: number; yourAnswer: string | null; correct?: boolean; correctAnswer?: string }[];
  }>(`/api/quizzes/${quizId}/result`, authedJson);
  return (
    <div className="backdrop-in fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet-in w-full sm:max-w-2xl max-h-[90dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl glass-sidebar border border-zinc-200 dark:border-white/10 shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between gap-3 px-6 py-4 border-b border-zinc-200/70 dark:border-white/[0.07] bg-white/70 dark:bg-[#121830]/80 backdrop-blur-xl">
          <div className="min-w-0"><h3 className="font-bold text-zinc-900 dark:text-white truncate">{data?.title ?? 'Quiz review'}</h3>{data && <p className="text-xs text-zinc-500">Score {data.score ?? 0}/{data.maxScore ?? 0}</p>}</div>
          <button onClick={onClose} aria-label="Close" className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-300"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <p className="text-sm text-rose-500">{(error as Error).message}</p>}
          {!data && !error && <div className="py-8"><ContentSkeleton variant="list" /></div>}
          {data && !data.revealed && <p className="text-xs p-3 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300">Correct answers are shown once the quiz closes or passes its due date.</p>}
          {data?.questions.map((q, i) => (
            <div key={q.id} className="p-4 rounded-2xl border border-zinc-200/70 dark:border-white/[0.07]">
              <p className="font-semibold text-sm text-zinc-900 dark:text-white mb-3">{i + 1}. {q.question} <span className="text-xs text-zinc-500 font-normal">· {q.points} pt{q.points === 1 ? '' : 's'}</span></p>
              <div className="space-y-1.5">
                {q.options.map((o) => {
                  const mine = o === q.yourAnswer, right = data.revealed && o === q.correctAnswer;
                  return (
                    <div key={o} className={cn('text-sm px-3 py-2 rounded-lg border flex items-center gap-2',
                      right ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : mine && data.revealed ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                        : mine ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                        : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400')}>
                      {right && <CheckCircle2 className="w-4 h-4" />}{o}{mine && <span className="ml-auto text-[10px] font-bold uppercase">Your answer</span>}
                    </div>
                  );
                })}
                {!q.yourAnswer && <p className="text-xs text-zinc-500">You didn’t answer this question.</p>}
              </div>
            </div>
          ))}
          {/* Second chances (Stage 5 · D10): a catch-up on what was missed, once the answers are shown. */}
          {data?.revealed && data.questions.some((q) => q.yourAnswer && q.correct === false) && (
            <Link href={`/student/mastery?course=${data.courseId}`} className="flex items-center gap-3 p-4 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 hover:border-indigo-500/60 transition-colors">
              <RotateCcw className="w-5 h-5 text-indigo-500 shrink-0" aria-hidden />
              <span className="min-w-0"><span className="block text-sm font-semibold text-zinc-900 dark:text-white">Get a second chance</span><span className="block text-xs text-zinc-500">The class moments that explain what you missed, and a few questions to try. It doesn’t change your score.</span></span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
