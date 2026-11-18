/* eslint-disable @typescript-eslint/no-explicit-any */
import { buildVersions, paperTotal, type SourceQuestion } from '@/lib/exam-paper';
import type { SampleDb } from './data';
import { stepsFor } from '@/lib/early-warning-steps';

// Sample answers for the features of M291 onwards (made up), so "Explore with sample data" shows them filled.

const PAPER_QS: SourceQuestion[] = [
  { id: 's1', question: 'Which scheduling algorithm can starve long jobs?', type: 'CHOICE', options: ['Round robin', 'Shortest job first', 'First come, first served', 'Fair share'], correctAnswer: 'Shortest job first', points: 2 },
  { id: 's2', question: 'A process and a thread share the same address space.', type: 'TRUE_FALSE', options: ['True', 'False'], correctAnswer: 'False', points: 1 },
  { id: 's3', question: 'Which of these are page replacement policies?', type: 'MULTI', options: ['LRU', 'FIFO', 'TCP', 'Clock'], correctAnswer: '["LRU","FIFO","Clock"]', points: 3 },
  { id: 'w1', question: 'Explain how a deadlock can happen and one way to prevent it.', type: 'WRITTEN', options: [], correctAnswer: 'Four conditions (mutual exclusion, hold and wait, no preemption, circular wait); break one, e.g. order the locks.', points: 0, rubric: [{ name: 'The four conditions', points: 4 }, { name: 'A working prevention', points: 4 }, { name: 'Clear writing', points: 2 }] },
];
const versions = buildVersions(PAPER_QS, { versions: 2, shuffleOptions: true, seed: 'sample' });

export const samplePapers = () => ({ papers: [{ id: 'sample-paper', title: 'Midterm (paper)', versions: 2, questions: PAPER_QS.length, total: paperTotal(versions[0]), marked: 2, postedAt: null, createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString() }] });

export function samplePaper(d: SampleDb) {
  const students = d.classmates.map((s: any) => ({ id: s.id, name: s.name }));
  return {
    paper: { id: 'sample-paper', title: 'Midterm (paper)', course: 'Operating Systems', instructions: 'Answer every question. Show your working.', minutes: 60, versions, postedAt: null, total: paperTotal(versions[0]) },
    students,
    marks: students.slice(0, 2).map((s: any, i: number) => ({ studentId: s.id, version: i ? 'B' : 'A', marks: { w1: { rubric: [3, 3, 2] } }, score: 8 })),
  };
}

/** GET /api/early-warning (M292): two flagged classmates, one getting worse, with what to do. */
export function sampleEarlyWarning(d: SampleDb) {
  const [a, b] = d.classmates as any[];
  const course = { id: 'sample-c-os', code: 'CS301', name: 'Operating Systems' };
  const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  const flag = (s: any, score: number, level: string, reasons: { code: string; text: string }[], history: number[]) => ({
    id: `sample-flag-${s.id}`, score, level, status: 'OPEN', reasons, note: null, handledByName: null, handledAt: null, computedAt: day(0),
    student: { id: s.id, name: s.name, email: s.email ?? null, avatar: null, department: 'Computer Science', year: 2 }, course, plan: null,
    history: history.map((v, i) => ({ at: day((history.length - 1 - i) * 3), score: v })), steps: stepsFor(reasons),
  });
  const flags = [
    flag(a, 65, 'AT_RISK', [{ code: 'attendance', text: 'Missed 4 of 9 classes in the last 30 days' }, { code: 'grade-drop', text: 'Latest grades dropped from 78% to 52% on average' }], [30, 40, 50, 65]),
    flag(b, 35, 'WATCH', [{ code: 'quizzes', text: 'Didn’t hand in the quiz “Threads and locks”' }, { code: 'inactive', text: 'Hasn’t opened UniVerse in 15 days' }], [45, 40, 35]),
  ];
  return { flags, summary: { atRisk: 1, watch: 1, contacted: 0, resolved: 0 }, courses: [course] };
}
