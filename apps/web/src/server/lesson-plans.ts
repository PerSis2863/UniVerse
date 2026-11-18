import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { courseAccess } from '@/lib/course-access';
import { DAY_RE } from '@/lib/lesson-plan';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { str, strings, text, type Body } from './body';
import { publish } from './realtime';

// M293: the term lesson planner. A course's teachers plan each class of the term (the dates come from
// its timetable slots, worked out in the browser so times stay in the teacher's own time zone): topic,
// goals, homework and the materials it uses, then put the lessons in the calendar, where enrolled
// students see each class's topic. Students read the plan; only the course's teachers change it.

const MAX_LESSONS = 400, MAX_SAVE = 60;
const clip = (v: unknown, n: number) => (str(v) ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const long = (v: unknown, n: number) => text(v).trim().slice(0, n) || null;
const BATCH = (courseId: string) => `lessons:${courseId}`;
const readIds = (s: string) => { try { const v = JSON.parse(s); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; } };

async function accessOf(u: SessionUser, courseId: string) {
  const a = await courseAccess(courseId, u);
  if (!a) throw new NotFoundException('Course not found.');
  return a;
}

/** GET /lesson-plans?courseId=: the timetable slots, materials, module titles and every planned lesson. */
export async function lessonPlan(u: SessionUser, courseId: string) {
  const a = await accessOf(u, courseId);
  const [slots, materials, modules, lessons] = await Promise.all([
    prisma.timetableSlot.findMany({ where: { courseId }, select: { id: true, dayOfWeek: true, startTime: true, endTime: true, type: true }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] }),
    prisma.material.findMany({ where: { courseId }, select: { id: true, title: true }, orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.courseModule.findMany({ where: { courseId, ...(a.canManage ? {} : { published: true }) }, select: { title: true }, orderBy: { position: 'asc' }, take: 60 }),
    prisma.lessonPlan.findMany({ where: { courseId }, orderBy: [{ day: 'asc' }], take: MAX_LESSONS }),
  ]);
  return {
    canEdit: a.canManage,
    slots, materials, modules: modules.map((m) => m.title),
    lessons: lessons.map((l) => ({ day: l.day, slotId: l.slotId, topic: l.topic, goals: l.goals, homework: l.homework, materialIds: readIds(l.materialIds), done: l.done, inCalendar: !!l.eventId })),
  };
}

/**
 * POST /lesson-plans { courseId, lessons: [{ day, slotId, startAt, endAt, topic, goals?, homework?, materialIds?, done? }] }:
 * saves up to 60 lessons at once (a lesson with no topic is removed from the plan).
 */
export async function saveLessons(u: SessionUser, b: Body) {
  const courseId = clip(b.courseId, 40);
  const a = await accessOf(u, courseId);
  if (!a.canManage) throw new ForbiddenException('Only the course’s teachers can change its lesson plan.');
  const rows = (Array.isArray(b.lessons) ? b.lessons : []).slice(0, MAX_SAVE) as Body[];
  if (!rows.length) throw new BadRequestException('Nothing to save.');
  const [slots, materials] = await Promise.all([
    prisma.timetableSlot.findMany({ where: { courseId }, select: { id: true } }),
    prisma.material.findMany({ where: { courseId }, select: { id: true }, take: 500 }),
  ]);
  const slotIds = new Set(slots.map((s) => s.id)), materialIds = new Set(materials.map((m) => m.id));
  const when = (v: unknown) => { const t = Date.parse(str(v) ?? ''); return Number.isFinite(t) ? new Date(t) : null; };
  let saved = 0, removed = 0;
  // shortcut: one statement per lesson (at most 60, a term's batch from the planner); D1 has no upsert-many.
  for (const r of rows) {
    const day = clip(r.day, 10), slotId = clip(r.slotId, 40);
    if (!DAY_RE.test(day) || !slotIds.has(slotId)) continue;
    const topic = clip(r.topic, 160);
    const key = { courseId_day_slotId: { courseId, day, slotId } };
    if (!topic) { removed += (await prisma.lessonPlan.deleteMany({ where: { courseId, day, slotId } })).count; continue; }
    const data = {
      topic, goals: long(r.goals, 1000), homework: long(r.homework, 1000),
      materialIds: JSON.stringify(strings(r.materialIds).filter((id) => materialIds.has(id)).slice(0, 10)),
      done: r.done === true, startAt: when(r.startAt), endAt: when(r.endAt),
    };
    await prisma.lessonPlan.upsert({ where: key, create: { courseId, day, slotId, createdById: u.id, ...data }, update: data });
    saved++;
  }
  return { saved, removed };
}

/**
 * POST /lesson-plans/calendar { courseId }: the planned lessons from today on become course events in the calendar
 * (titled "CODE: topic"), replacing the ones sent before, so enrolled students see what each class is about.
 */
export async function lessonsToCalendar(u: SessionUser, b: Body) {
  const courseId = clip(b.courseId, 40);
  const a = await accessOf(u, courseId);
  if (!a.canManage) throw new ForbiddenException('Only the course’s teachers can do that.');
  const today = new Date().toISOString().slice(0, 10);
  const lessons = await prisma.lessonPlan.findMany({ where: { courseId, day: { gte: today }, startAt: { not: null }, endAt: { not: null } }, orderBy: { day: 'asc' }, take: 150 });
  await prisma.calendarEvent.deleteMany({ where: { batch: BATCH(courseId), startAt: { gte: new Date(`${today}T00:00:00Z`) } } });
  const code = a.course.code;
  // Groups of 8 (about 10 values each, D1 takes 100 a statement).
  for (let i = 0; i < lessons.length; i += 8) {
    await prisma.calendarEvent.createMany({
      data: lessons.slice(i, i + 8).map((l) => ({ userId: u.id, courseId, batch: BATCH(courseId), type: 'PERSONAL', title: `${code}: ${l.topic}`.slice(0, 200), description: [l.goals, l.homework ? `Homework: ${l.homework}` : null].filter(Boolean).join('\n\n') || null, startAt: l.startAt!, endAt: l.endAt! })),
    });
  }
  const events = await prisma.calendarEvent.findMany({ where: { batch: BATCH(courseId), startAt: { gte: new Date(`${today}T00:00:00Z`) } }, select: { id: true, startAt: true } });
  // The event ids go back on their lessons by start time (one update per lesson, at most 150 → kept to 40 here).
  for (const l of lessons.slice(0, 40)) {
    const e = events.find((x) => x.startAt.getTime() === l.startAt!.getTime());
    if (e && e.id !== l.eventId) await prisma.lessonPlan.update({ where: { id: l.id }, data: { eventId: e.id } });
  }
  const students = await prisma.enrollment.findMany({ where: { courseId }, select: { studentId: true }, take: 1000 });
  await publish(students.map((s) => s.studentId), { type: 'refresh', keys: ['/calendar/my'] });
  return { sent: lessons.length };
}
