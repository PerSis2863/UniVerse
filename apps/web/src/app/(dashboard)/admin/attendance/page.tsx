'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Users, UserCheck, UserX, Clock, Calendar, CheckCircle2, ChevronDown, Download, Save, Filter, Search, X, Mail, CircleDashed } from 'lucide-react';
import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { format } from 'date-fns';
import { fetcher } from '@/lib/fetcher';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
type Upper = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
interface Course { id: string; code: string; name: string; teacher: { id: string; name: string; email?: string } | null; _count?: { enrollments: number } }
interface CourseDay {
  enrollments: { id: string; enrolledAt: string; student: { id: string; name: string; email: string } }[];
  attendance: { studentId: string; status: Upper }[];
  /** Each student's attendance in this course so far, by status. */
  summary?: Record<string, Partial<Record<Upper, number>>>;
}

const STATUS_BUTTONS: { id: AttendanceStatus; label: string; on: string }[] = [
  { id: 'present', label: 'Present', on: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' },
  { id: 'absent', label: 'Absent', on: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30' },
  { id: 'late', label: 'Late', on: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30' },
  { id: 'excused', label: 'Excused', on: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30' },
];

/** "92% present · 3 absent of 40 sessions" from a student's totals in the course. */
function history(t?: Partial<Record<Upper, number>>) {
  if (!t) return null;
  const total = (t.PRESENT ?? 0) + (t.ABSENT ?? 0) + (t.LATE ?? 0) + (t.EXCUSED ?? 0);
  if (!total) return null;
  const rate = Math.round((((t.PRESENT ?? 0) + (t.LATE ?? 0)) / total) * 100);
  return { rate, total, absent: t.ABSENT ?? 0, late: t.LATE ?? 0 };
}

export default function AdminAttendance() {
  const { data: courses = [] } = useSWR<Course[]>('/courses/admin/all', fetcher);

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [pickedCourse, setSelectedCourse] = useState('');
  const [q, setQ] = useState('');
  // Until one is picked, the first course is shown.
  const selectedCourse = pickedCourse || courses[0]?.id || '';

  const { data: courseData, isLoading, mutate: mutateCourseData } = useSWR<CourseDay>(
    selectedCourse ? `/attendance/course/${selectedCourse}?date=${selectedDate}` : null,
    fetcher
  );
  const course = courses.find((c) => c.id === selectedCourse);

  const [localEdits, setLocalEdits] = useState<Record<string, AttendanceStatus>>({});
  const [isSaving, setIsSaving] = useState(false);

  const currentAttendance = useMemo(() => {
    const record: Record<string, AttendanceStatus> = {};
    courseData?.attendance?.forEach((att) => {
      record[att.studentId] = att.status.toLowerCase() as AttendanceStatus;
    });
    return { ...record, ...localEdits };
  }, [courseData, localEdits]);

  const enrollments = useMemo(() => [...(courseData?.enrollments ?? [])].sort((a, b) => a.student.name.localeCompare(b.student.name)), [courseData]);
  const term = q.trim().toLowerCase();
  const shown = enrollments.filter((e) => !term || `${e.student.name} ${e.student.email}`.toLowerCase().includes(term));

  // Only what is actually marked (saved or about to be saved) counts; unmarked students are shown as such.
  const stats = useMemo(() => {
    let present = 0, absent = 0, late = 0, excused = 0;
    for (const e of enrollments) {
      const s = currentAttendance[e.student.id];
      if (s === 'present') present++;
      else if (s === 'absent') absent++;
      else if (s === 'late') late++;
      else if (s === 'excused') excused++;
    }
    const marked = present + absent + late + excused;
    return { total: enrollments.length, present, absent, late, excused, unmarked: enrollments.length - marked, rate: marked > 0 ? Math.round(((present + late) / marked) * 100) : null };
  }, [currentAttendance, enrollments]);

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    setLocalEdits((prev) => ({ ...prev, [studentId]: status }));
  };

  const markRestPresent = () => {
    setLocalEdits((prev) => {
      const next = { ...prev };
      for (const e of enrollments) if (!currentAttendance[e.student.id]) next[e.student.id] = 'present';
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const promises = Object.entries(localEdits).map(([studentId, status]) =>
        api.post(`/attendance/course/${selectedCourse}`, {
          date: selectedDate,
          studentId,
          status: status.toUpperCase(),
        })
      );
      await Promise.all(promises);
      toast.success('Attendance records saved successfully.');
      setLocalEdits({});
      mutateCourseData();
    } catch {
      toast.error('Failed to save attendance');
    } finally {
      setIsSaving(false);
    }
  };

  const exportCsv = () => {
    const rows: (string | number)[][] = enrollments.map((e) => {
      const h = history(courseData?.summary?.[e.student.id]);
      return [e.student.name, e.student.email, currentAttendance[e.student.id] ?? 'not marked', h ? `${h.rate}%` : '', h ? h.total : 0];
    });
    if (!rows.length) return void toast.info('Nothing to export yet.');
    const cell = (v: unknown) => { const x = String(v ?? ''); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
    const csv = [['Student', 'Email', `Status ${selectedDate}`, 'Attendance rate (course)', 'Sessions recorded'], ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    Object.assign(document.createElement('a'), { href: url, download: `attendance-${course?.code ?? 'course'}-${selectedDate}.csv` }).click();
    URL.revokeObjectURL(url);
  };

  const hasUnsavedChanges = Object.keys(localEdits).length > 0;

  const tiles = [
    { label: 'Enrolled students', value: stats.total, icon: Users, cls: 'text-indigo-500 bg-indigo-500/10' },
    { label: 'Present', value: stats.present, icon: UserCheck, cls: 'text-emerald-500 bg-emerald-500/10' },
    { label: 'Absent', value: stats.absent, icon: UserX, cls: 'text-red-500 bg-red-500/10' },
    { label: 'Late', value: stats.late, icon: Clock, cls: 'text-amber-500 bg-amber-500/10' },
    { label: 'Not marked', value: stats.unmarked, icon: CircleDashed, cls: 'text-zinc-500 bg-zinc-500/10' },
    { label: 'Attendance rate', value: stats.rate === null ? '—' : `${stats.rate}%`, icon: CheckCircle2, cls: 'text-sky-500 bg-sky-500/10' },
  ];

  return (
    <>
      <Topbar title="Attendance Management" subtitle="Track and manage student presence across all courses" />

      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">

          {/* Filters & Actions Header */}
          <div className="flex flex-col md:flex-row justify-between items-stretch md:items-end gap-4 bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/50 p-4 sm:p-5 rounded-2xl">
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4 min-w-0">
              <div>
                <label htmlFor="att-date" className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-1 block">Date</label>
                <div className="flex items-center bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden focus-within:border-indigo-500 transition-colors">
                  <div className="pl-3 text-zinc-500"><Calendar className="w-4 h-4" /></div>
                  <input
                    id="att-date"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => {
                      setSelectedDate(e.target.value);
                      setLocalEdits({});
                    }}
                    className="bg-transparent border-none text-sm text-zinc-900 dark:text-white px-3 py-2 outline-none w-full sm:w-40 cursor-pointer"
                  />
                </div>
              </div>

              <div className="min-w-0">
                <label htmlFor="att-course" className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-1 block">Course</label>
                <div className="relative flex items-center bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden focus-within:border-indigo-500 transition-colors">
                  <div className="absolute left-3 text-zinc-500 pointer-events-none"><Filter className="w-4 h-4" /></div>
                  <select
                    id="att-course"
                    value={selectedCourse}
                    onChange={(e) => { setSelectedCourse(e.target.value); setLocalEdits({}); setQ(''); }}
                    className="w-full sm:w-72 pl-10 pr-8 py-2 bg-transparent text-sm text-zinc-900 dark:text-white outline-none appearance-none truncate"
                  >
                    {courses.length === 0 && <option value="">No courses yet</option>}
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>{c.code} - {c.name}{c.teacher ? ` (${c.teacher.name})` : ''}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 text-zinc-500 pointer-events-none"><ChevronDown className="w-4 h-4" /></div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <button
                onClick={exportCsv}
                className="flex-1 md:flex-none btn-secondary"
              >
                <Download className="w-4 h-4" /> Export CSV
              </button>

              <button
                onClick={handleSave}
                aria-busy={isSaving || undefined} disabled={!hasUnsavedChanges || isSaving}
                className="flex-1 md:flex-none btn-primary"
              >
                {isSaving ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>

          {course && (
            <div className="text-sm text-zinc-600 dark:text-zinc-400 flex flex-wrap gap-x-3 gap-y-1">
              <span>Teacher: <b className="text-zinc-900 dark:text-white">{course.teacher?.name ?? 'Unassigned'}</b></span>
              {course.teacher?.email && <a href={`mailto:${course.teacher.email}`} className="inline-flex items-center gap-1 text-indigo-500 break-all"><Mail className="w-3.5 h-3.5" />{course.teacher.email}</a>}
              <span>· {format(new Date(`${selectedDate}T00:00:00`), 'EEEE d MMMM yyyy')}</span>
            </div>
          )}

          {/* Stats Overview */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {tiles.map((t) => (
              <div key={t.label} className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/50 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className={cn('p-1.5 rounded-lg', t.cls)}><t.icon className="w-4 h-4" /></div>
                  <span className="text-zinc-600 dark:text-zinc-400 text-xs font-medium">{t.label}</span>
                </div>
                <span className="text-2xl font-bold text-zinc-900 dark:text-white">{t.value}</span>
              </div>
            ))}
          </div>

          {/* Roster */}
          <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/50 rounded-2xl overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-zinc-200 dark:border-zinc-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-indigo-500" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Class Roster</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">Mark attendance for {course?.code ?? 'a course'}{stats.unmarked > 0 ? ` · ${stats.unmarked} not marked yet` : ''}</p>
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search students" aria-label="Search students"
                    className="w-full pl-9 pr-8 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500" />
                  {q && <button onClick={() => setQ('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400"><X className="w-4 h-4" /></button>}
                </div>
                {stats.unmarked > 0 && (
                  <button onClick={markRestPresent} className="btn-secondary btn-sm whitespace-nowrap">Mark rest present</button>
                )}
              </div>
            </div>

            {!selectedCourse ? (
              <p className="p-10 text-center text-sm text-zinc-500">No courses yet. Attendance can be taken once a course exists.</p>
            ) : isLoading ? (
              <div className="p-6 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-xl skeleton" />)}</div>
            ) : enrollments.length === 0 ? (
              <p className="p-10 text-center text-sm text-zinc-500">No students are enrolled in this course yet.</p>
            ) : shown.length === 0 ? (
              <p className="p-10 text-center text-sm text-zinc-500">No students match “{q}”.</p>
            ) : (
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800/50">
                {shown.map((enrollment) => {
                  const student = enrollment.student;
                  const status = currentAttendance[student.id];
                  const h = history(courseData?.summary?.[student.id]);
                  return (
                    <li key={student.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 transition-colors">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-semibold text-sm shrink-0">
                          {student.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                            {student.name}
                            {localEdits[student.id] && <span className="ml-2 text-[10px] font-bold uppercase text-indigo-500">unsaved</span>}
                          </div>
                          <a href={`mailto:${student.email}`} className="block text-xs text-zinc-500 hover:text-indigo-500 truncate">{student.email}</a>
                          <div className="text-[11px] text-zinc-400">
                            Enrolled {format(new Date(enrollment.enrolledAt), 'd MMM yyyy')}
                            {' · '}
                            {h ? <span className={cn(h.rate < 75 && 'text-red-500')}>{h.rate}% attendance ({h.absent} absent, {h.late} late of {h.total})</span> : 'no attendance recorded yet'}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 sm:flex sm:justify-end gap-1.5">
                        {STATUS_BUTTONS.map((b) => (
                          <button
                            key={b.id}
                            onClick={() => handleStatusChange(student.id, b.id)}
                            aria-pressed={status === b.id}
                            className={cn('px-2 sm:px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors',
                              status === b.id ? b.on : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800')}
                          >
                            {b.label}
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {hasUnsavedChanges && (
              <div className="bg-indigo-500/10 border-t border-indigo-500/20 p-4 px-6 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">{Object.keys(localEdits).length} unsaved change{Object.keys(localEdits).length === 1 ? '' : 's'}.</span>
                <button onClick={handleSave} disabled={isSaving} className="btn-primary btn-sm">
                  Save Now
                </button>
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
