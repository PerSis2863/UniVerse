'use client';
import { errorMessage } from '@/lib/api';
import { confirmDialog } from '@/components/ui/Dialogs';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { ChevronRight, Download, GraduationCap, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';
import { api, fetcher } from '@/lib/fetcher';
import { cn } from '@/lib/utils';

type Student = { id: string; name: string; email: string };
type Grade = { id: string; studentId: string; assignmentName: string; score: number; maxScore: number; feedback: string | null; gradedAt: string };
type Gradebook = { enrollments: { student: Student }[]; grades: Grade[] };


function band(avg: number | null) {
  if (avg == null) return { label: 'Not graded', cls: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20' };
  if (avg >= 90) return { label: 'Excellent', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' };
  if (avg >= 75) return { label: 'Good', cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' };
  if (avg >= 60) return { label: 'Average', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' };
  return { label: 'Needs support', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' };
}

export default function TeacherGradesPage() {
  const { data: coursesData, isLoading: loadingCourses } = useSWR<{ id: string; name: string; code: string }[]>('/courses/my', fetcher);
  const courses = Array.isArray(coursesData) ? coursesData : [];
  const [pickedId, setCourseId] = useState('');
  const courseId = pickedId || courses[0]?.id || ''; // the picked course, or the first
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState<{ studentId: string; assignmentName: string; score: string; maxScore: string; feedback: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);

  const { data, isLoading, error, mutate } = useSWR<Gradebook>(courseId ? `/grades/course/${courseId}` : null, fetcher);

  const rows = useMemo(() => {
    const grades = data?.grades ?? [];
    return (data?.enrollments ?? []).map(({ student }) => {
      const mine = grades.filter((g) => g.studentId === student.id);
      const avg = mine.length ? Math.round(mine.reduce((s, g) => s + (g.maxScore ? g.score / g.maxScore : 0), 0) / mine.length * 100) : null;
      return { ...student, grades: mine, avg, latest: mine[0] ?? null };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);
  const filtered = rows.filter((r) => `${r.name} ${r.email}`.toLowerCase().includes(search.toLowerCase()));
  const selected = rows.find((r) => r.id === detail) ?? null;

  const saveGrade = async () => {
    if (!adding) return;
    setBusy(true);
    try {
      await api.post(`/grades/course/${courseId}`, { ...adding, score: Number(adding.score), maxScore: Number(adding.maxScore) || 100 });
      await mutate();
      toast.success('Grade saved', { description: 'The student can see it on their Grades page.' });
      setAdding((a) => a && { ...a, studentId: '', score: '', feedback: '' }); // keep the assessment name for quick entry
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save the grade'));
    } finally { setBusy(false); }
  };

  const removeGrade = async (g: Grade) => {
    if (!(await confirmDialog({ title: `Delete "${g.assignmentName}"?`, message: `${g.score}/${g.maxScore} will be removed from the student’s record.`, destructive: true }))) return;
    try { await api.delete(`/grades/${g.id}`); await mutate(); toast.success('Grade deleted'); } catch (e) { toast.error(errorMessage(e, 'Could not delete')); }
  };

  const exportCsv = () => {
    const all = rows.flatMap((r) => r.grades.map((g) => [r.name, r.email, g.assignmentName, g.score, g.maxScore, Math.round((g.score / g.maxScore) * 100), new Date(g.gradedAt).toISOString().slice(0, 10), g.feedback ?? '']));
    if (!all.length) return void toast.info('Nothing to export yet.');
    const cell = (v: unknown) => { const x = String(v ?? ''); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
    const csv = [['Student', 'Email', 'Assessment', 'Score', 'Max', 'Percent', 'Date', 'Feedback'], ...all].map((r) => r.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const code = courses.find((c) => c.id === courseId)?.code ?? 'course';
    Object.assign(document.createElement('a'), { href: url, download: `${code}-grades-${new Date().toISOString().slice(0, 10)}.csv` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!loadingCourses && courses.length === 0) {
    return (
      <>
        <Topbar title="Grade Book" subtitle="Record and review student results" />
        <div className="flex-1 p-4 md:p-8 overflow-y-auto">
          <FeatureGuide icon={GraduationCap} title="Your gradebook will appear here"
            description="Once a course is assigned to you, you can record marks for each student here. Students see them instantly on their Grades page."
            steps={['Ask your campus admin to assign you a course', 'Pick the course and click “Add grade”', 'Export the gradebook as CSV any time']}
            example={<div><ExampleRow title="Aarav Shah" meta="3 graded items · latest: Midterm 42/50" right="84%" /><ExampleRow title="Meera Iyer" meta="3 graded items · latest: Lab 2 18/20" right="91%" accent="from-emerald-500 to-teal-500" /></div>}
            action={{ label: 'Go to my courses', href: '/teacher/courses' }} />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Grade Book" subtitle="Record and review student results" />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto space-y-5">
        <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between">
          <select aria-label="Course" className={cn('input', 'md:w-80')} value={courseId} onChange={(e) => { setCourseId(e.target.value); setAdding(null); }}>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
          <div className="flex gap-2">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input className={cn('input', 'pl-9')} placeholder="Search students…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <button onClick={exportCsv} className="btn-secondary text-sm px-3 flex items-center gap-1.5"><Download className="w-4 h-4" /> <span className="hidden sm:inline">Export</span></button>
            <button onClick={() => setAdding({ studentId: '', assignmentName: '', score: '', maxScore: '100', feedback: '' })} disabled={!rows.length} className="btn-primary text-sm px-3 flex items-center gap-1.5 disabled:opacity-50"><Plus className="w-4 h-4" /> Add grade</button>
          </div>
        </div>

        {adding && (
          <div className={`panel p-5 space-y-3`}>
            <div className="flex items-center justify-between"><p className="font-semibold text-zinc-900 dark:text-white">Record a grade</p><button onClick={() => setAdding(null)} aria-label="Close" className="p-1 text-zinc-500"><X className="w-4 h-4" /></button></div>
            <div className="grid sm:grid-cols-2 gap-3">
              <select aria-label="Student" className="input" value={adding.studentId} onChange={(e) => setAdding({ ...adding, studentId: e.target.value })}>
                <option value="">Choose a student…</option>
                {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <input className="input" placeholder="Assessment, e.g. Midterm exam" maxLength={200} value={adding.assignmentName} onChange={(e) => setAdding({ ...adding, assignmentName: e.target.value })} />
              <div className="flex items-center gap-2">
                <input className="input" type="number" min={0} step="0.5" placeholder="Score" value={adding.score} onChange={(e) => setAdding({ ...adding, score: e.target.value })} />
                <span className="text-zinc-400">/</span>
                <input className="input" type="number" min={1} step="1" placeholder="Out of" value={adding.maxScore} onChange={(e) => setAdding({ ...adding, maxScore: e.target.value })} />
              </div>
              <input className="input" placeholder="Feedback for the student (optional)" maxLength={2000} value={adding.feedback} onChange={(e) => setAdding({ ...adding, feedback: e.target.value })} />
            </div>
            <button onClick={saveGrade} disabled={busy || !adding.studentId || !adding.assignmentName.trim() || adding.score === ''} className="btn-primary">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save grade</button>
          </div>
        )}

        {error ? <p className="text-sm text-rose-500">{errorMessage(error, 'Could not load grades.')}</p>
          : isLoading || loadingCourses ? <div className="h-64 rounded-2xl skeleton" />
          : rows.length === 0 ? <div className={`panel p-10 text-center text-sm text-zinc-500`}>No students are enrolled in this course yet. Ask your campus admin to enroll them.</div>
          : (
            <div className={`panel overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead><tr className="border-b border-zinc-200/70 dark:border-white/[0.06] text-xs uppercase tracking-wider text-zinc-500">
                    <th className="p-4 font-bold">Student</th><th className="p-4 font-bold text-center hidden sm:table-cell">Graded</th><th className="p-4 font-bold hidden md:table-cell">Latest</th><th className="p-4 font-bold text-center">Average</th><th className="p-4 font-bold">Status</th><th className="p-4" />
                  </tr></thead>
                  <tbody className="divide-y divide-zinc-200/70 dark:divide-white/[0.05]">
                    {filtered.map((r) => {
                      const b = band(r.avg);
                      return (
                        <tr key={r.id} onClick={() => setDetail(r.id)} className="hover:bg-zinc-50 dark:hover:bg-white/[0.02] cursor-pointer">
                          <td className="p-4"><p className="text-sm font-medium text-zinc-900 dark:text-white">{r.name}</p><p className="text-xs text-zinc-500">{r.email}</p></td>
                          <td className="p-4 text-center text-sm text-zinc-600 dark:text-zinc-300 hidden sm:table-cell">{r.grades.length}</td>
                          <td className="p-4 text-sm text-zinc-600 dark:text-zinc-300 hidden md:table-cell">{r.latest ? `${r.latest.assignmentName} · ${r.latest.score}/${r.latest.maxScore}` : '—'}</td>
                          <td className="p-4 text-center text-lg font-bold text-zinc-900 dark:text-white">{r.avg != null ? `${r.avg}%` : '—'}</td>
                          <td className="p-4"><span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-medium border ${b.cls}`}>{b.label}</span></td>
                          <td className="p-4 text-right"><ChevronRight className="w-4 h-4 text-zinc-400 inline" /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filtered.length === 0 && <p className="p-8 text-center text-sm text-zinc-500">No students match your search.</p>}
            </div>
          )}
      </div>

      {selected && (
        <div className="backdrop-in fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6" onClick={(e) => e.target === e.currentTarget && setDetail(null)}>
          <div className="sheet-in w-full sm:max-w-xl max-h-[90dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl glass-sidebar border border-zinc-200 dark:border-white/10 shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between gap-3 px-6 py-4 border-b border-zinc-200/70 dark:border-white/[0.07] bg-white/70 dark:bg-[#121830]/80 backdrop-blur-xl">
              <div className="min-w-0"><h3 className="font-bold text-zinc-900 dark:text-white truncate">{selected.name}</h3><p className="text-xs text-zinc-500">{selected.email} · average {selected.avg != null ? `${selected.avg}%` : '—'}</p></div>
              <button onClick={() => setDetail(null)} aria-label="Close" className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-300"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-2">
              {selected.grades.length === 0 && <p className="text-sm text-zinc-500">No grades recorded for this student yet.</p>}
              {selected.grades.map((g) => {
                const p = Math.round((g.score / g.maxScore) * 100);
                return (
                  <div key={g.id} className="p-4 rounded-2xl border border-zinc-200/70 dark:border-white/[0.07] flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">{g.assignmentName}</p>
                      <p className="text-xs text-zinc-500">{g.score}/{g.maxScore} ({p}%) · {new Date(g.gradedAt).toLocaleDateString()}</p>
                      {g.feedback && <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 italic">“{g.feedback}”</p>}
                    </div>
                    <button onClick={() => removeGrade(g)} aria-label="Delete grade" className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button>
                  </div>
                );
              })}
              <button onClick={() => { setAdding({ studentId: selected.id, assignmentName: '', score: '', maxScore: '100', feedback: '' }); setDetail(null); }} className="btn-primary w-full mt-2"><Plus className="w-4 h-4" /> Add a grade for {selected.name.split(' ')[0]}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
