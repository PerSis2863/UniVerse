'use client';

import useSWR from 'swr';
import { toast } from 'sonner';
import { Calendar, ClipboardCheck, Download, FileText, Mic, Repeat, Trash2, Video } from 'lucide-react';
import Link from '@/components/ui/Link';
import { authedFetch, authedJson } from '@/lib/authed-fetch';
import { downloadIcs } from '@/lib/ics';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useNow } from '@/lib/use-now';
import type { CourseCalendarItem, CourseWeekly } from '@/server/ical';

// A course's calendar (Stage 5 · B2): its weekly classes, then everything dated (assignment, quiz and
// oral due dates, events, class calls) day by day, from two weeks ago. "Add to my calendar"
// downloads it all for a calendar app; the Calendar page has the live feed for every course.

interface Cal { course: { id: string; code: string; name: string }; canManage: boolean; weekly: CourseWeekly[]; items: CourseCalendarItem[] }

export const courseCalendarKey = (courseId: string) => `/api/courses/${courseId}/calendar`;

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SLOT: Record<string, string> = { LECTURE: 'Lecture', LAB: 'Lab', TUTORIAL: 'Tutorial' };
const KIND = {
  assignment: { label: 'Assignment', icon: FileText, tint: 'bg-amber-500' },
  quiz: { label: 'Quiz', icon: ClipboardCheck, tint: 'bg-sky-500' },
  oral: { label: 'Oral check', icon: Mic, tint: 'bg-fuchsia-500' },
  event: { label: 'Event', icon: Calendar, tint: 'bg-indigo-500' },
  call: { label: 'Class call', icon: Video, tint: 'bg-emerald-500' },
} as const;

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function CourseCalendar({ courseId, side, onRemoveEvent }: { courseId: string; side: 'student' | 'teacher'; onRemoveEvent?: (id: string, title: string) => void }) {
  const { data, error } = useSWR<Cal>(courseCalendarKey(courseId), authedJson);
  const now = useNow();

  const download = async () => {
    try {
      const res = await authedFetch(`${courseCalendarKey(courseId)}?format=ics`);
      if (!res.ok) throw new Error('The calendar file couldn’t be made. Try again.');
      downloadIcs(await res.text(), `${data?.course.code ?? 'course'}-calendar.ics`);
    } catch (e) {
      toast.error(errorMessage(e, 'The calendar file couldn’t be made. Try again.'));
    }
  };

  if (error) return <p className="text-sm text-rose-600 dark:text-rose-400">{errorMessage(error, 'The calendar couldn’t load.')}</p>;
  if (!data) return <div className="h-40 rounded-2xl skeleton" />;

  // Group by the viewer's own day.
  const groups: { key: string; date: Date; items: CourseCalendarItem[] }[] = [];
  for (const i of data.items) {
    const d = new Date(i.at);
    const k = dayKey(d);
    const g = groups.find((x) => x.key === k);
    if (g) g.items.push(i); else groups.push({ key: k, date: d, items: [i] });
  }
  const today = now ? dayKey(new Date(now)) : '';
  const tomorrow = now ? dayKey(new Date(now + 86_400_000)) : '';
  const label = (g: { key: string; date: Date }) => (g.key === today ? 'Today' : g.key === tomorrow ? 'Tomorrow' : g.date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }));
  const past = (g: { date: Date }) => !!now && g.date.getTime() < new Date(now).setHours(0, 0, 0, 0);
  const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void download()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-white/10 text-zinc-800 dark:text-zinc-100 text-xs font-bold"><Download className="w-3.5 h-3.5" /> Add to my calendar (.ics)</button>
        <Link href={`/${side}/calendar`} className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 hover:underline">Keep every course in your calendar automatically →</Link>
      </div>

      <section aria-labelledby="weekly-h">
        <h4 id="weekly-h" className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-1.5"><Repeat className="w-4 h-4 text-indigo-500" /> Every week</h4>
        {data.weekly.length ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.weekly.map((s) => (
              <li key={s.id} className="text-xs px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200">
                <span className="font-semibold">{DAYS[s.dayOfWeek] ?? 'Day'}</span> {s.startTime}–{s.endTime} · {SLOT[s.type] ?? s.type.toLowerCase()}{s.room ? ` · ${s.room}` : ''}
              </li>
            ))}
          </ul>
        ) : <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">No weekly classes in the timetable yet.</p>}
      </section>

      <section aria-labelledby="dated-h">
        <h4 id="dated-h" className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-1.5"><Calendar className="w-4 h-4 text-indigo-500" /> Due dates and events</h4>
        {!groups.length ? <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Nothing dated in the next six months.</p> : (
          <ol className="mt-2 space-y-4">
            {groups.map((g) => (
              <li key={g.key} className={cn(past(g) && 'opacity-70')}>
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">{label(g)}{past(g) ? ' · past' : ''}</p>
                <ul className="mt-1.5 space-y-2">
                  {g.items.map((i) => {
                    const k = KIND[i.kind];
                    const body = (
                      <>
                        <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0', k.tint)} aria-hidden><k.icon className="w-4 h-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-zinc-900 dark:text-white break-words">{i.title}</span>
                          <span className="block text-xs text-zinc-600 dark:text-zinc-400">{k.label} · {i.note ?? ''}{i.note ? ' · ' : ''}{time(i.at)}{i.endAt ? `–${time(i.endAt)}` : ''}</span>
                        </span>
                      </>
                    );
                    return (
                      <li key={`${i.kind}-${i.id}`} className="panel p-3 flex items-center gap-3">
                        {i.href ? <Link href={i.href} className="flex items-center gap-3 min-w-0 flex-1">{body}</Link> : <span className="flex items-center gap-3 min-w-0 flex-1">{body}</span>}
                        {i.kind === 'event' && data.canManage && onRemoveEvent && (
                          <button type="button" aria-label={`Remove ${i.title}`} onClick={() => onRemoveEvent(i.id, i.title)} className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-500/10 shrink-0"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
