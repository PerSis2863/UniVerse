import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { officeRoom } from './calls';
import { later, notifyMany } from './email';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { pushService } from './services/push.service';

// Office hours with a queue (Stage 4 · 4.7). A teacher opens office hours for a while (30 minutes to
// 2 hours, maybe with a topic); their students see them in Calls and join the line in the call room
// o_<teacherId> (cloudflare/worker.ts CallRoom: each student waits in order, hears their place and
// the expected wait, and comes in when the teacher taps "Next student"). The teacher keeps private
// notes per student. Closing (or the time running out) stops new students joining; whoever is still
// waiting is told. Opening tells the teacher's students (bell and push, never email), at most once
// every few hours so opening and closing again doesn't flood them.

const MINUTES = new Set([30, 60, 90, 120]);
const TELL_EVERY_MS = 4 * 3600_000;
const isStaff = (u: SessionUser) => u.role === 'TEACHER' || u.role === 'ADMIN';
const openNow = (oh: { open: boolean; until: Date | null } | null) => !!oh?.open && (!oh.until || oh.until > new Date());

/** GET /api/office-hours: a teacher's own office hours (and recent notes); a student's teachers' open ones. */
export async function officeState(user: SessionUser) {
  if (isStaff(user)) {
    const oh = await prisma.officeHours.findUnique({ where: { teacherId: user.id } });
    const open = openNow(oh);
    const room = open ? await officeRoom(user.id) : null;
    const notes = await prisma.officeNote.findMany({ where: { teacherId: user.id }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, body: true, createdAt: true, student: { select: { id: true, name: true, avatar: true } } } });
    return { role: 'teacher' as const, open, until: open ? oh?.until ?? null : null, topic: oh?.topic ?? null, callId: `o_${user.id}`, waiting: room?.waiting ?? 0, inTurn: room?.inTurn ?? 0, avgMin: room?.avgMin ?? 5, notes };
  }
  const courses = await prisma.course.findMany({ where: { enrollments: { some: { studentId: user.id } } }, select: { code: true, teacher: { select: { id: true, name: true, avatar: true } } }, take: 60 });
  const teachers = new Map<string, { id: string; name: string; avatar: string | null; courses: string[] }>();
  for (const c of courses) teachers.set(c.teacher.id, { ...c.teacher, courses: [...(teachers.get(c.teacher.id)?.courses ?? []), c.code] });
  const open = teachers.size ? await prisma.officeHours.findMany({ where: { teacherId: { in: [...teachers.keys()] }, open: true, OR: [{ until: null }, { until: { gt: new Date() } }] } }) : [];
  return {
    role: 'student' as const,
    open: open.map((o) => ({ ...teachers.get(o.teacherId)!, teacherId: o.teacherId, topic: o.topic, until: o.until, callId: `o_${o.teacherId}` })),
  };
}

/** POST /api/office-hours { open, minutes?, topic? } or { extend: true }: a teacher opens, extends
 *  (30 more minutes, up to 3 hours from now) or closes office hours. */
export async function setOfficeHours(user: SessionUser, b: Record<string, unknown>) {
  if (!isStaff(user)) throw new ForbiddenException('Office hours are for teachers.');
  if (b.extend === true) {
    const oh = await prisma.officeHours.findUnique({ where: { teacherId: user.id } });
    if (!openNow(oh)) throw new BadRequestException('Your office hours aren’t open.');
    const until = Math.min(Math.max(oh!.until?.getTime() ?? Date.now(), Date.now()) + 30 * 60_000, Date.now() + 3 * 3600_000);
    await prisma.officeHours.update({ where: { teacherId: user.id }, data: { until: new Date(until), updatedAt: new Date() } });
  } else if (b.open === true) {
    const minutes = MINUTES.has(Number(b.minutes)) ? Number(b.minutes) : 60;
    const topic = typeof b.topic === 'string' ? b.topic.trim().slice(0, 80) || null : null;
    const was = await prisma.officeHours.findUnique({ where: { teacherId: user.id }, select: { open: true, until: true, notifiedAt: true } });
    const tell = !openNow(was) && (!was?.notifiedAt || Date.now() - was.notifiedAt.getTime() > TELL_EVERY_MS);
    const until = new Date(Date.now() + minutes * 60_000);
    const data = { open: true, until, topic, updatedAt: new Date(), ...(tell ? { notifiedAt: new Date() } : {}) };
    await prisma.officeHours.upsert({ where: { teacherId: user.id }, update: data, create: { teacherId: user.id, ...data } });
    if (tell) later(() => tellStudents(user, minutes, topic));
  } else {
    await prisma.officeHours.upsert({ where: { teacherId: user.id }, update: { open: false, updatedAt: new Date() }, create: { teacherId: user.id, open: false } });
    await officeRoom(user.id, true);
  }
  return officeState(user);
}

/** "Office hours are open": a bell notification and a push to each of the teacher's students. */
async function tellStudents(teacher: SessionUser, minutes: number, topic: string | null) {
  const rows = await prisma.enrollment.findMany({ where: { course: { teacherId: teacher.id } }, select: { studentId: true }, distinct: ['studentId'], take: 500 });
  const ids = rows.map((r) => r.studentId).filter((id) => id !== teacher.id);
  if (!ids.length) return;
  const title = `${teacher.name} is holding office hours`;
  const body = `${topic ? `${topic} · ` : ''}For the next ${minutes < 60 ? `${minutes} minutes` : minutes === 60 ? 'hour' : `${minutes / 60} hours`}. Join the line from Calls.`;
  await notifyMany(ids, { type: 'reminder', title, body, link: '/calls', email: false });
  await pushService.sendToMany(ids, { title, body, url: '/calls', tag: `office-${teacher.id}` }).catch(() => 0);
}

/** POST /api/office-hours/notes { studentId, body }: a private note about one of my students' visits. */
export async function addOfficeNote(user: SessionUser, b: Record<string, unknown>) {
  if (!isStaff(user)) throw new ForbiddenException('Only teachers keep office hours notes.');
  const studentId = String(b.studentId ?? '');
  const body = typeof b.body === 'string' ? b.body.trim().slice(0, 2000) : '';
  if (!body) throw new BadRequestException('Write the note first.');
  const mine = user.role === 'ADMIN' || !!(await prisma.enrollment.findFirst({ where: { studentId, course: { teacherId: user.id } }, select: { id: true } }));
  if (!mine) throw new NotFoundException('That student isn’t in one of your classes.');
  return prisma.officeNote.create({ data: { teacherId: user.id, studentId, body }, select: { id: true, body: true, createdAt: true } });
}

/** GET /api/office-hours/notes?studentId=: my notes about a student (newest first). */
export async function officeNotes(user: SessionUser, studentId: string) {
  if (!isStaff(user)) throw new ForbiddenException('Only teachers keep office hours notes.');
  return prisma.officeNote.findMany({ where: { teacherId: user.id, studentId }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, body: true, createdAt: true } });
}
