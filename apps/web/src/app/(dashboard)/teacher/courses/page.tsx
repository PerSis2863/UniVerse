'use client';
import { errorMessage } from '@/lib/api';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { confirmDialog } from '@/components/ui/Dialogs';
import { useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { BookOpen, ChevronRight, Edit, Trash2, Plus, X, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { fetcher, api } from '@/lib/fetcher';
import { courseColor } from '@/lib/course-color';
import { SectionTabs, TEACHER_COURSE_TABS } from '@/components/layout/SectionTabs';
import { NewCourseSheet } from '@/components/dashboard/NewCourseSheet';
import { CardHead } from '@/components/ui/CardMenu';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MiniColumns } from '@/components/instruments/MiniColumns';
import { Ring } from '@/components/instruments/parts';

interface TeacherCourse { id: string; name: string; code: string; description?: string | null; color?: string | null; emoji?: string | null; _count?: { enrollments?: number; materials?: number } }

export default function TeacherCourses() {
  const router = useRouter();
  const { data: courses = [], isLoading, mutate } = useSWR<TeacherCourse[]>('/courses/my', fetcher);
  const [newOpen, setNewOpen] = useState(false);
  const [showEditModal, setShowEditModal] = useState<TeacherCourse | null>(null);
  
  // M143: each course's hand-ins per day over 14 days (the cards' small charts, the summary).
  const { data: activity } = useSWR<Record<string, number[]>>(courses.length ? '/courses/my/activity' : null, (u: string) => api.get(`${u}?tz=${-new Date().getTimezoneOffset()}`).then((r) => r.data));
  const DAYS = 14;
  const daily = Array.from({ length: DAYS }, (_, i) => courses.reduce((n, c) => n + (activity?.[c.id]?.[i] ?? 0), 0));
  const handIns = daily.reduce((a, b) => a + b, 0);
  const students = courses.reduce((n, c) => n + (c._count?.enrollments ?? 0), 0);
  const active = courses.filter((c) => (activity?.[c.id] ?? []).some((n) => n > 0)).length;
  const most = Math.max(1, ...courses.map((c) => c._count?.enrollments ?? 0));

  const [formData, setFormData] = useState({ code: '', name: '', description: '', emoji: '📚', color: '#27272a' });

  const handleEdit = async () => {
    try {
      await api.patch(`/courses/${showEditModal.id}`, formData);
      await mutate();
      setShowEditModal(null);
      toast.success('Course updated successfully!');
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to update course'));
    }
  };

  const openEdit = (course: TeacherCourse) => {
    setFormData({ code: course.code, name: course.name, description: course.description, emoji: course.emoji, color: course.color });
    setShowEditModal(course);
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog({ title: 'Delete this course?', message: 'Its materials, quizzes, grades and enrollments will be deleted too. This can’t be undone.', destructive: true }))) return;
    try {
      await api.delete(`/courses/${id}`);
      await mutate();
      toast.success('Course deleted.');
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to delete course'));
    }
  };

  return (
    <>
      <Topbar title="My Courses"
        subtitle={courses.length ? `${courses.length} course${courses.length === 1 ? '' : 's'} · ${students} student${students === 1 ? '' : 's'} · ${handIns} hand-in${handIns === 1 ? '' : 's'} in ${DAYS} days` : 'Manage your created courses'}
        rightNode={<>
          {courses.length > 0 && activity && (
            <span className="inline-flex items-center gap-2 h-9 px-3 rounded-full border border-zinc-200 dark:border-white/[0.12] bg-[var(--card-bg)] text-[13px] font-medium text-zinc-800 dark:text-zinc-100">
              <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden />{active} of {courses.length} active this fortnight
            </span>
          )}
          <button type="button" onClick={() => setNewOpen(true)} className="btn-primary btn-sm"><Plus className="w-4 h-4" /> New course</button>
        </>} />
      <SectionTabs tabs={TEACHER_COURSE_TABS} />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto space-y-6">
        {isLoading ? (
          <ContentSkeleton variant="grid" />
        ) : courses.length === 0 ? (
          <div className="card text-center py-12">
            <BookOpen className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">No courses yet</h2>
            <p className="text-zinc-600 dark:text-zinc-400">You haven’t created any courses.</p>
            <button type="button" onClick={() => setNewOpen(true)} className="btn-primary mt-5"><Plus className="w-4 h-4" /> New course</button>
          </div>
        ) : (
          <>
            {/* M143: the reels' Agent Center: three summary cards, then a card per course */}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <section className="card">
                <CardHead title="Students by course" sub="Who is enrolled in each" />
                <ul className="space-y-2.5">
                  {courses.slice(0, 6).map((c) => (
                    <li key={c.id} className="grid grid-cols-[minmax(0,8rem)_1fr_2rem] items-center gap-3 text-[13px]">
                      <span className="truncate text-zinc-700 dark:text-zinc-300" translate="no">{c.name}</span>
                      <span className="h-2 rounded-full overflow-hidden bg-zinc-100 dark:bg-white/[0.07]"><span className="block h-full rounded-full bg-indigo-600" style={{ width: `${((c._count?.enrollments ?? 0) / most) * 100}%` }} /></span>
                      <span className="text-end tabular-nums font-medium text-zinc-900 dark:text-white">{c._count?.enrollments ?? 0}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="card">
                <CardHead title="Hand-ins" sub={`Across your courses, the last ${DAYS} days`} />
                <p className="text-[28px] font-semibold tracking-tight tabular-nums text-zinc-900 dark:text-white leading-none mb-4">{handIns} <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">hand-in{handIns === 1 ? '' : 's'}</span></p>
                {activity ? <MiniColumns values={daily} /> : <div className="h-16 rounded-lg skeleton" />}
              </section>
              <section className="card">
                <CardHead title="Active courses" sub="With a hand-in in the last 14 days" />
                <div className="flex items-center gap-4">
                  <div className="shrink-0 text-zinc-900 dark:text-white">
                    <Ring pct={courses.length ? (active / courses.length) * 100 : 0} size={96} text={String(active)} label={`of ${courses.length}`} />
                  </div>
                  <ul className="space-y-1.5 text-[13px]">
                    <li className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-indigo-600" aria-hidden /><span className="text-zinc-700 dark:text-zinc-300">Active {active}</span></li>
                    <li className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-white/25" aria-hidden /><span className="text-zinc-700 dark:text-zinc-300">Quiet {courses.length - active}</span></li>
                  </ul>
                </div>
              </section>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {courses.map((course) => {
                const days = activity?.[course.id] ?? new Array<number>(DAYS).fill(0);
                const sum = days.reduce((a, b) => a + b, 0);
                const color = courseColor(course.color, course.code);
                return (
                  <article key={course.id} className="card course-card flex flex-col gap-4">
                    <header className="flex items-start gap-3">
                      <span className="w-10 h-10 shrink-0 rounded-lg grid place-items-center text-lg" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }} aria-hidden>{course.emoji || '📚'}</span>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-[14px] font-semibold text-zinc-900 dark:text-white truncate" translate="no">{course.name}</h2>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate"><span translate="no">{course.code}</span>{course.description ? ` · ${course.description}` : ''}</p>
                      </div>
                      <StatusBadge tone={sum ? 'green' : 'grey'}>{sum ? 'Active' : 'Quiet'}</StatusBadge>
                    </header>
                    <dl className="grid grid-cols-3 gap-2">
                      <div><dt className="text-xs text-zinc-500 dark:text-zinc-400">Students</dt><dd className="text-[15px] font-semibold tabular-nums text-zinc-900 dark:text-white">{course._count?.enrollments ?? 0}</dd></div>
                      <div><dt className="text-xs text-zinc-500 dark:text-zinc-400">Materials</dt><dd className="text-[15px] font-semibold tabular-nums text-zinc-900 dark:text-white">{course._count?.materials ?? 0}</dd></div>
                      <div><dt className="text-xs text-zinc-500 dark:text-zinc-400">Hand-ins, {DAYS} d</dt><dd className="text-[15px] font-semibold tabular-nums text-zinc-900 dark:text-white">{activity ? sum : '…'}</dd></div>
                    </dl>
                    <MiniColumns values={days} />
                    <footer className="flex items-center gap-1 pt-3 mt-auto border-t border-zinc-200/70 dark:border-white/[0.07]">
                      <button type="button" aria-label={`Edit ${course.name}`} onClick={() => openEdit(course)} className="btn-ghost btn-icon w-8 h-8 rounded-md"><Edit className="w-4 h-4" /></button>
                      <button type="button" aria-label={`Delete ${course.name}`} onClick={() => handleDelete(course.id)} className="btn-ghost btn-icon w-8 h-8 rounded-md text-rose-700 dark:text-rose-300"><Trash2 className="w-4 h-4" /></button>
                      <button type="button" onClick={() => router.push(`/teacher/blackboard?course=${course.id}`)} className="btn-secondary btn-sm ms-auto">Open board<ChevronRight className="w-4 h-4 rtl:rotate-180" /></button>
                    </footer>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>

      {newOpen && <NewCourseSheet onClose={() => { setNewOpen(false); void mutate(); }} />}
      {showEditModal && (
        <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="sheet-in tone-panel border border-zinc-200 dark:border-zinc-800 w-full max-w-lg rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Edit course</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">Fill in the details for this course.</p>
              </div>
              <button aria-label="Close" onClick={() => setShowEditModal(null)} className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300 block mb-1">Course Code *</label>
                  <input type="text" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} placeholder="e.g. CS101" className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300 block mb-1">Emoji</label>
                  <input type="text" value={formData.emoji} onChange={e => setFormData({...formData, emoji: e.target.value})} className="w-20 px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 text-center" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300 block mb-1">Course Name *</label>
                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Introduction to Computer Science" className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300 block mb-1">Description</label>
                <textarea rows={3} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="What is this course about?" className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300 block mb-1">Theme Color</label>
                <input type="color" value={formData.color} onChange={e => setFormData({...formData, color: e.target.value})} className="w-full h-10 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none" />
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <button onClick={() => setShowEditModal(null)} className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">Cancel</button>
              <button onClick={handleEdit} className="btn-primary">
                <Upload className="w-4 h-4" /> Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
