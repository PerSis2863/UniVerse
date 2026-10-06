/* eslint-disable @typescript-eslint/no-explicit-any */
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth';
import { buildSampleDb, levelInfo, LEVELS, sid, at, type SampleDb } from './data';
import { sampleAsk, sampleMetric } from './analytics';
import { isMetricId } from '@/lib/school-metrics';

// Answers the app's API requests from example data while sample mode is on.
// GETs without a sample answer fall through to the real server (read-only);
// writes never reach the server — they update the in-memory sample data instead.

let db: SampleDb | null = null;
let dbKey = '';

function getDb(): SampleDb {
  const u = useAuthStore.getState().user;
  const me = { id: u?.id ?? 'sample-me', name: u?.name ?? 'You', email: u?.email ?? 'you@example.edu', role: u?.role ?? 'STUDENT' };
  const key = `${me.id}:${me.role}`;
  if (!db || key !== dbKey) { db = buildSampleDb(me); dbKey = key; }
  return db;
}
export function resetSampleDb() { db = null; }

/** Sample payments for pages that load transactions through a server action. */
export function sampleTransactions(onlyMine = false) {
  const d = getDb();
  return onlyMine ? d.transactions.filter((t) => t.user.id === d.people.aarav.id).map((t) => ({ ...t, user: { id: d.me.id, name: d.me.name, email: d.me.email } })) : d.transactions;
}

type Ctx = { db: SampleDb; m: RegExpMatchArray; q: URLSearchParams; body: any };
type Result = { status: number; data: any };
const ok = (data: any, status = 200): Result => ({ status, data });
const fail = (error: string, status = 400): Result => ({ status, data: { error, message: error } });

const pct = (s: number, m: number) => (m > 0 ? (s / m) * 100 : 0);
const course = (d: SampleDb, id: string) => d.courses.find((c) => c.id === id);
const counts = (d: SampleDb, id: string) => ({ materials: d.board[id]?.materials.length ?? 0, quizzes: d.quizzes.filter((x) => x.courseId === id).length });

/** A sample campus network (upgrade 9): three campuses, you at the first. */
function sampleNetwork() {
  const campus = (id: string, name: string, city: string, country: string, lat: number, lng: number, students: number, teachers: number, courses: number, shared: number, exchange: number) =>
    ({ id, name, city, country, logoUrl: null, lat, lng, students, teachers, courses, shared, exchange, domains: [`${name.split(' ')[0].toLowerCase()}.example.edu`] });
  return {
    campuses: [
      campus('sample-campus-1', 'Riverside University', 'Lyon', 'France', 45.76, 4.84, 1240, 86, 142, 3, 2),
      campus('sample-campus-2', 'Lakeside University', 'Geneva', 'Switzerland', 46.2, 6.14, 860, 61, 97, 5, 4),
      campus('sample-campus-3', 'Mountain Institute', 'Turin', 'Italy', 45.07, 7.69, 530, 38, 64, 2, 1),
    ],
    me: { campusId: 'sample-campus-1', campusName: 'Riverside University', networkVisible: false, exchange: null },
    unassigned: 12,
  };
}

function decorateMsg(d: SampleDb, m: any) {
  const out: any = { ...m, starred: d.starred.has(m.id), poll: null };
  if (m.type === 'POLL') {
    const votes = d.pollVotes[m.id] ?? {};
    const options: string[] = m.metadata?.options ?? [];
    out.poll = {
      counts: options.map((_, i) => Object.values(votes).filter((v) => v.includes(i)).length),
      mine: votes[d.me.id] ?? [],
      voters: Object.values(votes).filter((v) => v.length).length,
    };
  }
  return out;
}
const visible = (d: SampleDb, c: any) => c.messages.filter((m: any) => !d.hiddenMsgs.has(m.id));
function findMsg(d: SampleDb, id: string) {
  for (const c of d.conversations) { const m = c.messages.find((x: any) => x.id === id); if (m) return { c, m }; }
  return null;
}

function summary(d: SampleDb, c: any) {
  const msgs = visible(d, c);
  const last = msgs[msgs.length - 1];
  const other = c.members.find((x: any) => x.id !== d.me.id);
  return {
    id: c.id, isGroup: c.isGroup, isOfficial: c.isOfficial, title: c.title, avatarUrl: null,
    otherUserId: c.isGroup ? null : other?.id ?? null, online: !c.isGroup && !c.isOfficial && other?.id !== d.people.meera.id,
    lastSeenAt: at(0, 8), memberCount: c.members.length, typing: [],
    lastMessage: last ? { id: last.id, body: last.body.slice(0, 140), type: last.type, senderId: last.senderId, createdAt: last.createdAt, deletedAt: last.deletedAt, attachmentName: last.attachmentName, mine: last.senderId === d.me.id } : null,
    unread: Math.max(c.unread ?? (last && last.senderId !== d.me.id && c.id !== 'sample-conv-welcome' ? 1 : 0), c.prefs?.markedUnread ? 1 : 0),
    markedUnread: !!c.prefs?.markedUnread, pinned: !!c.prefs?.pinned, muted: !!c.prefs?.muted, archived: !!c.prefs?.archived,
    activityAt: last?.createdAt ?? at(-1),
  };
}

function groupOut(d: SampleDb, g: any) {
  return {
    id: g.id, name: g.name, description: g.description, category: g.category, isPublic: g.isPublic, createdAt: g.createdAt, avatarUrl: null, createdById: g.members[0].id,
    _count: { members: g.members.length, posts: d.groupPosts[g.id]?.length ?? 0 },
    members: g.members.slice(0, 4).map((u: any) => ({ user: { id: u.id, name: u.name, avatar: null } })),
  };
}

const quizOut = (d: SampleDb, qz: any, withAnswers: boolean) => ({
  id: qz.id, title: qz.title, description: qz.description, dueDate: qz.dueDate, timeLimit: qz.timeLimit, status: qz.status, courseId: qz.courseId, createdAt: at(-10),
  course: { name: course(d, qz.courseId)?.name },
  questions: qz.questions.map(({ correctAnswer, ...x }: any) => (withAnswers ? { ...x, correctAnswer } : x)),
});

// ── GET routes ─────────────────────────────────────────────────────────
const GET: [RegExp, (c: Ctx) => Result][] = [
  [/^\/courses\/my$/, ({ db: d }) => d.teacherView
    ? ok(d.taught.map((c) => ({ ...c, _count: { enrollments: d.classmates.length, ...counts(d, c.id) } })))
    : ok(d.courses.map((c, i) => ({ enrolledAt: at(-90 + i), course: { ...c, teacher: { id: c.teacher.id, name: c.teacher.name, avatar: null }, _count: counts(d, c.id) } })))],

  // Offline quizzes finished late, waiting for the teacher (Quizzes page): none in the sample
  [/^\/quizzes\/teacher\/offline-pending$/, () => ok([])],
  // Verified volunteering (upgrade 5): shifts, the impact map and the yearly report
  [/^\/api\/volunteer\/shifts$/, () => ok([
    { id: 'sample-sh1', title: 'Saturday tree planting', startAt: at(3, 9), endAt: at(3, 13), location: 'Riverside Park', lat: 12.9716, lng: 77.5946, radiusM: 200, capacity: 25, taken: 14, project: { id: 'sample-p1', name: 'Green City Drive', sdgNumber: 13, ngo: { name: 'Earth Collective' } }, mine: null },
    { id: 'sample-sh2', title: 'Reading club for kids', startAt: at(-5, 15), endAt: at(-5, 17), location: 'Community library', lat: 12.9352, lng: 77.6245, radiusM: 150, capacity: 10, taken: 8, project: { id: 'sample-p2', name: 'Read Together', sdgNumber: 4, ngo: { name: 'Bright Minds' } }, mine: { checkInAt: at(-5, 15), checkOutAt: at(-5, 17), minutes: 120, verified: true, method: 'QR' } },
  ])],
  [/^\/api\/volunteer\/report$/, () => ok({ year: new Date().getFullYear(), totals: { hours: 412.5, volunteers: 63, shifts: 28 },
    places: [{ lat: 12.9716, lng: 77.5946, label: 'Riverside Park', hours: 180, people: 31 }, { lat: 12.9352, lng: 77.6245, label: 'Community library', hours: 96, people: 14 }, { lat: 13.0358, lng: 77.597, label: 'Shelter kitchen', hours: 136.5, people: 22 }],
    projects: [{ name: 'Green City Drive', ngo: 'Earth Collective', sdg: 13, hours: 180, people: 31 }, { name: 'Shelter kitchen', ngo: 'Food For All', sdg: 2, hours: 136.5, people: 22 }, { name: 'Read Together', ngo: 'Bright Minds', sdg: 4, hours: 96, people: 14 }],
    sdgs: [{ sdg: 2, hours: 136.5 }, { sdg: 4, hours: 96 }, { sdg: 13, hours: 180 }] })],
  [/^\/api\/volunteer\/shifts\/[^/]+\/roster$/, ({ db: d }) => ok({ people: d.classmates.slice(0, 3).map((u, i) => ({ id: `sample-c${i}`, checkInAt: i ? null : at(-5, 15), checkOutAt: i ? null : at(-5, 17), method: i ? null : 'QR', minutes: i ? 0 : 120, verified: !i, student: { id: u.id, name: u.name, email: u.email ?? `${u.id}@example.edu` } })) })],
  [/^\/api\/volunteer\/projects$/, () => ok([{ id: 'sample-p1', name: 'Green City Drive', ngo: { name: 'Earth Collective' } }])],
  // Campus super-app (upgrade 7): events with RSVPs, room status, lost & found
  [/^\/api\/campus\/events$/, ({ db: d }) => ok(d.campusItems.filter((c) => c.kind === 'EVENT').map((c, i) => ({ ...c, capacity: (c as { capacity?: number }).capacity ?? null, going: 34 + i * 11, waiting: 0, mine: i === 0 && !d.teacherView ? { status: 'GOING', checkedInAt: null } : null })))],
  [/^\/api\/campus\/events\/[^/]+\/attendees$/, ({ db: d }) => ok({ item: { id: 'sample', title: 'Event', capacity: null }, people: d.classmates.slice(0, 4).map((u, i) => ({ id: `sample-r${i}`, status: 'GOING', checkedInAt: i < 2 ? at(0, 18, i * 5) : null, createdAt: at(-2), user: { id: u.id, name: u.name, email: u.email ?? `${u.id}@example.edu` } })) })],
  [/^\/api\/campus\/events\/[^/]+\/code$/, () => ok({ code: 'e1.sample.0.sample-sample-sample-sa', expiresIn: 30 })],
  [/^\/api\/campus\/rooms$/, () => ok({})],
  [/^\/api\/campus\/lost-found$/, ({ db: d, q }) => ok([
    { id: 'sample-lf1', kind: 'FOUND', title: 'Blue water bottle', description: 'Left in Lecture Hall 2 after the 10am class.', photoUrl: null, location: 'Lecture Hall 2 → now at the front desk', status: 'OPEN', createdAt: at(-1, 11), expiresAt: at(29), reporter: { id: d.classmates[0]?.id ?? 'sample-u1', name: d.classmates[0]?.name ?? 'Rohan', avatar: null } },
    { id: 'sample-lf2', kind: 'LOST', title: 'Calculator (Casio fx-991)', description: 'Name sticker on the back.', photoUrl: null, location: 'Library, 2nd floor', status: 'OPEN', createdAt: at(-3, 15), expiresAt: at(27), reporter: { id: d.classmates[1]?.id ?? 'sample-u2', name: d.classmates[1]?.name ?? 'Ishita', avatar: null } },
  ].filter((x) => !q.get('kind') || x.kind === q.get('kind')).filter(() => q.get('mine') !== '1'))],
  // Smart study planner: a week of study sessions around classes (Study planner)
  [/^\/api\/student\/smart-plan$/, ({ db: d }) => {
    const code = (i: number) => d.courses[i % Math.max(1, d.courses.length)]?.code ?? 'CS301';
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(Date.now() + i * 86_400_000).toISOString().slice(0, 10);
      const blocks = d.teacherView || i === 6 ? [] : [
        { id: `sample-b${i}a`, date, start: '17:00', end: '18:00', kind: i % 3 === 0 ? 'QUIZ' : 'DEADLINE', title: i % 3 === 0 ? 'Prepare for the weekly quiz' : 'Work on the lab report (part 1)', courseCode: code(i), done: i === 0, pinned: false, movedFrom: null },
        ...(i % 2 ? [{ id: `sample-b${i}b`, date, start: '18:30', end: '19:00', kind: 'FLASHCARDS', title: 'Review due flashcards', courseCode: null, done: false, pinned: false, movedFrom: null }] : []),
      ];
      return { date, busy: i < 5 ? [{ start: '09:00', end: '12:00' }] : [], blocks };
    });
    return ok({ prefs: { capMin: 120, start: '16:00', end: '21:00', ical: false }, note: null, days });
  }],
  // Early help: a study plan from a teacher (shown in the Study planner)
  [/^\/api\/student\/support-plans$/, ({ db: d }) => ok({ plans: d.teacherView ? [] : [{
    id: 'sample-plan', course: { code: d.courses[0]?.code ?? 'CS301', name: d.courses[0]?.name ?? 'Operating Systems' }, from: d.courses[0]?.teacher.name ?? 'Your teacher',
    message: 'Come to office hours on Thursday if anything is unclear.', stepsDone: [0], active: true, createdAt: at(-2, 10),
    plan: {
      intro: `Hi ${d.me.name.split(' ')[0]}, here are a few steps to get the most out of this week.`,
      steps: [
        { title: 'Redo the scheduling practice questions', detail: 'Work through the FCFS and Round Robin examples from week 3 without looking at the answers first.', minutes: 40 },
        { title: 'Review your lab 2 feedback', detail: 'Read the comments on the concurrency criterion and fix the two points mentioned.', minutes: 30 },
        { title: 'Make 10 flashcards on deadlocks', detail: 'One card per condition and per prevention strategy, then review them twice this week.', minutes: 25 },
      ],
      closing: 'Reply to me in Messages any time if you want to talk it through.',
    },
  }] })],
  [/^\/api\/courses\/([^/]+)\/board$/, ({ db: d, m }) => {
    const c = course(d, m[1]);
    if (!c) return fail('Course not found.', 404);
    const canManage = d.teacherView && c.teacher.id === d.me.id;
    const b = d.board[c.id];
    const base = { course: { ...c, _count: { enrollments: d.classmates.length + (canManage ? 0 : 1) } }, canManage, announcements: b.announcements, materials: b.materials, readings: b.readings, events: b.events, sessions: b.sessions ?? [] };
    if (canManage) {
      const roster = d.classmates.map((s) => {
        const gs = d.classGrades.filter((g) => g.courseId === c.id && g.studentId === s.id);
        return { id: s.id, name: s.name, email: s.email, graded: gs.length, average: gs.length ? Math.round(gs.reduce((a, g) => a + pct(g.score, g.maxScore), 0) / gs.length) : null };
      });
      const quizzes = d.quizzes.filter((x) => x.courseId === c.id).map((x) => ({ id: x.id, title: x.title, status: x.status, dueDate: x.dueDate, _count: { questions: x.questions.length, submissions: x.status === 'DRAFT' ? 0 : 4 } }));
      return ok({ ...base, quizzes, roster });
    }
    const grades = d.myGrades.filter((g) => g.courseId === c.id).map(({ id, assignmentName, score, maxScore, status, feedback, gradedAt }) => ({ id, assignmentName, score, maxScore, status, feedback, gradedAt }));
    const quizResults = d.quizzes.filter((x) => x.courseId === c.id && d.submissions[x.id]).map((x) => ({ id: `sub-${x.id}`, score: d.submissions[x.id].score, maxScore: d.submissions[x.id].maxScore, submittedAt: d.submissions[x.id].submittedAt, quiz: { id: x.id, title: x.title, status: x.status } }));
    return ok({ ...base, grades, quizResults });
  }],

  [/^\/api\/student\/overview$/, ({ db: d, q }) => {
    const dow = Number(q.get('dow') ?? (new Date().getDay() + 6) % 7);
    const stats = d.courses.map((c) => {
      const att = d.attendance.filter((a) => a.courseId === c.id);
      const attended = att.filter((a) => a.status !== 'ABSENT').length;
      const gs = d.myGrades.filter((g) => g.courseId === c.id);
      return { id: c.id, code: c.code, name: c.name, color: c.color, emoji: null, attendance: att.length ? Math.round((attended / att.length) * 100) : null, averageGrade: gs.length ? Math.round(gs.reduce((a, g) => a + pct(g.score, g.maxScore), 0) / gs.length) : null };
    });
    const allAtt = d.attendance.length ? Math.round((d.attendance.filter((a) => a.status !== 'ABSENT').length / d.attendance.length) * 100) : null;
    const avg = d.myGrades.length ? Math.round(d.myGrades.reduce((a, g) => a + pct(g.score, g.maxScore), 0) / d.myGrades.length) : null;
    const upcoming = d.quizzes.filter((x) => x.status === 'PUBLISHED' && !d.submissions[x.id] && new Date(x.dueDate) > new Date())
      .map((x) => ({ id: x.id, title: x.title, dueDate: x.dueDate, course: { code: course(d, x.courseId)!.code, name: course(d, x.courseId)!.name } }));
    return ok({
      name: d.me.name,
      stats: { courses: d.courses.length, attendance: allAtt, averageGrade: avg, upcoming: upcoming.length, impactPoints: d.xp },
      level: levelInfo(d.xp),
      courses: stats,
      schedule: d.slots.filter((s) => s.dayOfWeek === dow).map((s) => ({ id: s.id, start: s.startTime, end: s.endTime, type: s.type, room: s.room.name, course: { code: s.course.code, name: s.course.name, color: s.course.color } })),
      upcoming,
      recentGrades: [...d.myGrades].sort((a, b) => +new Date(b.gradedAt) - +new Date(a.gradedAt)).slice(0, 5).map((g) => ({ id: g.id, name: g.assignmentName, course: g.course.code, percent: Math.round(pct(g.score, g.maxScore)), gradedAt: g.gradedAt })),
    });
  }],

  [/^\/grades\/student$/, ({ db: d }) => ok({ grades: d.myGrades, summary: [] })],
  [/^\/grades\/course\/([^/]+)$/, ({ db: d, m }) => ok({ enrollments: d.classmates.map((s) => ({ student: s })), grades: d.classGrades.filter((g) => g.courseId === m[1]) })],

  [/^\/quizzes\/student\/my-quizzes$/, ({ db: d }) => ok(d.quizzes.filter((x) => x.status !== 'DRAFT').map((x) => {
    const sub = d.submissions[x.id];
    return { id: x.id, title: x.title, description: x.description, dueDate: x.dueDate, timeLimit: x.timeLimit, status: x.status, courseId: x.courseId, course: { name: course(d, x.courseId)?.name }, _count: { questions: x.questions.length }, completed: !!sub, score: sub ? Math.round(pct(sub.score, sub.maxScore)) : null };
  }))],
  [/^\/quizzes\/teacher\/my-quizzes$/, ({ db: d }) => ok(d.quizzes.filter((x) => d.taught.some((c) => c.id === x.courseId)).map((x) => ({
    id: x.id, title: x.title, course: course(d, x.courseId)?.name, questions: x.questions.length, timeLimit: x.timeLimit ? `${x.timeLimit} mins` : 'No limit', status: x.status, submissions: x.status === 'DRAFT' ? 0 : 4, dueDate: x.dueDate.split('T')[0],
  })))],
  [/^\/quizzes\/([^/]+)$/, ({ db: d, m }) => { const x = d.quizzes.find((z) => z.id === m[1]); return x ? ok(quizOut(d, x, d.teacherView)) : fail('Quiz not found', 404); }],
  [/^\/api\/quizzes\/([^/]+)\/result$/, ({ db: d, m }) => {
    const x = d.quizzes.find((z) => z.id === m[1]); const sub = x && d.submissions[x.id];
    if (!x || !sub) return fail('You haven’t submitted this quiz.', 404);
    return ok({ title: x.title, score: sub.score, maxScore: sub.maxScore, submittedAt: sub.submittedAt, revealed: true, questions: x.questions.map((qq: any) => ({ id: qq.id, question: qq.question, options: qq.options, points: qq.points, yourAnswer: sub.answers[qq.id] ?? null, correct: sub.answers[qq.id] === qq.correctAnswer, correctAnswer: qq.correctAnswer })) });
  }],
  [/^\/api\/quizzes\/([^/]+)$/, ({ db: d, m }) => {
    const x = d.quizzes.find((z) => z.id === m[1]); if (!x) return fail('Quiz not found.', 404);
    const c = course(d, x.courseId)!;
    const submissions = x.status === 'DRAFT' ? [] : d.classmates.slice(0, 4).map((s, i) => ({ id: `sub-${x.id}-${i}`, score: Math.max(0, x.questions.length - (i % 2)), maxScore: x.questions.length, submittedAt: at(-i - 1, 20), student: { name: s.name } }));
    return ok({ id: x.id, title: x.title, status: x.status, dueDate: x.dueDate, timeLimit: x.timeLimit, course: { name: c.name, code: c.code }, questions: x.questions, submissions });
  }],

  [/^\/timetable\/my$/, ({ db: d }) => ok(d.teacherView ? d.slots.filter((s) => d.taught.some((c) => c.id === s.courseId)) : d.slots)],
  [/^\/calendar\/my$/, ({ db: d }) => ok(d.calendar)],
  [/^\/attendance\/student$/, ({ db: d }) => {
    const map = new Map<string, any>();
    for (const a of d.attendance) { const k = `${a.courseId}:${a.status}`; const e = map.get(k) ?? { courseId: a.courseId, status: a.status, _count: { status: 0 } }; e._count.status++; map.set(k, e); }
    return ok({ records: d.attendance, summary: [...map.values()] });
  }],
  [/^\/attendance\/course\/([^/]+)$/, ({ db: d }) => ok({ enrollments: d.classmates.map((s) => ({ student: s })), attendance: [] })],
  [/^\/courses\/my-students$/, ({ db: d }) => ok(d.taught.flatMap((c) => d.classmates.map((s, i) => {
    const gs = d.classGrades.filter((g) => g.courseId === c.id && g.studentId === s.id);
    const avg = gs.length ? gs.reduce((a, g) => a + pct(g.score, g.maxScore), 0) / gs.length : 0;
    return { id: `${s.id}-${c.id}`, name: s.name, email: s.email, avatar: null, course: c.name, grade: avg >= 90 ? 'A' : avg >= 80 ? 'B' : avg >= 70 ? 'C' : avg >= 60 ? 'D' : 'F', attendance: [96, 88, 79, 92, 71][i % 5] };
  })))],

  [/^\/dashboard\/teacher$/, ({ db: d }) => {
    const gs = d.classGrades;
    const avg = gs.length ? Math.round(gs.reduce((a, g) => a + pct(g.score, g.maxScore), 0) / gs.length) : 0;
    const letter = (p: number) => (p >= 90 ? 'A' : p >= 80 ? 'B' : p >= 70 ? 'C' : p >= 60 ? 'D' : 'F');
    return ok({
      activeCourses: d.taught.length, totalStudents: d.classmates.length, pendingGrades: 3, avgClassScore: avg,
      myCourses: d.taught.map((c) => ({ id: c.id, name: c.name, code: c.code, students: d.classmates.length, completion: 100, color: c.color })),
      gradeDistributionData: ['A', 'B', 'C', 'D', 'F'].map((grade) => ({ grade, count: gs.filter((g) => letter(pct(g.score, g.maxScore)) === grade).length })),
      performanceTrendData: [5, 4, 3, 2, 1, 0].map((mAgo, i) => ({ month: new Date(new Date().getFullYear(), new Date().getMonth() - mAgo, 1).toLocaleString('en', { month: 'short' }), avgScore: [71, 74, 73, 78, 80, avg][i] })),
      recentStudents: gs.slice(0, 5).map((g) => { const s = Math.round(pct(g.score, g.maxScore)); return { name: g.student.name, course: course(d, g.courseId)!.name, score: s, status: s >= 85 ? 'excellent' : s >= 70 ? 'good' : 'needs-help' }; }),
    });
  }],
  [/^\/dashboard\/admin$/, ({ db: d }) => ok({
    totalStudents: 1240, totalTeachers: 86, totalCourses: 142, revenue: 18400,
    departments: [{ name: 'Computer Science', students: 420, teachers: 28, color: '#6366f1' }, { name: 'Environmental Studies', students: 260, teachers: 17, color: '#10b981' }, { name: 'Design', students: 180, teachers: 12, color: '#ec4899' }, { name: 'Business', students: 380, teachers: 29, color: '#f59e0b' }],
    recentPayments: [{ name: d.people.aarav.name, type: 'TUITION', amount: 1200, status: 'completed' }, { name: d.people.zoya.name, type: 'HOSTEL', amount: 450, status: 'pending' }, { name: d.people.liam.name, type: 'EXAM_FEE', amount: 60, status: 'completed' }],
    pendingUsers: [{ id: 'sample-pu-1', name: 'Rohan Das', role: 'STUDENT', dept: 'Computer Science', applied: new Date().toLocaleDateString() }, { id: 'sample-pu-2', name: 'Dr. Leena Joseph', role: 'TEACHER', dept: 'Design', applied: new Date().toLocaleDateString() }],
  })],

  [/^\/api\/notifications$/, ({ db: d }) => ok(d.notifications)],
  [/^\/api\/chat\/conversations$/, ({ db: d }) => ok({ conversations: d.conversations.map((c) => summary(d, c)).sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (+new Date(b.activityAt) - +new Date(a.activityAt))), me: d.me.id })],
  [/^\/api\/chat\/folders$/, () => ok({ folders: [] })],
  [/^\/api\/tasks$/, () => ok({ courses: [], boards: [], mine: [] })],
  [/^\/api\/docs$/, () => ok({ courses: [], docs: [] })],
  [/^\/api\/spaces$/, () => ok({ courses: [], groups: [] })],
  [/^\/api\/docs\/([^/]+)$/, () => fail('Documents aren’t in the sample yet.', 404)],
  [/^\/api\/tasks\/([^/]+)$/, () => fail('Task boards aren’t in the sample yet.', 404)],
  [/^\/api\/tasks\/items\/([^/]+)\/comments$/, () => ok([])],
  [/^\/api\/chat\/starred$/, ({ db: d }) => ok(d.conversations.flatMap((c) => visible(d, c).filter((m: any) => d.starred.has(m.id)).map((m: any) => ({ ...decorateMsg(d, m), chat: { id: c.id, title: c.title } }))))],
  [/^\/api\/chat\/conversations\/([^/]+)\/messages$/, ({ db: d, m, q }) => {
    const c = d.conversations.find((x) => x.id === m[1]); if (!c) return fail('Conversation not found.', 404);
    const term = q.get('q')?.toLowerCase();
    if (term) return ok({ results: visible(d, c).filter((m: any) => m.type !== 'DELETED' && `${m.body} ${m.attachmentName ?? ''}`.toLowerCase().includes(term)).reverse().map((m: any) => ({ id: m.id, body: m.body, type: m.type, attachmentName: m.attachmentName, createdAt: m.createdAt, sender: { id: m.sender.id, name: m.sender.name } })) });
    c.unread = 0;
    if (c.prefs) c.prefs.markedUnread = false;
    if (q.get('before')) return ok({ conversation: null, typing: [], messages: [], hasMore: false, me: d.me.id });
    return ok({
      conversation: { id: c.id, isGroup: c.isGroup, isOfficial: c.isOfficial, title: c.title, avatarUrl: null, myRole: 'ADMIN', disappearingSec: c.disappearingSec ?? null, pinned: !!c.prefs?.pinned, muted: !!c.prefs?.muted, archived: !!c.prefs?.archived, members: c.members.map((u: any) => ({ id: u.id, name: u.name, avatar: null, role: u.role, groupRole: u.id === d.me.id ? 'ADMIN' : 'MEMBER', online: u.id !== d.people.meera.id, lastSeenAt: at(0, 8), lastReadAt: new Date().toISOString() })) },
      typing: [], messages: visible(d, c).map((m: any) => decorateMsg(d, m)), hasMore: false, me: d.me.id,
    });
  }],
  [/^\/api\/chat\/users$/, ({ db: d, q }) => { const s = (q.get('q') ?? '').toLowerCase(); return ok(d.directory.filter((u) => u.name.toLowerCase().includes(s)).map((u) => ({ id: u.id, name: u.name, avatar: null, role: u.role, online: u.role === 'STUDENT' }))); }],
  [/^\/api\/chat\/incoming$/, () => ok([])],

  [/^\/groups$/, ({ db: d }) => ok(d.groups.map((g) => groupOut(d, g)))],
  [/^\/groups\/my$/, ({ db: d }) => ok(d.groups.filter((g) => g.joined).map((g) => ({ id: `m-${g.id}`, groupId: g.id, userId: d.me.id, role: 'MEMBER', group: groupOut(d, g) })))],
  [/^\/api\/groups\/activity$/, ({ db: d }) => ok(d.groups.filter((g) => g.joined).flatMap((g) => (d.groupPosts[g.id] ?? []).map((p) => ({ ...p, author: { id: p.author.id, name: p.author.name }, group: { id: g.id, name: g.name, category: g.category } }))).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)))],
  [/^\/api\/groups\/([^/]+)\/posts$/, ({ db: d, m }) => ok({ posts: [...(d.groupPosts[m[1]] ?? [])].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)), isMember: !!d.groups.find((g) => g.id === m[1])?.joined, myId: d.me.id })],
  [/^\/api\/groups\/([^/]+)$/, ({ db: d, m }) => {
    const g = d.groups.find((x) => x.id === m[1]); if (!g) return fail('Group not found.', 404);
    return ok({ id: g.id, name: g.name, description: g.description, isPublic: g.isPublic, members: g.members.map((u: any, i: number) => ({ role: i === 0 ? 'ADMIN' : 'MEMBER', joinedAt: at(-20 + i), user: { id: u.id, name: u.name, avatar: null } })), isMember: g.joined, files: [] });
  }],

  [/^\/impact\/ngo-projects$/, ({ db: d }) => ok(d.ngoProjects)],
  [/^\/impact\/my-level$/, ({ db: d }) => ok({ ...levelInfo(d.xp), userName: d.me.name, levels: LEVELS })],
  // Points earned in the chosen period (week, month, semester); each person's share differs, so the order changes like it would.
  [/^\/impact\/leaderboard$/, ({ db: d, q }) => {
    const share = ({ week: [0.05, 0.11, 0.09, 0.14, 0.12, 0.3], month: [0.18, 0.26, 0.22, 0.31, 0.28, 0.6], semester: [0.62, 0.7, 0.58, 0.74, 0.66, 0.9] } as Record<string, number[]>)[q.get('period') ?? ''];
    if (!share) return ok(d.leaderboard);
    return ok(d.leaderboard.map((u, i) => ({ ...u, totalPoints: Math.round(u.totalPoints * share[i % share.length]) })).sort((a, b) => b.totalPoints - a.totalPoints));
  }],
  [/^\/impact\/dashboard\/stats$/, ({ db: d }) => ok({
    userName: d.me.name, totalPoints: d.xp, verifiedHours: Math.floor(d.xp / 10), completedNGOs: 2, grants: 0, activities: d.impactActivities, levelInfo: levelInfo(d.xp),
    sdgBadges: [{ num: 4, name: 'SDG 4 Objective', hours: 50, partner: 'City Learning Trust', status: 'Completed', color: 'from-rose-500 to-red-600' }, { num: 11, name: 'SDG 11 Objective', hours: 80, partner: 'Green Roots NGO', status: 'Completed', color: 'from-amber-500 to-orange-600' }],
  })],
  [/^\/impact\/startups$/, ({ db: d }) => ok(d.startups)],
  [/^\/impact\/summits$/, ({ db: d }) => ok(d.summits)],
  [/^\/impact\/summits\/my-registrations$/, ({ db: d }) => ok(d.summitRegs.map((id) => ({ id: `reg-${id}`, summitId: id, userId: d.me.id, registeredAt: at(-2), summit: d.summits.find((s) => s.id === id) })))],
  [/^\/impact\/blockchain-credentials$/, ({ db: d }) => ok(d.credentials)],

  [/^\/internships$/, ({ db: d }) => ok(d.internships)],
  [/^\/internships\/my-applications$/, ({ db: d }) => ok(d.myApplications)],
  [/^\/api\/internships\/placements$/, ({ db: d }) => ok(d.placements)],
  [/^\/partners$/, ({ db: d }) => ok(d.partners)],
  [/^\/skills\/my$/, ({ db: d }) => ok(d.skills)],
  [/^\/tickets$/, ({ db: d }) => ok(d.tickets)],
  [/^\/associations$/, ({ db: d }) => ok(d.associations)],
  [/^\/associations\/my-memberships$/, ({ db: d }) => ok(d.myMemberships)],
  [/^\/knowledge-hub(\/public)?$/, ({ db: d }) => ok(d.knowledge)],
  [/^\/documents\/my$/, ({ db: d }) => ok(d.documents)],
  [/^\/scholarships$/, ({ db: d }) => ok(d.scholarships)],
  [/^\/scholarships\/my-applications$/, ({ db: d }) => ok(d.myScholarships)],
  [/^\/api\/campus-items$/, ({ db: d, q }) => ok(d.campusItems.filter((c) => !q.get('kind') || c.kind === q.get('kind')))],
  [/^\/api\/me$/, ({ db: d }) => ok(d.profile)],

  // ── Admin ──
  [/^\/users$/, ({ db: d, q }) => ok(d.users.filter((u) => !q.get('role') || u.role === q.get('role')))],
  [/^\/courses\/admin\/all$/, ({ db: d }) => ok(d.courses.map((c) => ({ ...c, teacher: { id: c.teacher.id, name: c.teacher.name }, _count: { enrollments: d.classmates.length + 1, ...counts(d, c.id) } })))],
  [/^\/announcements$/, ({ db: d }) => ok(d.adminAnnouncements)],
  [/^\/quizzes$/, ({ db: d }) => ok(d.quizzes.map((x) => ({ id: x.id, title: x.title, status: x.status, dueDate: x.dueDate, timeLimit: x.timeLimit, courseId: x.courseId, course: { name: course(d, x.courseId)?.name } })))],
  [/^\/impact\/certificates\/pending$/, ({ db: d }) => ok(d.pendingCertificates)],
  [/^\/safety$/, () => ok([])],
  [/^\/api\/assignments$/, () => ok([])],
  [/^\/api\/admin\/school-analytics$/, ({ q }) => {
    const many = q.get('metrics');
    if (many) return ok({ results: many.split(',').filter(isMetricId).slice(0, 4).map((id) => sampleMetric(id)) });
    const id = q.get('metric');
    return isMetricId(id) ? ok(sampleMetric(id, { days: Number(q.get('days')) || null, order: q.get('order'), department: q.get('department') })) : fail('Unknown measure.');
  }],
  [/^\/api\/admin\/insights$/, () => ok({ totals: { students: 0, teachers: 0, courses: 0, grade30: null, attendance30: null, flaggedStudents: 0 }, atRisk: [], departments: [], teachers: [] })],
  [/^\/api\/student\/guardians$/, () => ok({ enabled: false, contacts: [] })],
  [/^\/api\/code$/, () => ok({ courses: [], rooms: [] })],
  [/^\/api\/calls$/, () => ok([])],
  [/^\/api\/chat\/status$/, () => ok([])],
  [/^\/api\/chat\/communities$/, () => ok([])],
  [/^\/api\/chat\/communities\/discover$/, () => ok([
    { id: 'sample-open-1', name: 'Climate Action Network', description: 'Students across campuses working on climate projects', color: '#059669', members: 214, campus: 'Lakeside University' },
    { id: 'sample-open-2', name: 'Women in Tech', description: 'Mentoring, events and job tips', color: '#7c3aed', members: 98, campus: null },
  ])],
  [/^\/api\/network$/, () => ok(sampleNetwork())],
  [/^\/api\/network\/courses$/, ({ db: d }) => ok(d.courses.slice(0, 4).map((c, i) => ({ id: c.id, code: c.code, name: c.name, status: 'PUBLISHED', teacher: c.teacher.name, students: 24 + i * 7, home: { id: 'sample-campus-1', name: 'Riverside University' }, sharedWith: i === 0 ? [{ id: 'sample-campus-2', name: 'Lakeside University' }] : [] })))],
  [/^\/api\/network\/exchange$/, () => ok([
    { id: 'sample-ex-1', name: 'Lena Fischer', email: 'lena.fischer@example.edu', home: 'Riverside University', host: 'Lakeside University', from: at(-20), until: at(70), now: true },
  ])],
  [/^\/api\/network\/joint$/, () => ok({ courses: [
    { id: 'sample-joint-1', code: 'LAK210', name: 'Urban Water Systems', description: 'How cities manage water, with field data from both campuses.', credits: 4, color: '#0891b2', teacher: 'Dr. Hana Sato', campus: 'Lakeside University', viaExchange: false, enrolled: false, students: 31 },
    { id: 'sample-joint-2', code: 'MTN105', name: 'Data Ethics', description: null, credits: 3, color: '#7c3aed', teacher: 'Prof. Omar Haddad', campus: 'Mountain Institute', viaExchange: false, enrolled: true, students: 58 },
  ], exchange: null })],
  [/^\/api\/calls\/favorites$/, () => ok([])],
  [/^\/api\/me\/presence$/, () => ok({ presence: 'auto', statusText: null, statusEmoji: null, statusUntil: null, effective: { presence: 'auto', hidden: false } })],
  [/^\/api\/chat\/search$/, () => ok([])],
  [/^\/api\/calls\/scheduled$/, ({ q }) => ok(q.get('rooms') ? { classes: [], groups: [], chats: [] } : [])],
  [/^\/api\/live$/, ({ q }) => ok(q.get('courseId') ? { enrolled: 0, polls: [] } : [])],
  [/^\/impact\/blockchain-credentials\/pending$/, ({ db: d }) => ok(d.pendingCredentials)],
  [/^\/collaborations\/projects$/, ({ db: d }) => ok(d.projects)],
  [/^\/collaborations\/projects\/([^/]+)$/, ({ db: d, m }) => { const p = d.projects.find((x) => x.id === m[1]); return p ? ok({ ...p, members: [], milestones: [] }) : fail('Not found', 404); }],
  [/^\/partners\/partnerships$/, ({ db: d }) => ok(d.partnerships)],
  [/^\/api\/admin\/rooms$/, ({ db: d }) => ok(d.adminRooms)],
  [/^\/rooms$/, ({ db: d }) => ok(d.adminRooms.map(({ reservations, ...r }) => r))],
  [/^\/api\/admin\/timetable$/, ({ db: d }) => ok({ slots: d.slots, courses: d.courses.map((c) => ({ id: c.id, code: c.code, name: c.name })), rooms: Object.values(d.rooms).map((r: any) => ({ id: r.id, name: r.name })) })],
  [/^\/api\/premium\/analytics$/, ({ db: d }) => ok(d.analytics)],
  // A study pack in another language (Stage 4 · 4.1): the sample's packs are shown as they are.
  [/^\/api\/class-sessions\/([^/]+)\/translation$/, () => ok({ same: true, pack: null })],
  // Call recordings (Stage 4 · 2.9): the sample has none.
  [/^\/api\/call-recordings\/([^/]+)$/, () => fail('This recording isn’t available in the sample.', 404)],
  // Meeting notes (Stage 4 · 2.8): the sample has none.
  [/^\/api\/meeting-notes\/([^/]+)$/, () => fail('These notes aren’t available in the sample.', 404)],
  // Smart replay search (Stage 4 · 4.6): the sample's classes have no transcript.
  [/^\/api\/class-sessions\/([^/]+)\/replay$/, () => ok({ results: [] })],
  [/^\/api\/billing\/subscription$/, () => ok({ organization: { id: 'sample-org', name: 'Sample University' }, plan: 'ENTERPRISE', subscribedPlan: 'ENTERPRISE', status: 'active', interval: 'year', currentPeriodEnd: at(200), cancelAtPeriodEnd: false, hasBillingAccount: false })],
  [/^\/api\/admin\/impact$/, ({ db: d }) => ok(d.adminImpact)],
  [/^\/documents$/, ({ db: d }) => ok(d.documents.map((doc) => ({ ...doc, issuedAt: doc.createdAt, user: { name: d.people.aarav.name } })))],
];

// ── Write routes (in-memory only) ──────────────────────────────────────
const WRITE: [string, RegExp, (c: Ctx) => Result][] = [
  ['PUT', /^\/api\/courses\/([^/]+)\/skills$/, ({ body }) => { notice(); return ok({ skills: Array.isArray(body?.skills) ? body.skills.slice(0, 6) : [] }); }],
  ['POST', /^\/api\/courses\/([^/]+)\/skills$/, () => ok({ skills: ['Operating systems', 'Concurrency', 'C programming', 'Debugging', 'Technical writing'], aiLeft: null })],
  ['POST', /^\/api\/class-sessions\/([^/]+)\/flashcards$/, () => { notice(); return ok({ added: 4, already: 0 }); }],
  ['POST', /^\/api\/courses\/([^/]+)\/board$/, ({ db: d, m, body }) => {
    const b = d.board[m[1]]; if (!b) return fail('Course not found.', 404);
    const id = sid('b');
    if (body.kind === 'announcement') b.announcements.unshift({ id, title: body.title, body: body.body, createdAt: new Date().toISOString(), author: { name: d.me.name } });
    else if (body.kind === 'material') b.materials.unshift({ id, title: body.title, type: 'OTHER', fileUrl: body.url, size: body.size || null, createdAt: new Date().toISOString() });
    else if (body.kind === 'reading') b.readings.unshift({ id, title: body.title, description: body.description || null, url: body.url || null, category: body.category || null });
    else if (body.kind === 'event') { const s = new Date(body.startAt); b.events.push({ id, title: body.title, description: body.description || null, startAt: s.toISOString(), endAt: new Date(+s + (Number(body.durationMinutes) || 60) * 60_000).toISOString(), type: body.type || 'MEETING' }); }
    return ok({ id }, 201);
  }],
  ['DELETE', /^\/api\/courses\/([^/]+)\/board$/, ({ db: d, m, q }) => {
    const b = d.board[m[1]]; const list = ({ announcement: 'announcements', material: 'materials', reading: 'readings', event: 'events' } as any)[q.get('kind') ?? ''];
    if (b && list) b[list] = b[list].filter((x: any) => x.id !== q.get('itemId'));
    return ok({ ok: true });
  }],

  ['POST', /^\/api\/chat\/conversations$/, ({ db: d, body }) => {
    if (body.userId) {
      const existing = d.conversations.find((c) => !c.isGroup && c.members.some((u: any) => u.id === body.userId));
      if (existing) return ok({ id: existing.id });
      const other = d.directory.find((u) => u.id === body.userId) ?? { id: body.userId, name: 'New contact', role: 'STUDENT' };
      const c = { id: sid('conv'), isGroup: false, isOfficial: false, title: other.name, members: [d.meCard, other], messages: [] as any[] };
      d.conversations.push(c);
      return ok({ id: c.id }, 201);
    }
    const members = d.directory.filter((u) => (body.userIds ?? body.memberIds ?? []).includes(u.id));
    const c = { id: sid('conv'), isGroup: true, isOfficial: false, title: body.name || 'New group', members: [d.meCard, ...members], messages: [] as any[] };
    d.conversations.push(c);
    return ok({ id: c.id }, 201);
  }],
  ['POST', /^\/api\/chat\/conversations\/([^/]+)\/messages$/, ({ db: d, m, body }) => {
    const c = d.conversations.find((x) => x.id === m[1]); if (!c) return fail('Conversation not found.', 404);
    if (c.isOfficial) return fail('This is an announcements-only channel.', 403);
    const reply = body.replyToId ? c.messages.find((x: any) => x.id === body.replyToId) : null;
    let extra: any = {};
    if (body.forwardOf) {
      const src = findMsg(d, body.forwardOf)?.m;
      if (!src) return fail('Message not found.', 404);
      extra = { type: src.type, body: src.body, attachmentUrl: src.attachmentUrl, attachmentName: src.attachmentName, attachmentSize: src.attachmentSize, attachmentMime: src.attachmentMime, metadata: src.metadata, forwarded: true };
    } else if (body.type === 'POLL') {
      extra = { type: 'POLL', body: body.poll?.question, metadata: { question: body.poll?.question, options: body.poll?.options ?? [], multiple: !!body.poll?.multiple } };
    } else if (body.type === 'LOCATION') {
      extra = { type: 'LOCATION', body: body.location?.label || 'Location', metadata: { lat: body.location?.lat, lng: body.location?.lng, label: body.location?.label ?? null } };
    } else if (body.type === 'CONTACT') {
      const u = d.directory.find((x) => x.id === body.contactId);
      if (!u) return fail('Contact not found.', 404);
      extra = { type: 'CONTACT', body: u.name, metadata: { userId: u.id, name: u.name, role: u.role, avatar: null } };
    } else if (body.type === 'CALL') {
      return fail('Calls aren’t available in sample mode — exit sample mode to call real people.');
    }
    const message = {
      id: sid('msg'), conversationId: c.id, senderId: d.me.id, body: body.body ?? '', type: body.type ?? (body.attachmentUrl ? 'FILE' : 'TEXT'),
      attachmentUrl: body.attachmentUrl ?? null, attachmentName: body.attachmentName ?? null, attachmentSize: body.attachmentSize ?? null, attachmentMime: body.attachmentMime ?? null,
      metadata: body.metadata ?? null, createdAt: new Date().toISOString(), editedAt: null, deletedAt: null,
      replyTo: reply ? { id: reply.id, body: reply.body, type: reply.type, sender: { id: reply.senderId, name: reply.sender.name } } : null,
      reactions: {}, sender: { id: d.me.id, name: d.me.name, avatar: null },
      expiresAt: c.disappearingSec ? new Date(Date.now() + c.disappearingSec * 1000).toISOString() : null,
      ...extra,
    };
    c.messages.push(message);
    return ok(decorateMsg(d, message), 201);
  }],
  ['PUT', /^\/api\/chat\/folders$/, ({ body }) => ok({ folders: Array.isArray(body?.folders) ? body.folders.slice(0, 10) : [] })],
  ['PATCH', /^\/api\/chat\/conversations\/([^/]+)\/prefs$/, ({ db: d, m, body }) => {
    const c: any = d.conversations.find((x) => x.id === m[1]); if (!c) return fail('Conversation not found.', 404);
    if (typeof body.pinned === 'boolean') c.prefs.pinned = body.pinned;
    if ('muted' in body) c.prefs.muted = !!body.muted;
    if (typeof body.archived === 'boolean') { c.prefs.archived = body.archived; if (body.archived) c.prefs.pinned = false; }
    if (typeof body.unread === 'boolean') { c.prefs.markedUnread = body.unread; if (!body.unread) c.unread = 0; }
    return ok({ ok: true });
  }],
  ['PATCH', /^\/api\/chat\/conversations\/([^/]+)\/settings$/, ({ db: d, m, body }) => {
    const c: any = d.conversations.find((x) => x.id === m[1]); if (!c) return fail('Conversation not found.', 404);
    const sec = Number(body.disappearingSec) || 0;
    c.disappearingSec = sec || null;
    const label = ({ 86400: '24 hours', 604800: '7 days', 7776000: '90 days' } as any)[sec];
    c.messages.push({ id: sid('msg'), conversationId: c.id, senderId: d.me.id, type: 'SYSTEM', body: sec ? `You turned on disappearing messages. New messages will disappear after ${label}.` : 'You turned off disappearing messages.', attachmentUrl: null, attachmentName: null, attachmentSize: null, attachmentMime: null, metadata: null, createdAt: new Date().toISOString(), editedAt: null, deletedAt: null, replyTo: null, reactions: {}, sender: { id: d.me.id, name: d.me.name, avatar: null } });
    return ok({ ok: true });
  }],
  ['POST', /^\/api\/chat\/messages\/([^/]+)\/state$/, ({ db: d, m, body }) => {
    if (typeof body.starred === 'boolean') { if (body.starred) d.starred.add(m[1]); else d.starred.delete(m[1]); }
    if (body.hidden) { d.hiddenMsgs.add(m[1]); d.starred.delete(m[1]); }
    return ok({ ok: true });
  }],
  ['POST', /^\/api\/chat\/messages\/([^/]+)\/vote$/, ({ db: d, m, body }) => {
    const found = findMsg(d, m[1]); if (!found || found.m.type !== 'POLL') return fail('Poll not found.', 404);
    const votes = (d.pollVotes[m[1]] ??= {});
    const mine = votes[d.me.id] ?? [];
    const option = Number(body.option);
    votes[d.me.id] = mine.includes(option) ? mine.filter((o) => o !== option) : found.m.metadata?.multiple ? [...mine, option] : [option];
    return ok({ ok: true });
  }],
  ['POST', /^\/api\/chat\/messages\/([^/]+)\/reactions$/, ({ db: d, m, body }) => {
    for (const c of d.conversations) {
      const msg = c.messages.find((x: any) => x.id === m[1]);
      if (msg) { const list: string[] = msg.reactions[body.emoji] ?? []; msg.reactions[body.emoji] = list.includes(d.me.id) ? list.filter((u) => u !== d.me.id) : [...list, d.me.id]; if (!msg.reactions[body.emoji].length) delete msg.reactions[body.emoji]; return ok({ reactions: msg.reactions }); }
    }
    return ok({ ok: true });
  }],
  ['PATCH', /^\/api\/chat\/messages\/([^/]+)$/, ({ db: d, m, body }) => { for (const c of d.conversations) { const msg = c.messages.find((x: any) => x.id === m[1]); if (msg) { msg.body = body.body ?? msg.body; msg.editedAt = new Date().toISOString(); return ok(msg); } } return ok({ ok: true }); }],
  ['DELETE', /^\/api\/chat\/messages\/([^/]+)$/, ({ db: d, m }) => { for (const c of d.conversations) { const msg = c.messages.find((x: any) => x.id === m[1]); if (msg) { Object.assign(msg, { type: 'DELETED', body: '', deletedAt: new Date().toISOString(), attachmentUrl: null, reactions: {} }); } } return ok({ ok: true }); }],

  ['POST', /^\/quizzes\/([^/]+)\/submit$/, ({ db: d, m, body }) => {
    const x = d.quizzes.find((z) => z.id === m[1]); if (!x) return fail('Quiz not found', 404);
    const answers = body.answers ?? {};
    let score = 0, maxScore = 0;
    for (const qq of x.questions) { maxScore += qq.points; if (answers[qq.id] === qq.correctAnswer) score += qq.points; }
    d.submissions[x.id] = { score, maxScore, answers, submittedAt: new Date().toISOString() };
    return ok({ id: sid('sub'), quizId: x.id, score, maxScore });
  }],
  ['POST', /^\/quizzes$/, ({ db: d, body }) => { const x = { id: sid('quiz'), courseId: body.courseId, title: body.title, description: body.description ?? null, dueDate: at(7, 23, 59), timeLimit: body.timeLimit ?? 30, status: 'DRAFT', questions: [] as any[] }; d.quizzes.push(x as any); return ok(x, 201); }],
  ['DELETE', /^\/quizzes\/([^/]+)$/, ({ db: d, m }) => { const i = d.quizzes.findIndex((z) => z.id === m[1]); if (i >= 0) d.quizzes.splice(i, 1); return ok({ ok: true }); }],
  ['PATCH', /^\/api\/quizzes\/([^/]+)$/, ({ db: d, m, body }) => {
    const x: any = d.quizzes.find((z) => z.id === m[1]); if (!x) return fail('Quiz not found.', 404);
    if (body.status === 'PUBLISHED' && !x.questions.length) return fail('Add at least one question before publishing.');
    if (body.status) x.status = body.status;
    if ('dueDate' in body) x.dueDate = body.dueDate ?? x.dueDate;
    if ('timeLimit' in body) x.timeLimit = body.timeLimit;
    return ok({ ok: true });
  }],
  ['POST', /^\/api\/quizzes\/([^/]+)\/questions$/, ({ db: d, m, body }) => { const x = d.quizzes.find((z) => z.id === m[1]); if (!x) return fail('Quiz not found.', 404); const qq = { id: sid('qq'), quizId: x.id, question: body.question, options: body.options, correctAnswer: body.correctAnswer, points: Number(body.points) || 1, order: x.questions.length }; x.questions.push(qq); return ok(qq, 201); }],
  ['DELETE', /^\/api\/quizzes\/([^/]+)\/questions$/, ({ db: d, m, q }) => { const x = d.quizzes.find((z) => z.id === m[1]); if (x) x.questions = x.questions.filter((qq: any) => qq.id !== q.get('qid')); return ok({ ok: true }); }],

  ['POST', /^\/grades\/course\/([^/]+)$/, ({ db: d, m, body }) => {
    const s = d.classmates.find((u) => u.id === body.studentId); if (!s) return fail('That student is not enrolled in this course');
    const g = { id: sid('g'), studentId: s.id, courseId: m[1], assignmentName: body.assignmentName, score: Number(body.score), maxScore: Number(body.maxScore) || 100, weight: 1, status: 'GRADED', feedback: body.feedback || null, gradedAt: new Date().toISOString(), createdAt: new Date().toISOString(), student: s };
    d.classGrades.unshift(g); return ok(g, 201);
  }],
  ['DELETE', /^\/grades\/([^/]+)$/, ({ db: d, m }) => { d.classGrades.splice(d.classGrades.findIndex((g) => g.id === m[1]) >>> 0, 1); return ok({ ok: true }); }],

  ['PATCH', /^\/api\/notifications$/, ({ db: d, body }) => { d.notifications.forEach((n) => { if (!body.ids?.length || body.ids.includes(n.id)) n.read = true; }); return ok({ ok: true }); }],
  ['PATCH', /^\/api\/me$/, ({ db: d, body }) => { Object.assign(d.profile, body); return ok(d.profile); }],
  ['POST', /^\/skills$/, ({ db: d, body }) => { const s = { id: sid('sk'), userId: d.me.id, name: body.name, category: body.category ?? null, level: body.level ?? 'BEGINNER', endorsements: 0, createdAt: new Date().toISOString() }; d.skills.push(s); return ok(s, 201); }],
  ['DELETE', /^\/skills\/([^/]+)$/, ({ db: d, m }) => { d.skills.splice(d.skills.findIndex((s) => s.id === m[1]) >>> 0, 1); return ok({ ok: true }); }],
  ['POST', /^\/tickets$/, ({ db: d, body }) => { const t = { id: sid('t'), subject: body.subject, description: body.description, category: body.category, status: 'OPEN', priority: 'MEDIUM', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; d.tickets.unshift(t); return ok(t, 201); }],
  ['POST', /^\/api\/groups\/([^/]+)\/posts$/, ({ db: d, m, body }) => { const p = { id: sid('gp'), body: body.body ?? '', imageUrl: body.imageUrl ?? null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), author: { id: d.me.id, name: d.me.name, avatar: null } }; (d.groupPosts[m[1]] ??= []).push(p); return ok(p, 201); }],
  ['POST', /^\/groups\/([^/]+)\/join$/, ({ db: d, m }) => { const g = d.groups.find((x) => x.id === m[1]); if (g && !g.joined) { g.joined = true; g.members.push(d.meCard); } return ok({ ok: true }); }],
  ['DELETE', /^\/groups\/([^/]+)\/leave$/, ({ db: d, m }) => { const g = d.groups.find((x) => x.id === m[1]); if (g) { g.joined = false; g.members = g.members.filter((u: any) => u.id !== d.me.id); } return ok({ ok: true }); }],
  ['POST', /^\/groups$/, ({ db: d, body }) => { const g = { id: sid('grp'), name: body.name, description: body.description ?? null, category: body.category ?? 'Study', isPublic: true, createdAt: new Date().toISOString(), members: [d.meCard], joined: true }; d.groups.unshift(g); return ok(groupOut(d, g), 201); }],
  ['POST', /^\/impact\/summits\/([^/]+)\/register$/, ({ db: d, m }) => { if (!d.summitRegs.includes(m[1])) d.summitRegs.push(m[1]); return ok({ ok: true }); }],
  ['POST', /^\/impact\/certificates\/([^/]+)\/(approve|reject)$/, ({ db: d, m }) => { d.pendingCertificates.splice(d.pendingCertificates.findIndex((x) => x.id === m[1]) >>> 0, 1); return ok({ ok: true }); }],
  ['POST', /^\/impact\/blockchain-credentials\/([^/]+)\/(verify|approve|reject|issue)$/, ({ db: d, m }) => { d.pendingCredentials.splice(d.pendingCredentials.findIndex((x) => x.id === m[1]) >>> 0, 1); return ok({ ok: true }); }],
  ['PATCH', /^\/impact\/blockchain-credentials\/([^/]+)(\/[a-z-]+)?$/, ({ db: d, m }) => { d.pendingCredentials.splice(d.pendingCredentials.findIndex((x) => x.id === m[1]) >>> 0, 1); return ok({ ok: true }); }],
  ['PATCH', /^\/collaborations\/projects\/([^/]+)\/review$/, ({ db: d, m, body }) => { const p = d.projects.find((x) => x.id === m[1]); if (p) p.status = body.status ?? p.status; return ok(p ?? { ok: true }); }],
  ['POST', /^\/announcements$/, ({ db: d, body }) => { const a = { id: sid('ann'), title: body.title, body: body.body ?? body.content ?? '', content: body.body ?? body.content ?? '', createdAt: new Date().toISOString(), author: { name: d.me.name }, course: null }; d.adminAnnouncements.unshift(a); return ok(a, 201); }],
  ['DELETE', /^\/announcements\/([^/]+)$/, ({ db: d, m }) => { d.adminAnnouncements.splice(d.adminAnnouncements.findIndex((x) => x.id === m[1]) >>> 0, 1); return ok({ ok: true }); }],
  ['DELETE', /^\/users\/([^/]+)$/, ({ db: d, m }) => { d.users.splice(d.users.findIndex((x) => x.id === m[1]) >>> 0, 1); return ok({ ok: true }); }],
  ['PATCH', /^\/users\/([^/]+)(\/status)?$/, ({ db: d, m, body }) => { const u = d.users.find((x) => x.id === m[1]); if (u) Object.assign(u, body.status ? { status: body.status } : {}, body.role ? { role: body.role } : {}); return ok(u ?? { ok: true }); }],
  ['DELETE', /^\/api\/admin\/rooms$/, ({ db: d, q }) => { for (const r of d.adminRooms) r.reservations = r.reservations.filter((x: any) => x.id !== q.get('reservationId')); return ok({ ok: true }); }],
  ['DELETE', /^\/api\/admin\/timetable$/, ({ db: d, q }) => { d.slots.splice(d.slots.findIndex((x) => x.id === q.get('id')) >>> 0, 1); return ok({ ok: true }); }],
  ['POST', /^\/api\/admin\/school-analytics$/, ({ body }) => ok(sampleAsk(body.question))],
  ['POST', /^\/api\/premium\/ai-report$/, () => ok({ report: [
    '## Executive summary (sample)',
    'Engagement grew steadily this term: sign-ups peaked in the enrolment month and impact points are up about 10% month over month.',
    '',
    '## Highlights',
    '- 842 of 1,326 members were active in the last 30 days (63%).',
    '- 118 NGO applications were accepted; Education and Environment lead with 16 of 23 active projects.',
    '- Top contributors are earning Level 4–5 impact badges.',
    '',
    '## Recommendations',
    '1. Promote Health projects — only 4 are active despite high student interest.',
    '2. Follow up the 42 pending applications within a week to keep momentum.',
    '3. Recognise top contributors at the next campus event.',
    '',
    '_This is an example report generated in sample mode._',
  ].join('\n') })],
  ['POST', /^\/api\/upload$/, () => ok({ url: '/icon-512x512.png' })],
  ['POST', /^\/api\/(billing|create-checkout-session)/, () => fail('Payments aren’t available in sample mode. Exit sample mode to subscribe.')],
];

// Requests that always go to the real server, even in sample mode.
const PASSTHROUGH = [/^\/auth\//, /^\/users\/me$/, /^\/api\/ai$/, /^\/api\/summarize$/, /^\/api\/invite/];

let lastNotice = 0;
function notice() {
  if (Date.now() - lastNotice < 8000) return;
  lastNotice = Date.now();
  toast('Sample mode — this change stays on your screen only', { description: 'Exit sample mode to use your real account.' });
}

/** Returns a sample response for a request, or null to let it reach the real server. */
export function resolveSample(method: string, rawUrl: string, body: unknown): Result | null {
  const url = new URL(rawUrl, 'http://sample.local');
  let path = url.pathname.replace(/\/+$/, '') || '/';
  if (/^https?:/.test(rawUrl) && !rawUrl.startsWith(window.location.origin)) path = path.replace(/^\/api(?=\/)/, ''); // absolute API_URL → Nest path
  if (PASSTHROUGH.some((r) => r.test(path))) return null;

  const d = getDb();
  const parsed = typeof body === 'string' ? (() => { try { return JSON.parse(body); } catch { return {}; } })() : (body ?? {});
  const verb = method.toUpperCase();
  if (verb === 'GET') {
    for (const [re, h] of GET) { const m = path.match(re); if (m) return h({ db: d, m, q: url.searchParams, body: parsed }); }
    return null;
  }
  for (const [v, re, h] of WRITE) {
    const m = path.match(re);
    if (m && v === verb) return h({ db: d, m, q: url.searchParams, body: parsed });
  }
  notice();
  return ok({ ok: true, id: sid('x'), ...(parsed && typeof parsed === 'object' ? parsed : {}) });
}
