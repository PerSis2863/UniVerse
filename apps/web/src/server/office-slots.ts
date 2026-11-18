import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { notify } from './email';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from './http';
import { oneOf, str, type Body } from './body';
import { publish } from './realtime';
import { slotTimes, when } from './parent-meetings';
import { shortName } from './play';

// M295: office hours you can book, with a waiting list. A teacher opens times (a span cut into meetings
// of 10–60 minutes, by video in their office-hours room o_<teacherId> or in a place); students in their
// courses book a free one (claimed by a guarded update, so two can't take the same time), or join its
// waiting list. When a booking is cancelled, the first one waiting gets the time and is told (in-app and
// push, never email). A student holds at most two coming bookings with one teacher.

export const LENGTHS = [10, 15, 20, 30, 45, 60] as const;
const MODES = ['VIDEO', 'IN_PERSON'] as const;
const MAX_NEW = 40, MAX_AHEAD = 90 * 86_400_000, MAX_SPAN = 10 * 3600_000, PER_TEACHER = 2;
const isStaff = (u: SessionUser) => u.role === 'TEACHER' || u.role === 'ADMIN';
const clip = (v: unknown, n: number) => (str(v) ?? '').replace(/\s+/g, ' ').trim().slice(0, n) || null;
const keys = ['/office-slots'];

/** The teachers of a student's courses. */
async function teachersOf(studentId: string) {
  const rows = await prisma.course.findMany({ where: { enrollments: { some: { studentId } } }, select: { code: true, teacher: { select: { id: true, name: true } } }, take: 60 });
  const out = new Map<string, { id: string; name: string; courses: string[] }>();
  for (const r of rows) out.set(r.teacher.id, { ...r.teacher, courses: [...(out.get(r.teacher.id)?.courses ?? []), r.code] });
  return out;
}

/** GET /office-slots: a teacher's coming times with who booked and how many wait; a student's teachers' times. */
export async function officeSlots(u: SessionUser) {
  const now = new Date();
  if (isStaff(u)) {
    const slots = await prisma.officeSlot.findMany({ where: { teacherId: u.id, startAt: { gte: new Date(now.getTime() - 3600_000) } }, orderBy: { startAt: 'asc' }, take: 120, include: { _count: { select: { waiting: true } } } });
    const people = await prisma.user.findMany({ where: { id: { in: [...new Set(slots.flatMap((s) => (s.studentId ? [s.studentId] : [])))].slice(0, 90) } }, select: { id: true, name: true } });
    return {
      role: 'teacher' as const, lengths: LENGTHS,
      slots: slots.map((s) => ({ id: s.id, startAt: s.startAt, durationMin: s.durationMin, mode: s.mode, location: s.location, topic: s.topic, student: s.studentId ? people.find((p) => p.id === s.studentId)?.name ?? 'A student' : null, waiting: s._count.waiting })),
    };
  }
  const teachers = await teachersOf(u.id);
  if (!teachers.size) return { role: 'student' as const, teachers: [] };
  const slots = await prisma.officeSlot.findMany({
    where: { teacherId: { in: [...teachers.keys()].slice(0, 90) }, startAt: { gte: now, lte: new Date(now.getTime() + 30 * 86_400_000) } },
    orderBy: { startAt: 'asc' }, take: 300, include: { waiting: { select: { studentId: true, createdAt: true }, orderBy: { createdAt: 'asc' } } },
  });
  return {
    role: 'student' as const,
    teachers: [...teachers.values()].map((t) => ({
      ...t,
      slots: slots.filter((s) => s.teacherId === t.id).map((s) => {
        const place = s.waiting.findIndex((w) => w.studentId === u.id);
        return { id: s.id, startAt: s.startAt, durationMin: s.durationMin, mode: s.mode, location: s.location, mine: s.studentId === u.id, taken: !!s.studentId && s.studentId !== u.id, topic: s.studentId === u.id ? s.topic : null, waiting: s.waiting.length, place: place >= 0 ? place + 1 : null, callId: s.mode === 'VIDEO' ? `o_${t.id}` : null };
      }),
    })).filter((t) => t.slots.length),
  };
}

/** POST /office-slots { startAt, endAt, length, gap?, mode, location? } (teachers): the span cut into bookable times. */
export async function openSlots(u: SessionUser, b: Body) {
  if (!isStaff(u)) throw new ForbiddenException('Only teachers open office hours.');
  const start = Date.parse(str(b.startAt) ?? ''), end = Date.parse(str(b.endAt) ?? '');
  const length = Number(b.length), gap = Math.min(Math.max(Number(b.gap) || 0, 0), 30);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new BadRequestException('Choose when the times start and end.');
  if (start < Date.now() - 60_000 || start > Date.now() + MAX_AHEAD) throw new BadRequestException('Open times between now and 90 days ahead.');
  if (end - start > MAX_SPAN) throw new BadRequestException('Open at most 10 hours at a time.');
  if (!(LENGTHS as readonly number[]).includes(length)) throw new BadRequestException('Choose a length for each meeting.');
  const mode = oneOf(MODES, b.mode) ? b.mode : 'VIDEO';
  const location = mode === 'IN_PERSON' ? clip(b.location, 120) : null;
  if (mode === 'IN_PERSON' && !location) throw new BadRequestException('Say where you’ll meet.');
  const mine = await prisma.officeSlot.findMany({ where: { teacherId: u.id, startAt: { gte: new Date(start - 3 * 3600_000), lt: new Date(end) } }, select: { startAt: true, durationMin: true } });
  const times = slotTimes(start, end, length, gap, mine.map((m) => ({ start: m.startAt.getTime(), end: m.startAt.getTime() + m.durationMin * 60_000 }))).slice(0, MAX_NEW);
  if (!times.length) throw new BadRequestException('Those times overlap ones you already opened.');
  // Groups of 12 (6 values each; D1 takes 100 a statement).
  for (let i = 0; i < times.length; i += 12) {
    await prisma.officeSlot.createMany({ data: times.slice(i, i + 12).map((t) => ({ teacherId: u.id, startAt: new Date(t), durationMin: length, mode, location })) });
  }
  return { opened: times.length };
}

async function slotOf(id: string) {
  const s = await prisma.officeSlot.findUnique({ where: { id }, include: { waiting: { orderBy: { createdAt: 'asc' }, select: { studentId: true, topic: true } } } });
  if (!s) throw new NotFoundException('That time isn’t there any more.');
  return s;
}


/** The first one waiting gets a time given back; they're told. Returns whether someone got it. */
async function giveToNext(slotId: string, teacherName: string): Promise<boolean> {
  const s = await slotOf(slotId);
  for (const w of s.waiting) {
    const got = await prisma.officeSlot.updateMany({ where: { id: slotId, studentId: null }, data: { studentId: w.studentId, topic: w.topic, bookedAt: new Date() } });
    await prisma.officeWaitlist.delete({ where: { slotId_studentId: { slotId, studentId: w.studentId } } }).catch(() => null);
    if (got.count) {
      await notify(w.studentId, { title: `You got an office-hours time with ${shortName(teacherName)}`, body: `A time opened up: ${when(s.startAt)}. It’s booked for you; cancel it in Calls if you can’t make it.`, link: '/calls', type: 'reminder', email: false });
      return true;
    }
  }
  return false;
}

/** POST /office-slots/:id/book { topic? } (students in the teacher's courses). */
export async function bookSlot(u: SessionUser, id: string, b: Body) {
  const s = await slotOf(id);
  if (isStaff(u)) throw new ForbiddenException('Students book office hours.');
  if (!(await teachersOf(u.id)).has(s.teacherId)) throw new ForbiddenException('You can book times with your own teachers.');
  if (s.startAt.getTime() < Date.now() + 15 * 60_000) throw new BadRequestException('Book at least 15 minutes ahead.');
  const held = await prisma.officeSlot.count({ where: { teacherId: s.teacherId, studentId: u.id, startAt: { gte: new Date() } } });
  if (held >= PER_TEACHER) throw new BadRequestException(`You can hold ${PER_TEACHER} coming times with one teacher.`);
  const got = await prisma.officeSlot.updateMany({ where: { id, studentId: null }, data: { studentId: u.id, topic: clip(b.topic, 300), bookedAt: new Date() } });
  if (!got.count) throw new ConflictException('Someone just booked that time. Join its waiting list, or pick another.');
  await prisma.officeWaitlist.deleteMany({ where: { slotId: id, studentId: u.id } });
  await notify(s.teacherId, { title: `${shortName(u.name)} booked office hours`, body: `${when(s.startAt)}${clip(b.topic, 300) ? `: ${clip(b.topic, 300)}` : ''}`, link: '/calls', type: 'reminder', email: false });
  publish([s.teacherId], { type: 'refresh', keys });
  return { ok: true };
}

/** POST /office-slots/:id/wait { topic? }: join (or with { leave: true } leave) a taken time's waiting list. */
export async function waitForSlot(u: SessionUser, id: string, b: Body) {
  const s = await slotOf(id);
  if (b.leave === true) { await prisma.officeWaitlist.deleteMany({ where: { slotId: id, studentId: u.id } }); return { ok: true }; }
  if (!(await teachersOf(u.id)).has(s.teacherId)) throw new ForbiddenException('You can wait for your own teachers’ times.');
  if (!s.studentId) throw new BadRequestException('That time is free: book it instead.');
  if (s.studentId === u.id) throw new BadRequestException('That time is yours already.');
  if (s.waiting.length >= 10) throw new BadRequestException('Ten people are waiting already: pick another time.');
  await prisma.officeWaitlist.upsert({ where: { slotId_studentId: { slotId: id, studentId: u.id } }, create: { slotId: id, studentId: u.id, topic: clip(b.topic, 300) }, update: { topic: clip(b.topic, 300) } });
  return { place: s.waiting.filter((w) => w.studentId !== u.id).length + 1 };
}

/** POST /office-slots/:id/cancel: the student gives their time back (the next one waiting gets it). */
export async function cancelBooking(u: SessionUser, id: string) {
  const s = await slotOf(id);
  if (s.studentId !== u.id) throw new ForbiddenException('That time isn’t booked by you.');
  await prisma.officeSlot.updateMany({ where: { id, studentId: u.id }, data: { studentId: null, topic: null, bookedAt: null } });
  const teacher = await prisma.user.findUnique({ where: { id: s.teacherId }, select: { name: true } });
  const moved = s.startAt.getTime() > Date.now() && (await giveToNext(id, teacher?.name ?? 'your teacher'));
  await notify(s.teacherId, { title: `${shortName(u.name)} cancelled office hours`, body: `${when(s.startAt)}${moved ? ': the next one waiting has it now.' : ': the time is free again.'}`, link: '/calls', type: 'reminder', email: false });
  publish([s.teacherId], { type: 'refresh', keys });
  return { ok: true, movedUp: moved };
}

/** DELETE /office-slots/:id (its teacher): removes a time; whoever booked it and everyone waiting is told. */
export async function removeSlot(u: SessionUser, id: string) {
  const s = await slotOf(id);
  if (s.teacherId !== u.id) throw new ForbiddenException('That time isn’t yours.');
  await prisma.officeSlot.delete({ where: { id } });
  const told = [...(s.studentId ? [s.studentId] : []), ...s.waiting.map((w) => w.studentId)];
  // shortcut: one notification each (one booking plus at most ten waiting).
  for (const sid of told) await notify(sid, { title: `${shortName(u.name)} cancelled an office-hours time`, body: `${when(s.startAt)} is no longer open. Pick another time in Calls.`, link: '/calls', type: 'reminder', email: false });
  publish(told, { type: 'refresh', keys });
  return { ok: true };
}
