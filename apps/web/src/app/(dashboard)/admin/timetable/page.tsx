'use client';
import { confirmDialog } from '@/components/ui/Dialogs';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { CalendarClock, Loader2, Plus, Trash2, X } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';
import { authedJson } from '@/lib/authed-fetch';
import { courseColor } from '@/lib/course-color';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
type Slot = { id: string; dayOfWeek: number; startTime: string; endTime: string; type: string; course: { id: string; code: string; name: string; color: string | null }; room: { id: string; name: string } | null };
type Data = { slots: Slot[]; courses: { id: string; code: string; name: string }[]; rooms: { id: string; name: string }[] };
const input = 'w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-white/[0.05] border border-zinc-200 dark:border-white/10 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40';

export default function TimetableManagementPage() {
  const { data, isLoading, error, mutate } = useSWR<Data>('/api/admin/timetable', authedJson);
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
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    if (!(await confirmDialog({ title: 'Remove this class?', message: 'It will be taken off the timetable for everyone.', confirmLabel: 'Remove', destructive: true }))) return;
    try { await authedJson(`/api/admin/timetable?id=${id}`, { method: 'DELETE' }); mutate(); } catch (e: any) { toast.error(e.message); }
  };

  const slots = data?.slots ?? [];
  return (
    <>
      <Topbar title="Timetable Management" subtitle="Weekly class schedule for every course"
        rightNode={<button onClick={open} disabled={!data?.courses.length} className="btn-primary btn-sm"><Plus className="w-4 h-4" /> Add class</button>} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          {error && <p className="text-sm text-rose-500">{(error as Error).message}</p>}
          {form && (
            <div className="rounded-3xl border border-indigo-200/60 dark:border-indigo-400/20 bg-indigo-50/50 dark:bg-indigo-500/[0.05] p-5 grid sm:grid-cols-3 gap-3">
              <div className="sm:col-span-3 flex justify-between"><p className="font-bold text-zinc-900 dark:text-white">New class</p><button onClick={() => setForm(null)} aria-label="Cancel"><X className="w-4 h-4 text-zinc-500" /></button></div>
              <select className={input} value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>{data!.courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select>
              <select className={input} value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: Number(e.target.value) })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
              <select className={input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{['LECTURE', 'LAB', 'TUTORIAL'].map((t) => <option key={t} value={t}>{t.toLowerCase()}</option>)}</select>
              <input className={input} type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              <input className={input} type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
              <select className={input} value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}><option value="">No room</option>{data!.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
              <button onClick={save} aria-busy={busy || undefined} disabled={busy} className="btn-primary sm:col-span-3">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Add to timetable</button>
            </div>
          )}

          {isLoading ? <div className="h-48 rounded-3xl skeleton" /> : slots.length === 0 ? (
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
                        <li key={s.id} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-white/[0.03]">
                          <span className="w-1.5 h-10 rounded-full" style={{ backgroundColor: courseColor(s.course.color, s.course.code) }} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{s.course.code} · {s.course.name}</p>
                            <p className="text-xs text-zinc-500">{s.startTime}–{s.endTime} · {s.type.toLowerCase()}{s.room ? ` · ${s.room.name}` : ''}</p>
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
        </div>
      </div>
    </>
  );
}
