import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { cleanTimeZone, dayBounds } from '@/lib/home-time';
import { attendedRate, cleanPosition, cleanSeating, isChronic, MARKS, nearCampus, suggestFromCall, type Mark } from '@/lib/attendance-rules';
import { assertGradesCourse } from './access';
import { alertAbsence } from './guardians';
import { later, notify, notifyMany } from './email';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { publish } from './realtime';

// Attendance (Stage 5 · Q11): the teacher's register (marks, each student's record, many at once),
// what today's class call says, excuse requests, the seating chart, frequent-absence alerts to
// guardians (in the app, never email) and the school's optional location check for check-ins.

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayOf = (raw: unknown): string => {
  const s = typeof raw === 'string' && DAY.test(raw) && !Number.isNaN(Date.parse(raw)) ? raw : null;
  if (!s) throw new BadRequestException('Pick a day (YYYY-MM-DD).');
  return s;
};
// Attendance rows are stored for the day itself (midnight UTC of that date), as the register always has.
const stamp = (day: string) => new Date(`${day}T00:00:00.000Z`);
const dbDate = (d: Date) => d.toISOString().replace('Z', '+00:00');
const RECENT = 8;

/** GET: the register for a day: each student's mark, their record in this course and their last days. */
export async function register(courseId: string, user: SessionUser, dayRaw: unknown) {
  await assertGradesCourse(courseId, user);
  const day = dayOf(dayRaw);
  const [course, enrolments, today, totals, recent, pending] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, name: true, seating: true } }),
    prisma.enrollment.findMany({ where: { courseId }, select: { student: { select: { id: true, name: true, email: true, avatar: true } } }, orderBy: { student: { name: 'asc' } }, take: 500 }),
    prisma.attendance.findMany({ where: { courseId, date: stamp(day) }, select: { studentId: true, status: true } }),
    prisma.attendance.groupBy({ by: ['studentId', 'status'], where: { courseId }, _count: { _all: true } }),
    // The class's last few marked days, for each student's recent row.
    prisma.attendance.findMany({ where: { courseId, date: { lte: stamp(day) } }, orderBy: { date: 'desc' }, take: 40 * RECENT, select: { studentId: true, status: true, date: true } }),
    prisma.attendanceExcuse.count({ where: { courseId, status: 'PENDING' } }),
  ]);
  if (!course) throw new NotFoundException('Course not found.');
  const mark = new Map(today.map((a) => [a.studentId, a.status as Mark]));
  const counts = new Map<string, Mark[]>();
  for (const t of totals) counts.set(t.studentId, [...(counts.get(t.studentId) ?? []), ...Array<Mark>(t._count._all).fill(t.status as Mark)]);
  const last = new Map<string, Mark[]>();
  for (const r of recent) { const l = last.get(r.studentId) ?? []; if (l.length < RECENT) l.push(r.status as Mark); last.set(r.studentId, l); }
  const ids = new Set(enrolments.map((e) => e.student.id));
  return {
    course: { id: course.id, code: course.code, name: course.name },
    day,
    students: enrolments.map(({ student: s }) => {
      const r = attendedRate(counts.get(s.id) ?? []);
      const recentMarks = last.get(s.id) ?? [];
      return { id: s.id, name: s.name, email: s.email, avatar: s.avatar, mark: mark.get(s.id) ?? null, record: { attended: r.attended, counted: r.counted, rate: r.rate }, recent: recentMarks, chronic: isChronic(recentMarks) };
    }),
    pendingExcuses: pending,
    seating: cleanSeating(course.seating, ids),
  };
}

/** POST { day, marks: [{ studentId, status }] }: many marks at once (one statement per 18 marks). */
export async function markMany(courseId: string, user: SessionUser, b: Record<string, unknown>) {
  await assertGradesCourse(courseId, user);
  const day = dayOf(b.day);
  const want = (Array.isArray(b.marks) ? b.marks : []).flatMap((m) => {
    const o = (m ?? {}) as Record<string, unknown>;
    return typeof o.studentId === 'string' && MARKS.includes(o.status as Mark) ? [{ studentId: o.studentId, status: o.status as Mark }] : [];
  }).slice(0, 90);
  if (!want.length) throw new BadRequestException('Nothing to mark.');
  const [enrolled, before] = await Promise.all([
    prisma.enrollment.findMany({ where: { courseId, studentId: { in: want.map((w) => w.studentId) } }, select: { studentId: true } }),
    prisma.attendance.findMany({ where: { courseId, date: stamp(day), studentId: { in: want.map((w) => w.studentId) } }, select: { studentId: true, status: true } }),
  ]);
  const ok = new Set(enrolled.map((e) => e.studentId));
  const marks = [...new Map(want.filter((w) => ok.has(w.studentId)).map((w) => [w.studentId, w])).values()];
  if (!marks.length) throw new BadRequestException('Those students aren’t in this course.');
  const now = dbDate(new Date()), date = dbDate(stamp(day));
  // D1 takes up to 100 values a query: 5 a mark, 18 marks a statement.
  for (let i = 0; i < marks.length; i += 18) {
    const part = marks.slice(i, i + 18);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "attendance" ("id", "studentId", "courseId", "date", "status", "createdAt") VALUES ${part.map(() => '(lower(hex(randomblob(12))), ?, ?, ?, ?, ?)').join(', ')}
       ON CONFLICT("studentId", "courseId", "date") DO UPDATE SET "status" = excluded."status"`,
      ...part.flatMap((m) => [m.studentId, courseId, date, m.status, now]),
    );
  }
  const was = new Map(before.map((a) => [a.studentId, a.status]));
  const newlyAbsent = marks.filter((m) => m.status === 'ABSENT' && was.get(m.studentId) !== 'ABSENT').map((m) => m.studentId);
  if (newlyAbsent.length) {
    // Guardians who asked for an alert on each absence (as one mark at a time does), and
    // frequent absences to the student's parents in the app.
    later(async () => {
      for (const s of newlyAbsent.slice(0, 5)) await alertAbsence(s, courseId, day);
      await frequentAbsenceAlerts(courseId, newlyAbsent);
    });
  }
  publish(marks.map((m) => m.studentId).slice(0, 40), { type: 'refresh', keys: ['/attendance/student'] });
  return { marked: marks.length };
}

/** Parents of students now absent often in this course hear about it in the app, once a week. */
async function frequentAbsenceAlerts(courseId: string, studentIds: string[]) {
  const ids = studentIds.slice(0, 40);
  const [rows, course, enrolments] = await Promise.all([
    prisma.attendance.findMany({ where: { courseId, studentId: { in: ids } }, orderBy: { date: 'desc' }, take: ids.length * 12, select: { studentId: true, status: true } }),
    prisma.course.findUnique({ where: { id: courseId }, select: { code: true, name: true } }),
    prisma.enrollment.findMany({ where: { courseId, studentId: { in: ids } }, select: { id: true, studentId: true, absenceAlertAt: true, student: { select: { name: true } } } }),
  ]);
  const byStudent = new Map<string, Mark[]>();
  for (const r of rows) { const l = byStudent.get(r.studentId) ?? []; if (l.length < 12) l.push(r.status as Mark); byStudent.set(r.studentId, l); }
  const weekAgo = Date.now() - 7 * 86_400_000;
  // At most 8 a time (each is a notification for the parents): D1 allows 50 queries a request.
  const due = enrolments.filter((e) => isChronic(byStudent.get(e.studentId) ?? []) && (!e.absenceAlertAt || e.absenceAlertAt.getTime() < weekAgo)).slice(0, 8);
  if (!due.length || !course) return 0;
  const links = await prisma.guardianLink.findMany({ where: { studentId: { in: due.map((d) => d.studentId) } }, select: { guardianId: true, studentId: true } });
  for (const d of due) {
    const parents = links.filter((l) => l.studentId === d.studentId).map((l) => l.guardianId);
    const r = attendedRate(byStudent.get(d.studentId) ?? []);
    const first = d.student.name.split(/\s+/)[0];
    if (parents.length) {
      await notifyMany(parents, {
        type: 'warning', email: false, courseId,
        title: `${first} has missed several ${course.code} classes`,
        body: `${r.counted ? `${Math.round((r.rate ?? 0) * 100)} % attended lately` : 'Several absences'} in ${course.name}. You can message the teacher from the parent app.`,
        link: '/parent',
      });
    }
  }
  await prisma.enrollment.updateMany({ where: { id: { in: due.map((d) => d.id) } }, data: { absenceAlertAt: new Date() } });
  return due.length;
}

/** GET ?day=&tz=&threshold=: what today's class call says about each student (nothing is saved). */
export async function fromClassCall(courseId: string, user: SessionUser, q: { day?: unknown; tz?: unknown; threshold?: unknown }) {
  await assertGradesCourse(courseId, user);
  const day = dayOf(q.day);
  const tz = cleanTimeZone(q.tz);
  const threshold = [0.5, 0.75, 0.9].includes(Number(q.threshold)) ? Number(q.threshold) : 0.75;
  const { start, end } = dayBounds(day, tz);
  const [stats, enrolments] = await Promise.all([
    prisma.callStat.groupBy({ by: ['userId'], where: { callId: `c_${courseId}`, createdAt: { gte: new Date(start), lt: new Date(end) } }, _sum: { seconds: true } }),
    prisma.enrollment.findMany({ where: { courseId }, select: { studentId: true } }),
  ]);
  const seconds = new Map(stats.map((s) => [s.userId, s._sum.seconds ?? 0]));
  const students = new Set(enrolments.map((e) => e.studentId));
  // How long the class was: the longest time anyone (usually the teacher) was in it.
  const length = Math.max(0, ...stats.map((s) => s._sum.seconds ?? 0));
  if (!length) return { day, length: 0, threshold, suggestions: [] as { studentId: string; seconds: number; suggest: Mark }[] };
  return {
    day, length, threshold,
    suggestions: [...students].map((id) => ({ studentId: id, seconds: seconds.get(id) ?? 0, suggest: suggestFromCall(seconds.get(id) ?? 0, length, threshold) })),
  };
}

// ─── Excuse requests ─────────────────────────────────────────────────────────

const excuseSelect = { id: true, courseId: true, date: true, reason: true, fileUrl: true, fileName: true, status: true, note: true, decidedAt: true, createdAt: true, course: { select: { code: true, name: true } } } as const;

/** POST { courseId, day, reason, fileUrl?, fileName? }: a student asks to be excused for a class day. */
export async function requestExcuse(user: SessionUser, b: Record<string, unknown>) {
  if (user.role !== 'STUDENT') throw new ForbiddenException('Students ask to be excused.');
  const courseId = typeof b.courseId === 'string' ? b.courseId : '';
  const day = dayOf(b.day);
  const reason = typeof b.reason === 'string' ? b.reason.trim().slice(0, 1000) : '';
  if (reason.length < 3) throw new BadRequestException('Say why, in a few words.');
  if (Date.parse(day) > Date.now() + 60 * 86_400_000) throw new BadRequestException('Pick a day within the next two months.');
  const enrolled = await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId: user.id, courseId } }, select: { course: { select: { code: true, teacherId: true } } } });
  if (!enrolled) throw new NotFoundException('You aren’t in that course.');
  // Only an uploaded file of ours (Settings uploads go to /api/files/<id>).
  const fileUrl = typeof b.fileUrl === 'string' && /^\/api\/files\/[A-Za-z0-9_-]{16,}(\/[^/]*)?$/.test(b.fileUrl) ? b.fileUrl : null;
  const fileName = fileUrl && typeof b.fileName === 'string' ? b.fileName.slice(0, 120) : null;
  const open = await prisma.attendanceExcuse.count({ where: { studentId: user.id, status: 'PENDING' } });
  if (open >= 20) throw new BadRequestException('You have 20 requests waiting already.');
  const created = await prisma.attendanceExcuse.create({ data: { studentId: user.id, courseId, date: stamp(day), reason, fileUrl, fileName }, select: excuseSelect });
  if (enrolled.course.teacherId) {
    await notify(enrolled.course.teacherId, { type: 'info', email: false, courseId, title: `${user.name} asked to be excused`, body: `${enrolled.course.code} · ${day}: ${reason.slice(0, 120)}`, link: `/teacher/attendance?course=${courseId}&tab=excuses` });
  }
  return created;
}

/** GET: my requests (a student), newest first. */
export async function myExcuses(user: SessionUser) {
  return prisma.attendanceExcuse.findMany({ where: { studentId: user.id }, orderBy: { createdAt: 'desc' }, take: 50, select: excuseSelect });
}

/** GET: a course's requests for its teachers: waiting ones first, then the last month's. */
export async function courseExcuses(courseId: string, user: SessionUser) {
  await assertGradesCourse(courseId, user);
  return prisma.attendanceExcuse.findMany({
    where: { courseId, OR: [{ status: 'PENDING' }, { decidedAt: { gt: new Date(Date.now() - 30 * 86_400_000) } }] },
    orderBy: [{ status: 'desc' }, { date: 'desc' }], take: 100,
    select: { ...excuseSelect, student: { select: { id: true, name: true } } },
  });
}

/** POST { approve, note? }: approved marks the day Excused; the student is told in the app. */
export async function decideExcuse(id: string, user: SessionUser, b: Record<string, unknown>) {
  const ex = await prisma.attendanceExcuse.findUnique({ where: { id }, select: { id: true, courseId: true, studentId: true, date: true, status: true, course: { select: { code: true } } } });
  if (!ex) throw new NotFoundException('Request not found.');
  await assertGradesCourse(ex.courseId, user);
  if (ex.status !== 'PENDING') throw new BadRequestException('That request has been answered already.');
  const approve = b.approve === true;
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 300) || null : null;
  await prisma.attendanceExcuse.update({ where: { id }, data: { status: approve ? 'APPROVED' : 'DECLINED', decidedById: user.id, decidedAt: new Date(), note } });
  if (approve) {
    await prisma.attendance.upsert({
      where: { studentId_courseId_date: { studentId: ex.studentId, courseId: ex.courseId, date: ex.date } },
      update: { status: 'EXCUSED' }, create: { studentId: ex.studentId, courseId: ex.courseId, date: ex.date, status: 'EXCUSED' },
    });
  }
  const day = ex.date.toISOString().slice(0, 10);
  await notify(ex.studentId, { type: 'info', email: false, courseId: ex.courseId, title: approve ? `Excused: ${ex.course.code} on ${day}` : `Not excused: ${ex.course.code} on ${day}`, body: note ?? (approve ? 'Your teacher accepted your request.' : 'Your teacher declined your request.'), link: '/student/attendance' });
  return { ok: true, status: approve ? 'APPROVED' : 'DECLINED' };
}

// ─── Seating chart ───────────────────────────────────────────────────────────

/** PUT { rows, cols, seats }: the course's seating chart (only its own students, each once). */
export async function saveSeating(courseId: string, user: SessionUser, b: Record<string, unknown>) {
  await assertGradesCourse(courseId, user);
  const students = new Set((await prisma.enrollment.findMany({ where: { courseId }, select: { studentId: true }, take: 500 })).map((e) => e.studentId));
  const seating = cleanSeating(b, students);
  await prisma.course.update({ where: { id: courseId }, data: { seating: JSON.stringify(seating) } });
  return seating;
}

// ─── The location check for class check-ins ──────────────────────────────────

export async function checkinPolicy() {
  const p = await prisma.schoolPolicy.findUnique({ where: { id: 'main' }, select: { checkinGeo: true, checkinLat: true, checkinLng: true, checkinRadius: true } }).catch(() => null);
  return { on: !!p?.checkinGeo && p.checkinLat != null && p.checkinLng != null, lat: p?.checkinLat ?? null, lng: p?.checkinLng ?? null, radius: p?.checkinRadius ?? 300 };
}

/** PUT { on, lat, lng, radius }: a school admin turns the check-in location check on or off. */
export async function setCheckinPolicy(user: SessionUser, b: Record<string, unknown>) {
  if (user.role !== 'ADMIN' && !user.owner) throw new ForbiddenException('Only school admins can change this.');
  const on = b.on === true;
  const pos = cleanPosition({ lat: b.lat, lng: b.lng });
  if (on && !pos) throw new BadRequestException('Set the campus’s position first.');
  const radius = Math.min(5000, Math.max(50, Math.round(Number(b.radius) || 300)));
  const data = { checkinGeo: on, checkinLat: pos?.lat ?? null, checkinLng: pos?.lng ?? null, checkinRadius: radius, updatedAt: new Date(), updatedById: user.id };
  await prisma.schoolPolicy.upsert({ where: { id: 'main' }, update: data, create: { id: 'main', ...data } });
  return checkinPolicy();
}

/** For a check-in: throws unless the school's check is off or the phone is near the campus. The
 *  position is only compared here, never kept. */
export async function assertOnCampus(raw: unknown) {
  const p = await checkinPolicy();
  if (!p.on) return;
  const pos = cleanPosition(raw);
  if (!pos) throw new BadRequestException('Your school checks you’re on campus: allow UniVerse to use your location, then check in again.');
  if (!nearCampus(pos, { lat: p.lat!, lng: p.lng!, radius: p.radius })) throw new BadRequestException('You don’t seem to be on campus. Check in from the classroom (or ask your teacher to mark you).');
}
