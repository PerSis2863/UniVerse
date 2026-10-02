'use client';
import { useState } from 'react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { CheckCircle2, FileText, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';

// What's due, sorted by date: used by the study planner and the parent / guardian page.

export interface DeadlineItem {
  id: string;
  kind: 'quiz' | 'exam' | 'deadline';
  title: string;
  due: string;
  course: { code: string; name: string } | null;
}

const KIND = {
  quiz: { label: 'Quiz', icon: CheckCircle2 },
  exam: { label: 'Exam', icon: GraduationCap },
  deadline: { label: 'Due', icon: FileText },
} as const;

export function DeadlineList({ items, empty = 'Nothing due in the next three weeks.' }: { items: DeadlineItem[]; empty?: string }) {
  // One "now" per mount, so the list renders the same every time.
  const [now] = useState(() => Date.now());
  if (!items.length) return <p className="text-sm text-zinc-500">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((d) => {
        const due = new Date(d.due);
        const soon = due.getTime() - now < 48 * 3600 * 1000;
        const K = KIND[d.kind];
        return (
          <li key={d.id} className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/70 dark:border-white/[0.06]">
            <span className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', soon ? 'bg-rose-500/10 text-rose-500' : 'bg-indigo-500/10 text-indigo-500 dark:text-indigo-300')}>
              <K.icon className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{d.title}</p>
              <p className="text-xs text-zinc-500 truncate">
                {K.label}{d.course ? ` · ${d.course.code}` : ''} · {format(due, 'EEE d MMM, HH:mm')}
              </p>
            </div>
            <span className={cn('text-[11px] font-bold px-2 py-1 rounded-full whitespace-nowrap', soon ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' : 'bg-zinc-200/60 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300')}>
              {formatDistanceToNowStrict(due, { addSuffix: true })}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
