'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { formatDistanceStrict } from 'date-fns';
import { CheckCircle2, Circle, Link2, Plus, X } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Sheet } from '@/components/ui/Sheet';
import { authedJson } from '@/lib/authed-fetch';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';
import { CourseInviteLink } from './CourseInvite';

// M196: a teacher's first class in ten minutes, on the teacher home until it's done (or hidden).
interface FirstClass { show: boolean; course: { id: string; code: string; name: string; status: string } | null; students: number; assignments: number; joined: { name: string; at: string }[] }
const HIDE_KEY = 'uv-first-class-hidden';

export function FirstClassCard({ onNewCourse }: { onNewCourse: () => void }) {
  const { data, mutate } = useSWR<FirstClass>('/api/teacher/first-class', authedJson);
  const now = useNow();
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } });
  const [inviting, setInviting] = useState(false);
  if (!data?.show || hidden) return null;
  const { course, students, assignments, joined } = data;
  const steps = [
    { done: !!course, title: 'Make your course', body: course ? `${course.code} · ${course.name}` : 'A name and a code are enough; the rest can wait.', action: !course && <button type="button" className="btn-primary btn-sm" onClick={onNewCourse}><Plus className="w-4 h-4" aria-hidden />New course</button> },
    { done: students > 0, title: 'Send the invite link', body: 'One link for the whole class: WhatsApp, email or on the board.', action: course && students === 0 && <button type="button" className="btn-secondary btn-sm" onClick={() => setInviting(true)}><Link2 className="w-4 h-4" aria-hidden />Invite students</button> },
    { done: assignments > 0, title: 'Post a first assignment', body: assignments ? `${assignments} posted.` : 'Something small to start: “Introduce yourself” works.', action: course && assignments === 0 && <Link href="/teacher/assignments?new=1" className="btn-secondary btn-sm">New assignment</Link> },
    { done: students > 0, title: 'See who joined', body: students ? `${students} joined${joined.length ? `: ${joined.map((j) => j.name).join(', ')}${students > joined.length ? '…' : ''}` : ''}${joined[0] && now ? ` · last ${formatDistanceStrict(new Date(joined[0].at), now, { addSuffix: true })}` : ''}` : 'Names show here as students join.', action: null },
  ];
  const left = steps.filter((s) => !s.done).length;
  const hide = () => { try { localStorage.setItem(HIDE_KEY, '1'); } catch { /* private window */ } setHidden(true); };
  return (
    <section className="panel p-5" aria-labelledby="first-class-h">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h2 id="first-class-h" className="font-semibold text-zinc-900 dark:text-white">{left ? 'Your first class in 10 minutes' : 'Your class is set up'}</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{left ? `${4 - left} of 4 done. Each step ticks itself off.` : 'Everything is in place. You can hide this now.'}</p>
        </div>
        <button type="button" onClick={hide} aria-label="Hide your first class steps" className="p-1.5 rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
      </div>
      <ol className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title} className={cn('rounded-xl border p-3.5 flex flex-col gap-2', s.done ? 'border-emerald-500/30 bg-emerald-500/[0.06]' : 'border-zinc-200 dark:border-white/10')}>
            <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
              {s.done ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" aria-hidden /> : <Circle className="w-4 h-4 text-zinc-400 shrink-0" aria-hidden />}
              <span><span className="sr-only">{s.done ? 'Done: ' : `Step ${i + 1}: `}</span>{s.title}</span>
            </p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400" translate={i === 0 || i === 3 ? 'no' : undefined}>{s.body}</p>
            {s.action && <div className="mt-auto pt-1">{s.action}</div>}
          </li>
        ))}
      </ol>
      {inviting && course && (
        <Sheet title={`Invite students to ${course.code}`} onClose={() => { setInviting(false); void mutate(); }}>
          <CourseInviteLink course={course} onPublished={() => void mutate()} />
        </Sheet>
      )}
    </section>
  );
}
