'use client';
import { confirmDialog } from '@/components/ui/Dialogs';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { AlertTriangle, CalendarClock, Loader2, Plus, Trash2, X } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';
import { authedJson } from '@/lib/authed-fetch';
import { courseColor } from '@/lib/course-color';
import { AdminSearch, PersonCell, matchesQuery, personText, type PersonInfo } from '@/components/admin/AdminPeople';
import { Segmented } from '@/components/ui/Segmented';
import { findConflicts } from '@/lib/schedule-solver';
import { asSpans, usePlanData, type PlanData } from '@/components/timetable/plan-data';
import { WeekPlanner } from '@/components/timetable/WeekPlanner';
import { ExamPlanner } from '@/components/timetable/ExamPlanner';

// Timetable Management: the week's classes (clashes marked), and (Stage 5 · Q12) the generators:
// Plan a week and Exams. ?tab=plan or ?tab=exams opens one.
type Tab = 'classes' | 'plan' | 'exams';

/** What clashes with each class: a teacher or room in two places, shared students, a room too small. */
function clashesOf(plan: PlanData | undefined): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!plan) return out;
  const courses = new Map(plan.courses.map((c) => [c.id, c]));
  const code = (i: number) => courses.get(plan.slots[i].courseId)?.code ?? 'another class';
  const add = (i: number, text: string) => { const id = plan.slots[i].id; out.set(id, [...(out.get(id) ?? []), text]); };
  for (const c of findConflicts(asSpans(plan.slots), courses, new Map(plan.rooms.map((r) => [r.id, r])), plan.overlaps)) {
    if (c.kind === 'noroom') continue;
    if (c.kind === 'capacity') { add(c.a, `The room seats fewer than its ${c.students} students`); continue; }
    const b = c.b!;
    const what = c.kind === 'teacher' ? 'Its teacher also teaches' : c.kind === 'room' ? 'The room also has' : `${c.students} of its students also have`;
    add(c.a, `${what} ${code(b)} then`);
    add(b, `${what} ${code(c.a)} then`);
  }
  return out;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
type Teacher = PersonInfo & { teacherProfile?: { department: string | null; designation: string | null } | null };
type Slot = {
  id: string; dayOfWeek: number; startTime: string; endTime: string; type: string;
  course: { id: string; code: string; name: string; color: string | null; department?: string | null; teacher?: Teacher | null; _count?: { enrollments: number } };
  room: { id: string; name: string } | null;
};
const minutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
type Data = { slots: Slot[]; courses: { id: string; code: string; name: string }[]; rooms: { id: string; name: string }[] };

export default function TimetableManagementPage() {
  const { data, isLoading, error, mutate } = useSWR<Data>('/api/admin/timetable', authedJson);
  const { data: plan } = usePlanData();
  // Dashboard pages render only in the browser, so the address can be read straight away.
  const [tab, setTab] = useState<Tab>(() => { const t = new URLSearchParams(window.location.search).get('tab'); return t === 'plan' || t === 'exams' ? t : 'classes'; });
  const clashes = useMemo(() => clashesOf(plan), [plan]);
  const [form, setForm] = useState<{ courseId: string; dayOfWeek: number; startTime: string; endTime: string; roomId: string; type: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const open = () => setForm({ courseId: data?.courses[0]?.id ?? '', dayOfWeek: 0, startTime: '09:00', endTime: '10:30', roomId: '', type: 'LECTURE' });

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      await authedJson('/api/admin/timetable', { method: 'POST', body: JSON.stringify(form) });
      toast.success('Class added to the timetable');
      setForm(null);
      mutate();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    if (!(await confirmDialog({ title: 'Remove this class?', message: 'It will be taken off the timetable for everyone.', confirmLabel: 'Remove', destructive: true }))) return;
    try { await authedJson(`/api/admin/timetable?id=${id}`, { method: 'DELETE' }); mutate(); } catch (e) { toast.error((e as Error).message); }
  };

  const [q, setQ] = useState('');
  const allSlots = useMemo(() => data?.slots ?? [], [data]);
  const slots = useMemo(() => allSlots.filter((s) => matchesQuery(q, s.course.code, s.course.name, s.course.department, s.type, s.room?.name, DAYS[s.dayOfWeek], s.startTime, personText(s.course.teacher))), [allSlots, q]);
  // Teaching load per teacher, from the slots shown.
  const teachers = useMemo(() => {
    const map = new Map<string, { teacher: Teacher; courses: Map<string, { code: string; students: number }>; classes: number; minutes: number }>();
    for (const s of slots) {
      const t = s.course.teacher;
      if (!t) continue;
      const key = t.id ?? t.email ?? t.name ?? '?';
      const row = map.get(key) ?? { teacher: t, courses: new Map(), classes: 0, minutes: 0 };
      row.courses.set(s.course.id, { code: s.course.code, students: s.course._count?.enrollments ?? 0 });
      row.classes += 1;
      row.minutes += Math.max(0, minutes(s.endTime) - minutes(s.startTime));
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.minutes - a.minutes);
  }, [slots]);
  return (
    <>
      <Topbar title="Timetable Management" subtitle="Weekly class schedule for every course, and who teaches it"
        rightNode={tab === 'classes' ? <button onClick={open} disabled={!data?.courses.length} className="btn-primary btn-sm"><Plus className="w-4 h-4" /> Add class</button> : undefined} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          <Segmented<Tab> label="Show" value={tab} onChange={setTab} className="w-full sm:w-auto"
            segments={[{ value: 'classes', label: clashes.size ? `Classes (${clashes.size} clashing)` : 'Classes' }, { value: 'plan', label: 'Plan a week' }, { value: 'exams', label: 'Exams' }]} />
          {tab !== 'classes' ? (
            !plan ? <div className="h-60 rounded-3xl skeleton" /> : tab === 'plan' ? <WeekPlanner data={plan} /> : <ExamPlanner data={plan} />
          ) : <>
          {error && <p className="text-sm text-rose-500">{(error as Error).message}</p>}
          {form && (
            <div className="rounded-3xl border border-indigo-200/60 dark:border-indigo-400/20 bg-indigo-50/50 dark:bg-indigo-500/[0.05] p-5 grid sm:grid-cols-3 gap-3">
              <div className="sm:col-span-3 flex justify-between"><p className="font-bold text-zinc-900 dark:text-white">New class</p><button onClick={() => setForm(null)} aria-label="Cancel"><X className="w-4 h-4 text-zinc-500" /></button></div>
              <select aria-label="Course" className="input" value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>{data!.courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select>
              <select aria-label="Day of week" className="input" value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: Number(e.target.value) })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
              <select aria-label="Type" className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{['LECTURE', 'LAB', 'TUTORIAL'].map((t) => <option key={t} value={t}>{t.toLowerCase()}</option>)}</select>
              <input aria-label="Start time" className="input" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              <input aria-label="End time" className="input" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
              <select aria-label="Room" className="input" value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}><option value="">No room</option>{data!.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
              <button onClick={save} aria-busy={busy || undefined} disabled={busy} className="btn-primary sm:col-span-3">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Add to timetable</button>
            </div>
          )}

          {clashes.size > 0 && (
            <div role="status" className="rounded-2xl p-4 flex gap-3 items-start bg-amber-500/10 text-amber-900 dark:text-amber-100 text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <p><b>{clashes.size} class{clashes.size === 1 ? '' : 'es'} clash</b> (a teacher or room in two places, students with two classes at once, or a room too small); they’re marked below. <button type="button" onClick={() => setTab('plan')} className="underline font-semibold">Plan a week</button> works out one without clashes.</p>
            </div>
          )}
          {allSlots.length > 0 && (
            <AdminSearch value={q} onChange={setQ} placeholder="Search course, teacher name/email, room, day or type…" shown={slots.length} total={allSlots.length} />
          )}
          {isLoading ? <div className="h-48 rounded-3xl skeleton" /> : allSlots.length > 0 && slots.length === 0 ? (
            <p className="rounded-3xl border border-dashed border-zinc-300 dark:border-zinc-700 p-10 text-center text-sm text-zinc-500">No classes match your search.</p>
          ) : slots.length === 0 ? (
            <FeatureGuide
              icon={CalendarClock}
              title="Build your weekly timetable"
              description={data?.courses.length ? 'Schedule each course’s lectures, labs and tutorials. Students see their classes on their dashboard and timetable automatically.' : 'First create courses (Management → Courses), then schedule their classes here.'}
              steps={['Create your courses', 'Add each class with day, time and room', 'Students and teachers see it on their timetable and dashboard']}
              example={<div><ExampleRow title="CS301 · Operating Systems" meta="Monday 09:00–10:30 · Room B-204" right="Lecture" /><ExampleRow title="CS301 · Operating Systems" meta="Wednesday 14:00–16:00 · Lab 3" right="Lab" accent="from-emerald-500 to-teal-500" /></div>}
              action={data?.courses.length ? { label: 'Add class', onClick: open } : { label: 'Create a course', href: '/admin/courses' }}
            />
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {DAYS.map((day, d) => {
                const daySlots = slots.filter((s) => s.dayOfWeek === d);
                if (daySlots.length === 0) return null;
                return (
                  <section key={day} className="rounded-3xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] p-5">
                    <h3 className="font-bold text-zinc-900 dark:text-white mb-3">{day}</h3>
                    <ul className="space-y-2">
                      {daySlots.map((s) => (
                        <li key={s.id} className={`flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-white/[0.03] ${clashes.has(s.id) ? 'ring-1 ring-amber-500/60' : ''}`}>
                          <span className="w-1.5 h-10 rounded-full" style={{ backgroundColor: courseColor(s.course.color, s.course.code) }} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{s.course.code} · {s.course.name}</p>
                            <p className="text-xs text-zinc-500">{s.startTime}–{s.endTime} · {s.type.toLowerCase()}{s.room ? ` · ${s.room.name}` : ''}{s.course._count ? ` · ${s.course._count.enrollments} enrolled` : ''}</p>
                            {s.course.teacher !== undefined && (
                              <p className="text-xs text-zinc-500 truncate" title={s.course.teacher?.email ?? undefined}>
                                {s.course.teacher ? <>Teacher: <span className="font-medium text-zinc-700 dark:text-zinc-300">{s.course.teacher.name}</span>{s.course.teacher.email ? ` · ${s.course.teacher.email}` : ''}</> : 'No teacher assigned'}
                              </p>
                            )}
                            {clashes.get(s.id)?.map((t) => <p key={t} className="text-xs font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-1"><AlertTriangle className="w-3 h-3 shrink-0" aria-hidden />{t}</p>)}
                          </div>
                          <button onClick={() => remove(s.id)} aria-label="Remove" className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}

          {teachers.length > 0 && (
            <section className="rounded-3xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] p-4 sm:p-5">
              <h2 className="font-bold text-zinc-900 dark:text-white">Teachers on the timetable</h2>
              <p className="text-xs text-zinc-500 mb-3">Weekly classes and hours per teacher{q.trim() ? ' (matching your search)' : ''}</p>
              <ul className="divide-y divide-zinc-200 dark:divide-white/[0.06]">
                {teachers.map((t, i) => {
                  const courses = [...t.courses.values()];
                  return (
                    <li key={t.teacher.id ?? i} className="py-3 grid gap-2 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:items-center">
                      <PersonCell person={t.teacher} extra={[t.teacher.teacherProfile?.designation, t.teacher.teacherProfile?.department].filter(Boolean).join(' · ') || null} />
                      <div className="text-xs text-zinc-600 dark:text-zinc-400 md:text-end">
                        <p className="font-semibold text-zinc-900 dark:text-white">{t.classes} class{t.classes === 1 ? '' : 'es'} · {(t.minutes / 60).toFixed(1)} h / week</p>
                        <p>{courses.map((c) => c.code).join(', ')} · {courses.reduce((n, c) => n + c.students, 0)} enrolled</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          </>}
        </div>
      </div>
    </>
  );
}
