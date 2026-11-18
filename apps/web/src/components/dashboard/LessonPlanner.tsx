'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { CalendarPlus, CalendarRange, Check, ChevronDown, Loader2, Save, Wand2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { LoadError } from '@/components/ui/LoadError';
import { api, fetcher } from '@/lib/fetcher';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { lessonDates, lessonKey, mondayOf, spreadModules, MAX_WEEKS, type LessonDate, type Slot } from '@/lib/lesson-plan';

// The term lesson planner (M293; API /lesson-plans, src/server/lesson-plans.ts): every class of the
// course for the weeks of a term, from its timetable. Teachers plan each one and put them in the
// calendar; students see what each class is about, its materials and homework.

type Lesson = { day: string; slotId: string; topic: string; goals: string | null; homework: string | null; materialIds: string[]; done: boolean; inCalendar?: boolean };
type Plan = { canEdit: boolean; slots: Slot[]; materials: { id: string; title: string }[]; modules: string[]; lessons: Lesson[] };

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const localIso = (day: string, time: string) => new Date(`${day}T${time}:00`).toISOString();

export function LessonPlanner({ courseId }: { courseId: string }) {
  const { data, error, isLoading, mutate } = useSWR<Plan>(`/lesson-plans?courseId=${courseId}`, fetcher);
  const [from, setFrom] = useState(() => mondayOf(today()));
  const [weeks, setWeeks] = useState(12);
  const [edits, setEdits] = useState<Record<string, Lesson>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'save' | 'calendar'>(null);

  const dates = useMemo(() => (data ? lessonDates(data.slots, from, weeks) : []), [data, from, weeks]);
  const saved = useMemo(() => new Map((data?.lessons ?? []).map((l) => [lessonKey(l), l])), [data]);
  const lessonOf = (d: LessonDate): Lesson => edits[lessonKey(d)] ?? saved.get(lessonKey(d)) ?? { day: d.day, slotId: d.slotId, topic: '', goals: null, homework: null, materialIds: [], done: false };
  const change = (d: LessonDate, patch: Partial<Lesson>) => setEdits((e) => ({ ...e, [lessonKey(d)]: { ...lessonOf(d), ...patch } }));
  const dirty = Object.keys(edits).length;

  if (error) return <LoadError onRetry={() => void mutate()} />;
  if (isLoading || !data) return <ContentSkeleton />;
  if (!data.slots.length) return <EmptyState icon={CalendarRange} title="No classes in the timetable yet" hint={data.canEdit ? 'Add this course’s weekly classes to the timetable; the planner then lists every class of the term.' : 'Your teacher hasn’t set this course’s weekly classes yet.'} />;

  if (!data.canEdit) return <StudentPlan plan={data} />;

  const fill = () => {
    const keys = dates.map((d) => ({ key: lessonKey(d), planned: !!lessonOf(d).topic }));
    const topics = spreadModules(keys, data.modules);
    if (!topics.size) return void toast.info(data.modules.length ? 'Every class shown already has a topic.' : 'This course has no modules to fill from yet.');
    setEdits((e) => {
      const next = { ...e };
      for (const d of dates) { const t = topics.get(lessonKey(d)); if (t) next[lessonKey(d)] = { ...lessonOf(d), topic: t }; }
      return next;
    });
    toast.success(`${topics.size} classes filled from the modules`, { description: 'Check them, then Save.' });
  };
  const save = async () => {
    const byKey = new Map(dates.map((d) => [lessonKey(d), d]));
    const rows = Object.entries(edits).flatMap(([k, l]) => { const d = byKey.get(k); return d ? [{ ...l, startAt: localIso(d.day, d.start), endAt: localIso(d.day, d.end) }] : []; });
    setBusy('save');
    try {
      for (let i = 0; i < rows.length; i += 60) await api.post('/lesson-plans', { courseId, lessons: rows.slice(i, i + 60) });
      setEdits({});
      await mutate();
      toast.success('Lesson plan saved');
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t save the plan.')); }
    finally { setBusy(null); }
  };
  const toCalendar = async () => {
    setBusy('calendar');
    try { const r = await api.post<{ sent: number }>('/lesson-plans/calendar', { courseId }); toast.success(`${r.data.sent} classes in the calendar`, { description: 'Students see each class’s topic there.' }); void mutate(); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t update the calendar.')); }
    finally { setBusy(null); }
  };

  const byWeek = new Map<number, LessonDate[]>();
  for (const d of dates) byWeek.set(d.week, [...(byWeek.get(d.week) ?? []), d]);
  const planned = dates.filter((d) => lessonOf(d).topic).length;

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-end gap-3 p-4">
        <label className="text-sm"><span className="label">Term starts</span><input type="date" className="input" value={from} onChange={(e) => e.target.value && setFrom(mondayOf(e.target.value))} /></label>
        <label className="text-sm"><span className="label">Weeks</span><input type="number" className="input w-24" min={1} max={MAX_WEEKS} value={weeks} onChange={(e) => setWeeks(Math.min(MAX_WEEKS, Math.max(1, Number(e.target.value) || 1)))} /></label>
        <p className="me-auto self-center text-sm text-zinc-600 dark:text-zinc-300 tabular-nums">{planned} of {dates.length} classes planned</p>
        <button type="button" className="btn-secondary btn-sm" onClick={fill}><Wand2 className="w-4 h-4" aria-hidden />Fill from the modules</button>
        <button type="button" className="btn-secondary btn-sm" disabled={!!busy || dirty > 0} title={dirty ? 'Save first' : undefined} onClick={() => void toCalendar()}>{busy === 'calendar' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <CalendarPlus className="w-4 h-4" aria-hidden />}Put in the calendar</button>
        <button type="button" className="btn-primary btn-sm" disabled={!!busy || !dirty} onClick={() => void save()}>{busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Save className="w-4 h-4" aria-hidden />}Save{dirty ? ` (${dirty})` : ''}</button>
      </div>
      {[...byWeek.entries()].map(([week, list]) => (
        <section key={week} aria-label={`Week ${week}`} className="panel p-2">
          <h3 className="px-2 pt-1 pb-2 text-sm font-semibold text-zinc-900 dark:text-white">Week {week}</h3>
          <ul>
            {list.map((d) => {
              const l = lessonOf(d), k = lessonKey(d), expanded = open === k;
              return (
                <li key={k} className="border-t border-zinc-100 px-2 py-2 dark:border-white/[0.06]">
                  <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                    <span className="w-32 shrink-0 text-sm text-zinc-700 dark:text-zinc-200"><span className="block font-medium">{fmt(d.day)}</span><span className="text-xs text-zinc-500 tabular-nums">{d.start}–{d.end} · {d.type.toLowerCase()}</span></span>
                    <input aria-label={`Topic for ${fmt(d.day)} ${d.start}`} className={cn('input order-last min-w-0 basis-full sm:order-none sm:basis-0 sm:flex-1', l.done && 'line-through text-zinc-500')} maxLength={160} placeholder="Topic" value={l.topic} onChange={(e) => change(d, { topic: e.target.value })} />
                    <label className="ms-auto flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300 sm:ms-0"><input type="checkbox" checked={l.done} onChange={(e) => change(d, { done: e.target.checked })} />Taught</label>
                    <button type="button" className="btn-ghost btn-sm" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : k)}><ChevronDown className={cn('w-4 h-4 transition-transform', expanded && 'rotate-180')} aria-hidden /><span className="sr-only">Details for {fmt(d.day)}</span></button>
                  </div>
                  {expanded && (
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:ms-[8.5rem] sm:grid-cols-2">
                      <textarea aria-label="Goals" className="input min-h-16" maxLength={1000} placeholder="By the end, students can…" value={l.goals ?? ''} onChange={(e) => change(d, { goals: e.target.value })} />
                      <textarea aria-label="Homework" className="input min-h-16" maxLength={1000} placeholder="Homework" value={l.homework ?? ''} onChange={(e) => change(d, { homework: e.target.value })} />
                      {data.materials.length > 0 && (
                        <fieldset className="sm:col-span-2">
                          <legend className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Materials for this class</legend>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {data.materials.map((m) => {
                              const on = l.materialIds.includes(m.id);
                              return (
                                <label key={m.id} className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs', on ? 'border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-200' : 'border-zinc-200 text-zinc-700 dark:border-white/10 dark:text-zinc-200')}>
                                  <input type="checkbox" className="sr-only" checked={on} onChange={() => change(d, { materialIds: on ? l.materialIds.filter((x) => x !== m.id) : [...l.materialIds, m.id].slice(0, 10) })} />
                                  {on && <Check className="w-3 h-3" aria-hidden />}<span translate="no">{m.title}</span>
                                </label>
                              );
                            })}
                          </div>
                        </fieldset>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** What students see: the planned classes from today, with materials and homework. */
function StudentPlan({ plan }: { plan: Plan }) {
  const [now] = useState(today);
  const coming = plan.lessons.filter((l) => l.day >= now).slice(0, 30);
  const slot = (id: string) => plan.slots.find((s) => s.id === id);
  const title = (id: string) => plan.materials.find((m) => m.id === id)?.title;
  if (!coming.length) return <EmptyState icon={CalendarRange} title="No classes planned yet" hint="When your teacher plans the coming classes, their topics show here and in your calendar." />;
  return (
    <ol className="space-y-2">
      {coming.map((l) => (
        <li key={lessonKey(l)} className="panel p-4">
          <p className="text-xs text-zinc-500 tabular-nums">{fmt(l.day)}{slot(l.slotId) ? ` · ${slot(l.slotId)!.startTime}` : ''}</p>
          <p className="mt-0.5 font-semibold text-zinc-900 dark:text-white" translate="no">{l.topic}</p>
          {l.goals && <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-200" translate="no">{l.goals}</p>}
          {l.materialIds.length > 0 && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Materials: <span translate="no">{l.materialIds.map(title).filter(Boolean).join(', ')}</span></p>}
          {l.homework && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Homework: <span translate="no">{l.homework}</span></p>}
        </li>
      ))}
    </ol>
  );
}
