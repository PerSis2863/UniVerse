'use client';
import { confirmDialog } from '@/components/ui/Dialogs';
import { Topbar } from '@/components/layout/Topbar';
import { Plus, Edit2, Trash2, X, BookOpen, Users, FileText, Search, Mail, Loader2, GraduationCap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { format, formatDistanceToNow } from 'date-fns';
import { fetcher } from '@/lib/fetcher';
import { api } from '@/lib/api';
import { courseColor } from '@/lib/course-color';
import { cn } from '@/lib/utils';

interface AdminCourse {
  id: string; code: string; name: string; description: string | null; credits: number; department: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; teacherId: string; color: string | null; emoji: string | null; createdAt: string;
  teacher: { id: string; name: string; email?: string; status?: string } | null;
  _count?: { enrollments: number; materials: number; quizzes: number };
}
interface Teacher {
  id: string; name: string; email: string; status: string; lastSeenAt?: string | null; createdAt: string;
  teacherProfile: { department: string | null; designation: string | null } | null;
  _count?: { taughtCourses: number };
}
const STATUS_STYLE: Record<string, string> = {
  PUBLISHED: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  DRAFT: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400',
  ARCHIVED: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
};
const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const searchInput = 'w-full pl-9 pr-9 py-2 rounded-lg bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500';

export default function AdminCoursesPage() {
  const { data: courses = [], isLoading, mutate: mutateCourses } = useSWR<AdminCourse[]>('/courses/admin/all', fetcher);
  const { data: teachers = [] } = useSWR<Teacher[]>('/users?role=TEACHER', fetcher);
  const [view, setView] = useState<'courses' | 'teachers'>('courses');
  const [q, setQ] = useState('');
  const [teacherFilter, setTeacherFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [rosterFor, setRosterFor] = useState<AdminCourse | null>(null);

  const term = q.trim().toLowerCase();
  const shownCourses = useMemo(() => courses.filter((c) =>
    (!term || [c.name, c.code, c.department, c.teacher?.name, c.teacher?.email].filter(Boolean).join(' ').toLowerCase().includes(term))
    && (!teacherFilter || c.teacherId === teacherFilter)
    && (!statusFilter || c.status === statusFilter)), [courses, term, teacherFilter, statusFilter]);
  const coursesByTeacher = useMemo(() => {
    const m = new Map<string, AdminCourse[]>();
    for (const c of courses) m.set(c.teacherId, [...(m.get(c.teacherId) ?? []), c]);
    return m;
  }, [courses]);
  const shownTeachers = useMemo(() => teachers.filter((t) =>
    !term || [t.name, t.email, t.teacherProfile?.department, t.teacherProfile?.designation, ...(coursesByTeacher.get(t.id) ?? []).map((c) => `${c.code} ${c.name}`)]
      .filter(Boolean).join(' ').toLowerCase().includes(term)), [teachers, term, coursesByTeacher]);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '', code: '', teacherId: '', emoji: '📚', color: '#6366f1', description: ''
  });

  const handleOpenModal = (id: string | null = null) => {
    if (id) {
      const item = courses.find((c) => c.id === id);
      if (item) setFormData({ name: item.name, code: item.code, teacherId: item.teacherId, emoji: item.emoji || '📚', color: item.color || '#6366f1', description: item.description || '' });
      setEditingId(id);
    } else {
      setFormData({ name: '', code: '', teacherId: '', emoji: '📚', color: '#6366f1', description: '' });
      setEditingId(null);
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.patch(`/courses/${editingId}`, formData);
        toast.success('Course updated successfully');
      } else {
        await api.post('/courses', formData);
        toast.success('New course created');
      }
      setIsModalOpen(false);
      mutateCourses();
    } catch (error) {
      toast.error((error as { response?: { data?: { message?: string } } }).response?.data?.message || 'An error occurred');
    }
  };
  
  const handleDelete = async (id: string) => {
    if (await confirmDialog({ title: 'Delete this course?', message: 'Its materials, quizzes, grades and enrollments will be deleted too. This can’t be undone.', destructive: true })) {
      try {
        await api.delete(`/courses/${id}`);
        toast.success('Course deleted');
        mutateCourses();
      } catch {
        toast.error('Failed to delete course');
      }
    }
  };

  return (
    <>
      <Topbar 
        title="Courses Management" 
        subtitle="Every course with its teacher and enrolled students"
        rightNode={
          <button 
            onClick={() => handleOpenModal()}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" /> Create Course
          </button>
        }
      />
      
      {/* Modal */}
      {isModalOpen && (
        <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="sheet-in bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center p-6 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">{editingId ? 'Edit Course' : 'Create New Course'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Course Name</label>
                  <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} type="text" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. Intro to Psychology" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Course Code</label>
                  <input required value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} type="text" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. PSY101" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Primary Instructor</label>
                  <select required value={formData.teacherId} onChange={e => setFormData({...formData, teacherId: e.target.value})} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors">
                    <option value="" disabled>Select an instructor</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Emoji icon</label>
                    <input required value={formData.emoji} onChange={e => setFormData({...formData, emoji: e.target.value})} type="text" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors" placeholder="🧠" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Cover Color</label>
                    <input required value={formData.color} onChange={e => setFormData({...formData, color: e.target.value})} type="color" className="w-full h-10 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-1 py-1 cursor-pointer outline-none focus:border-indigo-500 transition-colors" />
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Description</label>
                  <textarea required value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} rows={3} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors resize-none" placeholder="Brief overview of the course syllabus..." />
                </div>
              </div>
              
              <div className="pt-4 flex justify-end gap-3 border-t border-zinc-200 dark:border-zinc-800 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors">
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Course
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">

          <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
            <div role="tablist" className="inline-flex p-1 rounded-xl bg-zinc-100 dark:bg-white/[0.06] w-fit">
              {([['courses', `Courses (${courses.length})`], ['teachers', `Teachers (${teachers.length})`]] as const).map(([id, label]) => (
                <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)}
                  className={cn('px-3 py-1.5 rounded-lg text-sm font-semibold', view === id ? 'bg-white dark:bg-white/10 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500')}>{label}</button>
              ))}
            </div>
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search"
                placeholder={view === 'courses' ? 'Search course, code, department or teacher…' : 'Search teacher name, email, department or course…'} className={searchInput} />
              {q && <button onClick={() => setQ('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"><X className="w-4 h-4" /></button>}
            </div>
            {view === 'courses' && (
              <div className="flex gap-2">
                <select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)} aria-label="Filter by teacher"
                  className="flex-1 min-w-0 lg:w-48 px-3 py-2 rounded-lg bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-700 dark:text-zinc-300">
                  <option value="">All teachers</option>
                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status"
                  className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-700 dark:text-zinc-300">
                  <option value="">Any status</option>
                  <option value="PUBLISHED">Published</option>
                  <option value="DRAFT">Draft</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
            )}
          </div>

          {view === 'courses' ? (
            isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{[0, 1, 2].map((i) => <div key={i} className="h-72 rounded-xl skeleton" />)}</div>
            ) : shownCourses.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 p-12 text-center text-sm text-zinc-500">
                {courses.length ? 'No courses match these filters.' : 'No courses yet. Use “Create Course” to add the first one.'}
              </div>
            ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {shownCourses.map((course) => (
              <div key={course.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden flex flex-col group">
                <div className="h-24 p-6 relative flex items-center justify-between" style={{ backgroundColor: courseColor(course.color, course.code) }}>
                  <div className="bg-black/40 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium text-white">
                    {course.code}
                  </div>
                  <div className="text-4xl">{course.emoji || '📚'}</div>
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white break-words min-w-0">{course.name}</h3>
                    <span className={cn('shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full', STATUS_STYLE[course.status])}>{cap(course.status)}</span>
                  </div>
                  <p className="text-xs text-zinc-500 mb-2">{[course.department, `${course.credits} credit${course.credits === 1 ? '' : 's'}`, `created ${format(new Date(course.createdAt), 'd MMM yyyy')}`].filter(Boolean).join(' · ')}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2 mb-4 flex-1">
                    {course.description}
                  </p>
                  
                  <div className="flex items-start gap-2 mb-4 min-w-0">
                    <GraduationCap className="w-4 h-4 mt-0.5 text-zinc-500 shrink-0" />
                    <div className="min-w-0 text-sm">
                      <p className="text-zinc-700 dark:text-zinc-300 font-medium">{course.teacher?.name || 'Unassigned'}{course.teacher?.status === 'SUSPENDED' ? <span className="ml-1 text-xs text-red-500">(suspended)</span> : null}</p>
                      {course.teacher?.email && <a href={`mailto:${course.teacher.email}`} className="text-xs text-indigo-500 break-all">{course.teacher.email}</a>}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 text-xs text-zinc-600 dark:text-zinc-400 p-3 bg-zinc-50 dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 mb-4">
                    <div className="flex flex-col gap-1 items-center border-r border-zinc-200 dark:border-zinc-800">
                      <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5"/> Students</span>
                      <span className="text-zinc-900 dark:text-white font-medium text-sm">{course._count?.enrollments || 0}</span>
                    </div>
                    <div className="flex flex-col gap-1 items-center border-r border-zinc-200 dark:border-zinc-800">
                      <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5"/> Materials</span>
                      <span className="text-zinc-900 dark:text-white font-medium text-sm">{course._count?.materials || 0}</span>
                    </div>
                    <div className="flex flex-col gap-1 items-center">
                      <span className="flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5"/> Quizzes</span>
                      <span className="text-zinc-900 dark:text-white font-medium text-sm">{course._count?.quizzes || 0}</span>
                    </div>
                  </div>
                </div>
                
                <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 flex justify-between gap-2">
                  <button onClick={() => setRosterFor(course)} className="btn-secondary btn-sm">
                    <Users className="w-4 h-4" /> Students
                  </button>
                  <div className="flex gap-2">
                  <button 
                    onClick={() => handleOpenModal(course.id)}
                    className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors inline-flex items-center justify-center"
                    title="Edit" aria-label={`Edit ${course.name}`}
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDelete(course.id)}
                    className="p-2 text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors inline-flex items-center justify-center"
                    title="Delete" aria-label={`Delete ${course.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
            )
          ) : (
            <TeacherList teachers={shownTeachers} total={teachers.length} coursesByTeacher={coursesByTeacher} onRoster={setRosterFor} />
          )}

        </div>
      </div>

      {rosterFor && <RosterSheet course={rosterFor} onClose={() => setRosterFor(null)} />}
    </>
  );
}

function TeacherList({ teachers, total, coursesByTeacher, onRoster }: { teachers: Teacher[]; total: number; coursesByTeacher: Map<string, AdminCourse[]>; onRoster: (c: AdminCourse) => void }) {
  if (!teachers.length) {
    return <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 p-12 text-center text-sm text-zinc-500">{total ? 'No teachers match this search.' : 'No teacher accounts yet.'}</div>;
  }
  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {teachers.map((t) => {
        const list = coursesByTeacher.get(t.id) ?? [];
        const students = list.reduce((n, c) => n + (c._count?.enrollments ?? 0), 0);
        return (
          <li key={t.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 min-w-0">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-medium shrink-0">{t.name.charAt(0).toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-zinc-900 dark:text-white break-words">{t.name}{t.status !== 'ACTIVE' && <span className="ml-2 text-[11px] font-bold text-amber-600 dark:text-amber-400">{cap(t.status)}</span>}</p>
                <a href={`mailto:${t.email}`} className="text-sm text-indigo-500 break-all inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5 shrink-0" />{t.email}</a>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {[t.teacherProfile?.designation, t.teacherProfile?.department].filter(Boolean).join(' · ') || 'No department set'}
                  {' · '}last active {t.lastSeenAt ? formatDistanceToNow(new Date(t.lastSeenAt), { addSuffix: true }) : 'never'}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">{list.length} course{list.length === 1 ? '' : 's'} · {students} enrolled student{students === 1 ? '' : 's'}</p>
            {list.length ? (
              <ul className="mt-2 space-y-1">
                {list.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-zinc-800 dark:text-zinc-200"><b>{c.code}</b> · {c.name}</span>
                    <button onClick={() => onRoster(c)} className="shrink-0 text-xs font-semibold text-indigo-500 hover:underline">{c._count?.enrollments ?? 0} students</button>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-1 text-sm text-zinc-500">Not teaching any course.</p>}
          </li>
        );
      })}
    </ul>
  );
}

interface CourseRoster { enrollments: { id: string; enrolledAt: string; student: { id: string; name: string; email: string } }[] }

/** Enrolled students of one course (from the course detail, which admins can always open). */
function RosterSheet({ course, onClose }: { course: AdminCourse; onClose: () => void }) {
  const { data, isLoading, error } = useSWR<CourseRoster>(`/courses/${course.id}`, fetcher);
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const all = useMemo(() => [...(data?.enrollments ?? [])].sort((a, b) => a.student.name.localeCompare(b.student.name)), [data]);
  const rows = all.filter((e) => !term || `${e.student.name} ${e.student.email}`.toLowerCase().includes(term));

  const exportCsv = () => {
    const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [['Student', 'Email', 'Enrolled'], ...all.map((e) => [e.student.name, e.student.email, e.enrolledAt.slice(0, 10)])].map((r) => r.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    Object.assign(document.createElement('a'), { href: url, download: `${course.code}-students.csv` }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="backdrop-in fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`${course.code} students`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet-in w-full sm:max-w-lg max-h-[90vh] flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white break-words">{course.code} · {course.name}</h2>
            <p className="text-sm text-zinc-500">Taught by {course.teacher?.name ?? 'nobody yet'}{course.teacher?.email ? ` (${course.teacher.email})` : ''}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search students" aria-label="Search students" className={searchInput} />
          </div>
          <button onClick={exportCsv} disabled={!all.length} className="btn-secondary btn-sm">CSV</button>
        </div>
        <div className="overflow-y-auto">
          {isLoading ? (
            <div className="p-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>
          ) : error ? (
            <p className="p-10 text-center text-sm text-rose-500">Could not load the students.</p>
          ) : !all.length ? (
            <p className="p-10 text-center text-sm text-zinc-500">No students are enrolled in this course yet.</p>
          ) : !rows.length ? (
            <p className="p-10 text-center text-sm text-zinc-500">No students match “{q}”.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((e) => (
                <li key={e.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-sm font-semibold shrink-0">{e.student.name.charAt(0).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">{e.student.name}</p>
                    <a href={`mailto:${e.student.email}`} className="text-xs text-indigo-500 break-all">{e.student.email}</a>
                  </div>
                  <span className="text-xs text-zinc-500 shrink-0">since {format(new Date(e.enrolledAt), 'd MMM yyyy')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500">{all.length} enrolled{term ? ` · ${rows.length} shown` : ''}</p>
      </div>
    </div>
  );
}
