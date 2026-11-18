/* eslint-disable @typescript-eslint/no-explicit-any */
import { buildVersions, paperTotal, type SourceQuestion } from '@/lib/exam-paper';
import type { SampleDb } from './data';
import { stepsFor } from '@/lib/early-warning-steps';
import { lessonDates, mondayOf } from '@/lib/lesson-plan';
import { biggestDrop, funnelSteps } from '@/lib/trace-funnel';

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

/** GET /lesson-plans?courseId= (M293): two weekly classes and the first lessons planned. */
export function sampleLessonPlan(d: SampleDb) {
  const canEdit = d.me.role === 'TEACHER' || d.me.role === 'ADMIN';
  const slots = [{ id: 'sample-slot-mon', dayOfWeek: 0, startTime: '09:00', endTime: '10:30', type: 'LECTURE' }, { id: 'sample-slot-thu', dayOfWeek: 3, startTime: '14:00', endTime: '15:30', type: 'LAB' }];
  const monday = mondayOf(new Date().toISOString().slice(0, 10));
  const topics = ['Processes and the scheduler', 'Lab: writing a round-robin scheduler', 'Threads and shared memory', 'Lab: locks and races', 'Deadlock'];
  const lessons = lessonDates(slots, monday, 3).slice(0, topics.length).map((l, i) => ({
    day: l.day, slotId: l.slotId, topic: topics[i], goals: i === 0 ? 'Explain what a context switch costs.' : null, homework: i === 1 ? 'Finish the scheduler and time three workloads.' : null,
    materialIds: i === 0 ? ['sample-m-1'] : [], done: i === 0, inCalendar: true,
  }));
  return { canEdit, slots, materials: [{ id: 'sample-m-1', title: 'Week 1 slides' }, { id: 'sample-m-2', title: 'Scheduler starter code' }], modules: ['Processes', 'Threads', 'Memory', 'File systems'], lessons };
}

/** GET /revision-packs?courseId= (M294): one shared pack. */
export function sampleRevisionPacks(d: SampleDb) {
  const canEdit = d.me.role === 'TEACHER' || d.me.role === 'ADMIN';
  const pack = {
    overview: 'Operating systems share one machine between many programs. This pack covers how they schedule work, keep threads apart and manage memory.',
    topics: [
      { title: 'Processes and scheduling', summary: 'A process is a running program with its own memory. The scheduler decides which one runs next, trading fairness against how quickly jobs finish.', points: ['A context switch saves and restores registers', 'Round robin is fair; shortest job first finishes most jobs soonest', 'Long jobs can starve under shortest job first'], terms: [{ term: 'Quantum', meaning: 'How long a process runs before the scheduler may switch.' }] },
      { title: 'Threads and locks', summary: 'Threads share their process’s memory, so two can change the same value at once. Locks make one wait for the other.', points: ['A race gives different results each run', 'Deadlock needs four conditions; breaking one prevents it'], terms: [{ term: 'Mutex', meaning: 'A lock only one thread can hold at a time.' }] },
    ],
    questions: [
      { q: 'Why can shortest job first starve a long job?', a: 'If short jobs keep arriving, the scheduler always picks one of them first, so the long job never reaches the front.', topic: 'Processes and scheduling' },
      { q: 'Name the four conditions for deadlock.', a: 'Mutual exclusion, hold and wait, no preemption and circular wait.', topic: 'Threads and locks' },
    ],
    checklist: ['I can explain a context switch', 'I can compare two scheduling algorithms', 'I can spot a race in a short program'],
  };
  return { canEdit, sources: canEdit ? [{ id: 'sample-src-1', title: 'Week 1 slides', kind: 'material', chars: 9200 }] : [], packs: [{ id: 'sample-pack', title: 'Midterm revision', pack, sources: ['Week 1 slides', 'Week 2 slides'], usedAi: true, published: true, createdAt: new Date().toISOString() }] };
}

/** GET /office-slots (M295): a teacher's coming times, or a student's teachers' times (one booked, one waited for). */
export function sampleOfficeSlots(d: SampleDb) {
  const at = (days: number, h: number, m = 0) => { const t = new Date(); t.setDate(t.getDate() + days); t.setHours(h, m, 0, 0); return t.toISOString(); };
  if (d.me.role === 'TEACHER' || d.me.role === 'ADMIN') {
    const names = (d.classmates as any[]).map((s) => s.name);
    return { role: 'teacher', lengths: [10, 15, 20, 30, 45, 60], slots: [0, 15, 30, 45].map((m, i) => ({ id: `sample-os-${i}`, startAt: at(1, 14, m), durationMin: 15, mode: 'VIDEO', location: null, topic: i === 0 ? 'Problem set 3' : null, student: i < 2 ? names[i] : null, waiting: i === 0 ? 2 : 0 })) };
  }
  return {
    role: 'student',
    teachers: [{ id: 'sample-u-meera', name: 'Dr. Meera Iyer', courses: ['CS301'], slots: [0, 15, 30, 45].map((m, i) => ({ id: `sample-os-${i}`, startAt: at(1, 14, m), durationMin: 15, mode: 'VIDEO', location: null, mine: i === 1, taken: i === 0 || i === 2, topic: i === 1 ? 'Threads lab' : null, waiting: i === 0 ? 1 : 0, place: i === 0 ? 1 : null, callId: 'o_sample' })) }],
  };
}

/** GET /portfolio (M296): two pieces of work and one private link. */
export function samplePortfolio() {
  return {
    work: [
      { id: 'sample-pf-1', kind: 'WORK', title: 'A round-robin scheduler in C', body: 'I wrote the scheduler for the OS lab and measured how the quantum changes waiting time.', url: null, course: 'CS301', grade: '18/20' },
      { id: 'sample-pf-2', kind: 'PROJECT', title: 'Campus food-waste tracker', body: 'With three classmates we logged what the canteen threw away for a month.', url: 'https://example.org/food-waste', course: null, grade: null },
    ],
    shares: [{ token: 'sample-share-token-123456', label: 'Internship at Acme', url: '/passport/sample-share-token-123456', expiresAt: new Date(Date.now() + 20 * 86_400_000).toISOString(), expired: false, views: 3, createdAt: new Date().toISOString() }],
    handIns: [{ id: 'sample-sub-1', title: 'Threads and locks report', course: 'CS301', grade: '16/20' }],
    shareDays: [7, 30, 90, 180],
  };
}

/** GET /course-announcements/:courseId/:id/readers (M299): most of the class has seen it. */
export function sampleReaders(d: SampleDb) {
  const people = (d.classmates as any[]).map((s, i) => ({ id: s.id, name: s.name, seenAt: i < 3 ? new Date(Date.now() - i * 3600_000).toISOString() : null, ackAt: i < 2 ? new Date(Date.now() - i * 3600_000).toISOString() : null }));
  return { needsAck: true, remindedAt: null, canRemind: true, people };
}

/** GET /parent-week (M300): a made-up week of schoolwork. */
export function sampleParentWeek(q: URLSearchParams) {
  const thisWeek = mondayOf(new Date().toISOString().slice(0, 10));
  const week = mondayOf(q.get('week') || thisWeek);
  const day = (n: number) => new Date(Date.parse(`${week}T12:00:00Z`) + n * 86_400_000).toISOString();
  const prev = new Date(Date.parse(`${week}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
  const next = week < thisWeek ? new Date(Date.parse(`${week}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10) : null;
  return {
    week, thisWeek, previous: prev, next,
    summary: { grades: 2, attendance: 88, handedIn: 3, missed: 1 },
    grades: [{ course: 'CS301', title: 'Threads lab', score: 17, maxScore: 20 }, { course: 'ENV210', title: 'Policy brief', score: 72, maxScore: 100 }],
    attendance: [0, 1, 2, 3].map((n) => ({ course: n % 2 ? 'ENV210' : 'CS301', day: day(n).slice(0, 10), status: n === 2 ? 'ABSENT' : 'PRESENT' })),
    handedIn: [{ course: 'CS301', title: 'Threads lab', at: day(1) }, { course: 'CS220', title: 'Quiz: trees', at: day(2) }, { course: 'ENV210', title: 'Reading notes', at: day(3) }],
    missed: [{ course: 'CS220', title: 'Hash tables worksheet', kind: 'assignment', due: day(3) }],
    nextWeek: [{ course: 'CS301', title: 'Midterm (paper)', kind: 'quiz', due: day(9), done: false }],
    announcements: [{ course: 'CS301', title: 'Midterm next Tuesday' }],
  };
}

/** GET /trace/funnel (M307): a made-up brand's funnel. */
export function sampleFunnel(q: URLSearchParams) {
  const days = Number(q.get('days')) || 90, k = days / 90;
  const c = (n: number) => Math.round(n * k);
  const steps = funnelSteps({ scanned: c(1840), sold: c(1290), owned: c(410), warranted: c(330), reviewed: c(96) });
  const products = [{ id: 'sample-p-1', name: 'Trail runner' }, { id: 'sample-p-2', name: 'Canvas tote' }, { id: 'sample-p-3', name: 'Water bottle' }];
  return {
    days, product: q.get('product'), products, steps, drop: biggestDrop(steps)?.key ?? null,
    byProduct: products.map((p, i) => ({ productId: p.id, name: p.name, steps: funnelSteps({ scanned: c(900 - i * 250), sold: c(640 - i * 180), owned: c(220 - i * 70), warranted: c(180 - i * 60), reviewed: c(50 - i * 15) }) })),
  };
}

/** GET /trace/watch (M308): a brand watching two countries. */
export const sampleWatch = () => ({ watch: { countries: ['IN', 'NG'], threshold: 3, anywhere: true }, thresholds: [1, 3, 5, 10, 25], recent: [{ area: 'c:IN', at: new Date(Date.now() - 5 * 3600_000).toISOString() }] });

/** GET /trace/claims and /trace/claims/mine (M309): one claim in review. */
export function sampleClaims(mine: boolean) {
  const at = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
  const claim = { id: 'sample-claim', code: 'sample-code', issue: 'The zip came apart after three weeks of normal use.', photoUrl: null, status: 'REVIEWING', createdAt: at(30), product: 'Trail runner', timeline: [{ at: at(30), status: 'OPEN', note: null, by: 'owner' }, { at: at(4), status: 'REVIEWING', note: 'Thanks, we’re looking at the photos.', by: 'brand' }] };
  return mine ? { claims: [claim] } : { claims: [{ ...claim, owner: 'Maya', warrantyEnds: new Date(Date.now() + 300 * 86_400_000).toISOString(), next: ['APPROVED', 'REFUSED'] }], open: 1 };
}

/** GET /trace/shop-guide (M310): a shop halfway set up. */
export const sampleShopGuide = () => ({ shop: true, brands: 1, stops: 2, sales: 0, points: 0, tier: { label: 'Bronze', sales: 0, next: { label: 'Silver', need: 20 } } });
