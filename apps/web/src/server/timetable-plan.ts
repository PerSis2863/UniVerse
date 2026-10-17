import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { str, strings, type Body } from './body';
import { later, notifyMany } from './email';
import { BadRequestException, ForbiddenException } from './http';

// The timetable and exam timetable generators' server side (Stage 5 · Q12). The planning itself
// happens in the admin's browser (src/lib/schedule-solver.ts); this gives it what it needs (courses
// with their teacher and students, rooms with their seats, which courses share students, the
// current week) and saves an accepted plan: a week of classes, or exams on the calendar of every
// student and teacher of the course.

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const SLOT_TYPES = ['LECTURE', 'LAB', 'TUTORIAL'];
const dbDate = (d: Date) => d.toISOString().replace('Z', '+00:00');
const chunks = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
export const MAX_SLOTS = 320, MAX_COURSES = 200, MAX_EXAMS = 200, MAX_NOTIFIED = 900;

function assertAdmin(user: SessionUser) {
  if (user.role !== 'ADMIN' && !user.owner) throw new ForbiddenException('Only admins plan the timetable.');
}

/** Published exam timetables: their name, how many exams, first and last day. */
async function examBatches() {
  const rows = await prisma.calendarEvent.groupBy({ by: ['batch'], where: { batch: { startsWith: 'exam:' } }, _count: { _all: true }, _min: { startAt: true }, _max: { endAt: true } });
  return rows.map((r) => ({ batch: r.batch!, name: r.batch!.slice(5), exams: r._count._all, from: r._min.startAt, to: r._max.endAt }));
}

/** GET: everything both generators need, in one go (five queries). */
export async function planInputs(user: SessionUser) {
  assertAdmin(user);
  const [courses, rooms, slots, pairs, exams] = await Promise.all([
    prisma.course.findMany({
      where: { status: { not: 'ARCHIVED' } },
      orderBy: { code: 'asc' },
      take: 400,
      select: { id: true, code: true, name: true, department: true, color: true, teacherId: true, teacher: { select: { name: true } }, _count: { select: { enrollments: true } } },
    }),
    prisma.room.findMany({ orderBy: { name: 'asc' }, take: 300, select: { id: true, name: true, capacity: true, type: true } }),
    prisma.timetableSlot.findMany({ take: 1500, select: { id: true, courseId: true, dayOfWeek: true, startTime: true, endTime: true, roomId: true, type: true } }),
    // Courses that share students, and how many: a student in both can't be in both at once.
    prisma.$queryRawUnsafe<{ a: string; b: string; n: number | bigint }[]>(
      `SELECT x."courseId" AS a, y."courseId" AS b, COUNT(*) AS n FROM "enrollments" x JOIN "enrollments" y ON x."studentId" = y."studentId" AND x."courseId" < y."courseId" GROUP BY x."courseId", y."courseId" LIMIT 6000`,
    ),
    examBatches(),
  ]);
  return {
    courses: courses.map((c) => ({ id: c.id, code: c.code, name: c.name, department: c.department, color: c.color, teacherId: c.teacherId, teacher: c.teacher?.name ?? null, students: c._count.enrollments })),
    rooms,
    slots,
    overlaps: pairs.map((p) => [p.a, p.b, Number(p.n)] as [string, string, number]),
    exams,
  };
}

interface NewSlot { courseId: string; dayOfWeek: number; startTime: string; endTime: string; roomId: string | null; type: string }
const slotKey = (s: NewSlot) => [s.courseId, s.dayOfWeek, s.startTime, s.endTime, s.roomId ?? '', s.type].join('|');

/** The classes of an accepted week from a request: only for the courses being planned, on real times. */
export function cleanWeek(b: Body): { courseIds: string[]; slots: NewSlot[] } {
  const courseIds = [...new Set(strings(b.courseIds))];
  if (!courseIds.length) throw new BadRequestException('Pick the courses to plan.');
  if (courseIds.length > MAX_COURSES) throw new BadRequestException(`Plan at most ${MAX_COURSES} courses at once (pick a department).`);
  const raw = Array.isArray(b.slots) ? b.slots : [];
  if (raw.length > MAX_SLOTS) throw new BadRequestException(`At most ${MAX_SLOTS} classes at once (pick fewer courses).`);
  const wanted = new Set(courseIds);
  const slots = raw.map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const day = Number(o.dayOfWeek);
    const start = str(o.startTime) ?? '', end = str(o.endTime) ?? '';
    const courseId = str(o.courseId) ?? '';
    if (!wanted.has(courseId) || !Number.isInteger(day) || day < 0 || day > 6 || !TIME.test(start) || !TIME.test(end) || end <= start) {
      throw new BadRequestException('A class in the plan has no course or no proper time.');
    }
    return { courseId, dayOfWeek: day, startTime: start, endTime: end, roomId: str(o.roomId) || null, type: SLOT_TYPES.includes(str(o.type) ?? '') ? (o.type as string) : 'LECTURE' };
  });
  return { courseIds, slots };
}

/**
 * POST { courseIds, slots }: the accepted week for those courses. Classes already there at the same
 * time and room stay (with any cover arranged for them); the new ones are added first and the old
 * ones removed after, so a failure halfway leaves extra classes rather than missing ones, and
 * saving again tidies up.
 */
export async function saveWeek(user: SessionUser, b: Body) {
  assertAdmin(user);
  const { courseIds, slots } = cleanWeek(b);
  const roomIds = [...new Set(slots.flatMap((s) => (s.roomId ? [s.roomId] : [])))];
  const [courses, rooms, existing] = await Promise.all([
    Promise.all(chunks(courseIds, 90).map((ids) => prisma.course.findMany({ where: { id: { in: ids } }, select: { id: true } }))).then((r) => r.flat()),
    Promise.all(chunks(roomIds, 90).map((ids) => prisma.room.findMany({ where: { id: { in: ids } }, select: { id: true } }))).then((r) => r.flat()),
    Promise.all(chunks(courseIds, 90).map((ids) => prisma.timetableSlot.findMany({ where: { courseId: { in: ids } }, select: { id: true, courseId: true, dayOfWeek: true, startTime: true, endTime: true, roomId: true, type: true } }))).then((r) => r.flat()),
  ]);
  if (courses.length !== courseIds.length) throw new BadRequestException('One of those courses no longer exists.');
  if (rooms.length !== roomIds.length) throw new BadRequestException('One of those rooms no longer exists.');
  // Keep each class that's already there once; the rest of the old ones go.
  const old = new Map<string, string[]>();
  for (const s of existing) old.set(slotKey(s), [...(old.get(slotKey(s)) ?? []), s.id]);
  const add: NewSlot[] = [];
  for (const s of slots) {
    const ids = old.get(slotKey(s));
    if (ids?.length) ids.shift(); else add.push(s);
  }
  const remove = [...old.values()].flat();
  const now = dbDate(new Date());
  // D1 takes up to 100 values a query: 6 a class, 16 classes a statement.
  for (const part of chunks(add, 16)) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "timetable_slots" ("id", "courseId", "dayOfWeek", "startTime", "endTime", "roomId", "type", "createdAt", "updatedAt") VALUES ${part.map(() => `(lower(hex(randomblob(12))), ?, ?, ?, ?, ?, ?, '${now}', '${now}')`).join(', ')}`,
      ...part.flatMap((s) => [s.courseId, s.dayOfWeek, s.startTime, s.endTime, s.roomId, s.type]),
    );
  }
  for (const ids of chunks(remove, 90)) await prisma.timetableSlot.deleteMany({ where: { id: { in: ids } } });
  return { added: add.length, removed: remove.length, kept: slots.length - add.length };
}

/**
 * POST { name, exams: [{ courseId, startAt, endAt, rooms }] }: publishes an exam timetable onto the
 * calendars of each course's students and teaching team, replacing one published under the same
 * name; students are told in the app (never email).
 */
export async function publishExams(user: SessionUser, b: Body) {
  assertAdmin(user);
  const name = (str(b.name) ?? '').trim().slice(0, 60);
  if (!name) throw new BadRequestException('Name the exam timetable (for example “End of term exams”).');
  const raw = Array.isArray(b.exams) ? b.exams : [];
  if (!raw.length) throw new BadRequestException('There are no exams to publish.');
  if (raw.length > MAX_EXAMS) throw new BadRequestException(`At most ${MAX_EXAMS} exams at once.`);
  const exams = raw.map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const start = new Date(str(o.startAt) ?? ''), end = new Date(str(o.endAt) ?? '');
    const courseId = str(o.courseId) ?? '';
    if (!courseId || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start || end.getTime() - start.getTime() > 12 * 3_600_000) {
      throw new BadRequestException('An exam in the plan has no course or no proper time.');
    }
    return { courseId, start, end, rooms: (str(o.rooms) ?? '').trim().slice(0, 400) };
  });
  const ids = [...new Set(exams.map((e) => e.courseId))];
  const courses = (await Promise.all(chunks(ids, 90).map((part) => prisma.course.findMany({ where: { id: { in: part } }, select: { id: true, code: true, name: true } })))).flat();
  const byId = new Map(courses.map((c) => [c.id, c]));
  if (byId.size !== ids.length) throw new BadRequestException('One of those courses no longer exists.');
  const batch = `exam:${name}`;
  const replaced = await prisma.calendarEvent.deleteMany({ where: { batch } });
  const now = dbDate(new Date());
  // 7 values an exam, 14 exams a statement.
  for (const part of chunks(exams, 14)) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "calendar_events" ("id", "userId", "title", "description", "startAt", "endAt", "type", "courseId", "batch", "createdAt", "updatedAt") VALUES ${part.map(() => `(lower(hex(randomblob(12))), ?, ?, ?, ?, ?, 'EXAM', ?, ?, '${now}', '${now}')`).join(', ')}`,
      ...part.flatMap((e) => {
        const c = byId.get(e.courseId)!;
        return [user.id, `${c.code} exam`, e.rooms ? `${c.name} · ${e.rooms}` : c.name, dbDate(e.start), dbDate(e.end), e.courseId, batch];
      }),
    );
  }
  later(async () => {
    const students = (await Promise.all(chunks(ids, 90).map((part) => prisma.enrollment.findMany({ where: { courseId: { in: part } }, select: { studentId: true }, distinct: ['studentId'], take: MAX_NOTIFIED })))).flat();
    await notifyMany([...new Set(students.map((s) => s.studentId))].slice(0, MAX_NOTIFIED), {
      title: replaced.count ? `The exam timetable changed: ${name}` : `Your exam timetable is out: ${name}`,
      body: 'Your exams are on your calendar, with their rooms.',
      link: '/student/calendar',
      type: 'event',
      email: false,
    });
  });
  return { published: exams.length, replaced: replaced.count, batch };
}

/** DELETE ?batch=exam:<name>: takes a published exam timetable off everyone's calendar. */
export async function removeExams(user: SessionUser, batch: string | null) {
  assertAdmin(user);
  if (!batch?.startsWith('exam:')) throw new BadRequestException('Which exam timetable?');
  const res = await prisma.calendarEvent.deleteMany({ where: { batch } });
  return { removed: res.count };
}
