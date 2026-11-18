'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';
import { cn } from '@/lib/utils';

// A parent's week (M300; API /parent-week, src/server/guardian-week.ts): one child's week of schoolwork
// with the arrows to earlier weeks, printable.

type Week = {
  week: string; thisWeek: string; previous: string; next: string | null;
  summary: { grades: number; attendance: number | null; handedIn: number; missed: number };
  grades: { course: string; title: string; score: number; maxScore: number }[];
  attendance: { course: string; day: string; status: string }[];
  handedIn: { course: string; title: string; at: string }[];
  missed: { course: string; title: string; kind: string; due: string }[];
  nextWeek: { course: string; title: string; kind: string; due: string; done: boolean }[];
  announcements: { course: string; title: string }[];
};

const STATUS: Record<string, string> = { PRESENT: 'Present', LATE: 'Late', ABSENT: 'Absent', EXCUSED: 'Excused' };
const panel = 'rounded-3xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/80 dark:bg-white/[0.03] p-4 sm:p-6';

export function WeekReport({ studentId, name }: { studentId: string; name: string }) {
  const [week, setWeek] = useState<string | null>(null);
  const [dir, setDir] = useState<'next' | 'back'>('back');
  const { data } = useSWR<Week>(`/parent-week?studentId=${encodeURIComponent(studentId)}${week ? `&week=${week}` : ''}`, fetcher, { keepPreviousData: true });
  if (!data) return <div className="h-40 rounded-3xl skeleton" />;
  const go = (w: string, d: 'next' | 'back') => { setDir(d); setWeek(w); };
  const title = data.week === data.thisWeek ? 'This week' : `Week of ${format(new Date(`${data.week}T12:00:00`), 'd MMMM')}`;
  const print = () => {
    document.documentElement.dataset.printing = 'report';
    const done = () => { delete document.documentElement.dataset.printing; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  };
  const s = data.summary;
  return (
    <section className={cn(panel, 'print-report mb-4')} aria-labelledby="week-title">
      <div className="flex items-center gap-1">
        <button type="button" className="btn-ghost btn-sm print-hide" aria-label="Week before" onClick={() => go(data.previous, 'back')}><ChevronLeft className="w-4 h-4" aria-hidden /></button>
        <h2 id="week-title" className="flex-1 text-center font-bold text-zinc-900 dark:text-white">{name}’s week · {title}</h2>
        <button type="button" className="btn-ghost btn-sm print-hide" aria-label="Week after" disabled={!data.next} onClick={() => data.next && go(data.next, 'next')}><ChevronRight className="w-4 h-4" aria-hidden /></button>
        <button type="button" className="btn-ghost btn-sm print-hide" aria-label="Print this week" onClick={print}><Printer className="w-4 h-4" aria-hidden /></button>
      </div>
      <div key={data.week} className="swap" data-dir={dir}>
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[['Grades back', String(s.grades)], ['Attendance', s.attendance === null ? '—' : `${s.attendance}%`], ['Handed in', String(s.handedIn)], ['Missed', String(s.missed)]].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-zinc-50 p-3 dark:bg-white/[0.04]"><dt className="text-xs text-zinc-500">{k}</dt><dd className={cn('text-lg font-semibold tabular-nums', k === 'Missed' && s.missed ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-white')}>{v}</dd></div>
          ))}
        </dl>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Part title="Grades that came back" empty="None this week.">{data.grades.map((g, i) => <li key={i}><b className="font-medium">{g.course}</b> · <span translate="no">{g.title}</span>: <span className="tabular-nums">{g.score}/{g.maxScore}</span></li>)}</Part>
          <Part title="Attendance" empty="No classes recorded.">{data.attendance.map((a, i) => <li key={i} className={cn(a.status === 'ABSENT' && 'text-rose-700 dark:text-rose-300')}>{format(new Date(`${a.day}T12:00:00`), 'EEE d')} · {a.course}: {STATUS[a.status] ?? a.status}</li>)}</Part>
          <Part title="Handed in" empty="Nothing handed in.">{data.handedIn.map((h, i) => <li key={i}><b className="font-medium">{h.course}</b> · <span translate="no">{h.title}</span></li>)}</Part>
          <Part title="Missed" empty="Nothing missed.">{data.missed.map((m, i) => <li key={i} className="text-rose-700 dark:text-rose-300"><b className="font-medium">{m.course}</b> · <span translate="no">{m.title}</span> (due {format(new Date(m.due), 'EEE d')})</li>)}</Part>
          <Part title="Due the week after" empty="Nothing due yet.">{data.nextWeek.map((n, i) => <li key={i}><b className="font-medium">{n.course}</b> · <span translate="no">{n.title}</span> · {format(new Date(n.due), 'EEE d')}{n.done ? ' · done' : ''}</li>)}</Part>
          <Part title="From the teachers" empty="No announcements.">{data.announcements.map((a, i) => <li key={i}><b className="font-medium">{a.course}</b> · <span translate="no">{a.title}</span></li>)}</Part>
        </div>
      </div>
    </section>
  );
}

function Part({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <div className="break-inside-avoid">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">{title}</h3>
      {children.length ? <ul className="mt-1 space-y-0.5 text-sm text-zinc-700 dark:text-zinc-200">{children}</ul> : <p className="mt-1 text-sm text-zinc-500">{empty}</p>}
    </div>
  );
}
