/* eslint-disable @typescript-eslint/no-explicit-any */
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth';
import { buildSampleDb, levelInfo, LEVELS, sid, at, type SampleDb } from './data';

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

type Ctx = { db: SampleDb; m: RegExpMatchArray; q: URLSearchParams; body: any };
type Result = { status: number; data: any };
const ok = (data: any, status = 200): Result => ({ status, data });
const fail = (error: string, status = 400): Result => ({ status, data: { error, message: error } });

const pct = (s: number, m: number) => (m > 0 ? (s / m) * 100 : 0);
const course = (d: SampleDb, id: string) => d.courses.find((c) => c.id === id);
const counts = (d: SampleDb, id: string) => ({ materials: d.board[id]?.materials.length ?? 0, quizzes: d.quizzes.filter((x) => x.courseId === id).length });

function summary(d: SampleDb, c: any) {
  const last = c.messages[c.messages.length - 1];
  const other = c.members.find((x: any) => x.id !== d.me.id);
  return {
    id: c.id, isGroup: c.isGroup, isOfficial: c.isOfficial, title: c.title, avatarUrl: null,
    otherUserId: c.isGroup ? null : other?.id ?? null, online: !c.isGroup && !c.isOfficial && other?.id !== d.people.meera.id,
    lastSeenAt: at(0, 8), memberCount: c.members.length, typing: [],
    lastMessage: last ? { id: last.id, body: last.body.slice(0, 140), type: last.type, senderId: last.senderId, createdAt: last.createdAt, deletedAt: last.deletedAt, attachmentName: last.attachmentName, mine: last.senderId === d.me.id } : null,
    unread: c.unread ?? (last && last.senderId !== d.me.id && c.id !== 'sample-conv-welcome' ? 1 : 0),
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

  [/^\/api\/courses\/([^/]+)\/board$/, ({ db: d, m }) => {
    const c = course(d, m[1]);
    if (!c) return fail('Course not found.', 404);
    const canManage = d.teacherView && c.teacher.id === d.me.id;
    const b = d.board[c.id];
    const base = { course: { ...c, _count: { enrollments: d.classmates.length + (canManage ? 0 : 1) } }, canManage, announcements: b.announcements, materials: b.materials, readings: b.readings, events: b.events };
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
  [/^\/api\/chat\/conversations$/, ({ db: d }) => ok({ conversations: d.conversations.map((c) => summary(d, c)).sort((a, b) => +new Date(b.activityAt) - +new Date(a.activityAt)), me: d.me.id })],
  [/^\/api\/chat\/conversations\/([^/]+)\/messages$/, ({ db: d, m, q }) => {
    const c = d.conversations.find((x) => x.id === m[1]); if (!c) return fail('Conversation not found.', 404);
    c.unread = 0;
    if (q.get('before')) return ok({ conversation: null, typing: [], messages: [], hasMore: false, me: d.me.id });
    return ok({
      conversation: { id: c.id, isGroup: c.isGroup, isOfficial: c.isOfficial, title: c.title, avatarUrl: null, myRole: 'ADMIN', members: c.members.map((u: any) => ({ id: u.id, name: u.name, avatar: null, role: u.role, groupRole: u.id === d.me.id ? 'ADMIN' : 'MEMBER', online: u.id !== d.people.meera.id, lastSeenAt: at(0, 8), lastReadAt: new Date().toISOString() })) },
      typing: [], messages: c.messages, hasMore: false, me: d.me.id,
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
  [/^\/impact\/leaderboard$/, ({ db: d }) => ok(d.leaderboard)],
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
];

// ── Write routes (in-memory only) ──────────────────────────────────────
const WRITE: [string, RegExp, (c: Ctx) => Result][] = [
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
    const message = {
      id: sid('msg'), conversationId: c.id, senderId: d.me.id, body: body.body ?? '', type: body.type ?? (body.attachmentUrl ? 'FILE' : 'TEXT'),
      attachmentUrl: body.attachmentUrl ?? null, attachmentName: body.attachmentName ?? null, attachmentSize: body.attachmentSize ?? null, attachmentMime: body.attachmentMime ?? null,
      metadata: body.metadata ?? null, createdAt: new Date().toISOString(), editedAt: null, deletedAt: null,
      replyTo: reply ? { id: reply.id, body: reply.body, type: reply.type, sender: { id: reply.senderId, name: reply.sender.name } } : null,
      reactions: {}, sender: { id: d.me.id, name: d.me.name, avatar: null },
    };
    c.messages.push(message);
    return ok(message, 201);
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
