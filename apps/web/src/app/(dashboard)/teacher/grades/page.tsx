'use client';
import { errorMessage } from '@/lib/api';
import { confirmDialog } from '@/components/ui/Dialogs';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { ChevronRight, Download, FileSpreadsheet, GraduationCap, Layers, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { authedJson } from '@/lib/authed-fetch';
import { finalGrade, letter, type Category } from '@/lib/gradebook';
import { Topbar } from '@/components/layout/Topbar';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';
import { api, fetcher } from '@/lib/fetcher';
import { cn } from '@/lib/utils';

type Student = { id: string; name: string; email: string };
type Grade = { id: string; studentId: string; assignmentName: string; score: number; maxScore: number; feedback: string | null; gradedAt: string };
type Gradebook = { enrollments: { student: Student }[]; grades: Grade[] };
type CategoryView = { categories: Category[]; assessments: { name: string; categoryId: string }[] };


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
  // Categories and weights (Stage 5 · B3.4): the final grade is their weighted average.
  const catKey = courseId ? `/api/courses/${courseId}/grade-categories` : null;
  const { data: cats, mutate: mutateCats } = useSWR<CategoryView>(catKey, authedJson);
  const [editingCats, setEditingCats] = useState(false);

  const rows = useMemo(() => {
    const grades = data?.grades ?? [];
    const categories = cats?.categories ?? [];
    const of = new Map((cats?.assessments ?? []).map((a) => [a.name, a.categoryId]));
    return (data?.enrollments ?? []).map(({ student }) => {
      const mine = grades.filter((g) => g.studentId === student.id);
      const r = finalGrade(mine.map((g) => ({ assessment: g.assignmentName, score: g.score, maxScore: g.maxScore })), categories, (a) => of.get(a) ?? null);
      const avg = r.final == null ? null : Math.round(r.final);
      return { ...student, grades: mine, avg, letter: letter(r.final)?.letter ?? null, byCategory: r.byCategory, latest: mine[0] ?? null };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [data, cats]);
  const assessments = useMemo(() => [...new Set((data?.grades ?? []).map((g) => g.assignmentName))].sort((a, b) => a.localeCompare(b)), [data]);
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

  // One row per student: each category's average, the final grade and its letter.
  const exportSummary = () => {
    if (!rows.length) return void toast.info('Nothing to export yet.');
    const categories = cats?.categories ?? [];
    const cell = (v: unknown) => { const x = String(v ?? ''); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
    const head = ['Student', 'Email', ...categories.map((c) => `${c.name} (${c.weight}%)`), 'Final %', 'Letter', 'Grades'];
    const body = rows.map((r) => [r.name, r.email, ...categories.map((c) => { const x = r.byCategory.find((b) => b.id === c.id)?.average; return x == null ? '' : Math.round(x); }), r.avg ?? '', r.letter ?? '', r.grades.length]);
    const url = URL.createObjectURL(new Blob(['\ufeff' + [head, ...body].map((x) => x.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const code = courses.find((c) => c.id === courseId)?.code ?? 'course';
    Object.assign(document.createElement('a'), { href: url, download: `${code}-final-grades-${new Date().toISOString().slice(0, 10)}.csv` }).click();
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
            <button onClick={() => setEditingCats(true)} disabled={!courseId} className="btn-secondary text-sm px-3 flex items-center gap-1.5" aria-label="Categories and weights"><Layers className="w-4 h-4" /> <span className="hidden lg:inline">Categories</span></button>
            <button onClick={exportSummary} className="btn-secondary text-sm px-3 flex items-center gap-1.5" aria-label="Export final grades"><FileSpreadsheet className="w-4 h-4" /> <span className="hidden lg:inline">Final grades</span></button>
            <button onClick={exportCsv} className="btn-secondary text-sm px-3 flex items-center gap-1.5" aria-label="Export every grade"><Download className="w-4 h-4" /> <span className="hidden lg:inline">All grades</span></button>
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
              <div className="overflow-x-auto" role="region" aria-label="Gradebook" tabIndex={0}>
                <table className="w-full text-left">
                  <thead><tr className="border-b border-zinc-200/70 dark:border-white/[0.06] text-xs uppercase tracking-wider text-zinc-500">
                    <th className="p-4 font-bold">Student</th><th className="p-4 font-bold text-center hidden sm:table-cell">Graded</th><th className="p-4 font-bold hidden md:table-cell">Latest</th><th className="p-4 font-bold text-center">{cats?.categories.length ? 'Final' : 'Average'}</th><th className="p-4 font-bold">Status</th><th className="p-4" />
                  </tr></thead>
                  <tbody className="divide-y divide-zinc-200/70 dark:divide-white/[0.05]">
                    {filtered.map((r) => {
                      const b = band(r.avg);
                      return (
                        <tr key={r.id} onClick={() => setDetail(r.id)} className="hover:bg-zinc-50 dark:hover:bg-white/[0.02] cursor-pointer">
                          <td className="p-4"><p className="text-sm font-medium text-zinc-900 dark:text-white">{r.name}</p><p className="text-xs text-zinc-500">{r.email}</p></td>
                          <td className="p-4 text-center text-sm text-zinc-600 dark:text-zinc-300 hidden sm:table-cell">{r.grades.length}</td>
                          <td className="p-4 text-sm text-zinc-600 dark:text-zinc-300 hidden md:table-cell">{r.latest ? `${r.latest.assignmentName} · ${r.latest.score}/${r.latest.maxScore}` : '—'}</td>
                          <td className="p-4 text-center text-lg font-bold text-zinc-900 dark:text-white">{r.avg != null ? <>{r.avg}%{r.letter && <span className="ml-1.5 text-sm font-semibold text-zinc-500">{r.letter}</span>}</> : '—'}</td>
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
              <div className="min-w-0"><h3 className="font-bold text-zinc-900 dark:text-white truncate">{selected.name}</h3><p className="text-xs text-zinc-500">{selected.email} · {cats?.categories.length ? 'final' : 'average'} {selected.avg != null ? `${selected.avg}%${selected.letter ? ` (${selected.letter})` : ''}` : '—'}</p></div>
              <button onClick={() => setDetail(null)} aria-label="Close" className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-300"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-2">
              {selected.byCategory.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
                  {selected.byCategory.map((c) => (
                    <div key={c.id || 'other'} className="rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] p-3">
                      <p className="text-[11px] text-zinc-500 truncate">{c.name} · {c.weight}%</p>
                      <p className="font-bold text-zinc-900 dark:text-white">{c.average == null ? '—' : `${Math.round(c.average)}%`}</p>
                      {c.dropped > 0 && <p className="text-[11px] text-zinc-500">lowest {c.dropped} dropped</p>}
                    </div>
                  ))}
                </div>
              )}
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

      {editingCats && catKey && (
        <CategoriesSheet catKey={catKey} view={cats ?? { categories: [], assessments: [] }} assessments={assessments} onChanged={(v) => void mutateCats(v, { revalidate: false })} onClose={() => setEditingCats(false)} />
      )}
    </>
  );
}

/** Categories, their weights and lowest-grade drops, and which category each assessment is in. */
function CategoriesSheet({ catKey, view, assessments, onChanged, onClose }: { catKey: string; view: CategoryView; assessments: string[]; onChanged: (v: CategoryView) => void; onClose: () => void }) {
  const [draft, setDraft] = useState({ name: '', weight: '', dropLowest: '0' });
  const [busy, setBusy] = useState(false);
  const total = view.categories.reduce((s, c) => s + c.weight, 0);
  const of = new Map(view.assessments.map((a) => [a.name, a.categoryId]));
  const send = async (body: object) => {
    setBusy(true);
    try { onChanged(await authedJson<CategoryView>(catKey, { method: 'POST', body: JSON.stringify(body) })); return true; }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t save that.')); return false; }
    finally { setBusy(false); }
  };
  return (
    <Sheet title="Categories and weights" onClose={onClose}>
      <div className="space-y-5">
        <p className="text-sm text-zinc-500">The final grade is each category’s average times its weight. You can drop each student’s lowest grades in a category. Without categories, the final grade is the plain average.</p>
        {view.categories.length > 0 && (
          <ul className="space-y-2">
            {view.categories.map((c) => (
              <li key={c.id} className="rounded-2xl border border-zinc-200/70 dark:border-white/[0.07] p-3 grid grid-cols-[1fr_5rem_5rem_auto] gap-2 items-end">
                <label className="text-[11px] text-zinc-500">Name<input className="input mt-1" defaultValue={c.name} maxLength={60} onBlur={(e) => e.target.value.trim() !== c.name && void send({ action: 'update', categoryId: c.id, name: e.target.value })} /></label>
                <label className="text-[11px] text-zinc-500">Weight %<input className="input mt-1" type="number" min={0} max={100} defaultValue={c.weight} onBlur={(e) => Number(e.target.value) !== c.weight && void send({ action: 'update', categoryId: c.id, weight: Number(e.target.value) })} /></label>
                <label className="text-[11px] text-zinc-500">Drop lowest<input className="input mt-1" type="number" min={0} max={10} defaultValue={c.dropLowest} onBlur={(e) => Number(e.target.value) !== c.dropLowest && void send({ action: 'update', categoryId: c.id, dropLowest: Number(e.target.value) })} /></label>
                <button type="button" aria-label={`Delete ${c.name}`} disabled={busy} onClick={() => void (async () => { if (await confirmDialog({ title: `Delete “${c.name}”?`, message: 'Its assessments go back to no category. Grades stay.', destructive: true, confirmLabel: 'Delete' })) void send({ action: 'delete', categoryId: c.id }); })()} className="btn-ghost btn-icon text-rose-600 dark:text-rose-400"><Trash2 className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
        )}
        <p className={cn('text-sm font-medium', view.categories.length && total !== 100 ? 'text-amber-700 dark:text-amber-300' : 'text-zinc-600 dark:text-zinc-300')}>
          {!view.categories.length ? 'No categories yet.' : total === 100 ? 'Weights add up to 100%.' : total < 100 ? `Weights add up to ${total}%: grades in no category share the other ${Math.round((100 - total) * 10) / 10}%.` : `Weights add up to ${total}%: they’re scaled to 100%.`}
        </p>
        <div className="rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] p-3 grid grid-cols-[1fr_5rem_5rem_auto] gap-2 items-end">
          <label className="text-[11px] text-zinc-500">New category<input className="input mt-1" placeholder="e.g. Homework" maxLength={60} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className="text-[11px] text-zinc-500">Weight %<input className="input mt-1" type="number" min={0} max={100} value={draft.weight} onChange={(e) => setDraft({ ...draft, weight: e.target.value })} /></label>
          <label className="text-[11px] text-zinc-500">Drop lowest<input className="input mt-1" type="number" min={0} max={10} value={draft.dropLowest} onChange={(e) => setDraft({ ...draft, dropLowest: e.target.value })} /></label>
          <button type="button" aria-label="Add category" disabled={busy || !draft.name.trim() || draft.weight === ''} onClick={() => void (async () => { if (await send({ action: 'create', name: draft.name, weight: Number(draft.weight), dropLowest: Number(draft.dropLowest) || 0 })) setDraft({ name: '', weight: '', dropLowest: '0' }); })()} className="btn-primary btn-icon"><Plus className="w-4 h-4" /></button>
        </div>
        {view.categories.length > 0 && assessments.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-white mb-2">Assessments</h4>
            <ul className="space-y-1.5">
              {assessments.map((a) => (
                <li key={a} className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 truncate text-sm text-zinc-800 dark:text-zinc-200">{a}</span>
                  <select aria-label={`Category for ${a}`} className="input w-40" value={of.get(a) ?? ''} disabled={busy} onChange={(e) => void send({ action: 'assign', name: a, categoryId: e.target.value || null })}>
                    <option value="">No category</option>
                    {view.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}
