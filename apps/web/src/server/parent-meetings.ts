import prisma from '@/lib/db';
import { validZone } from '@/lib/local-time';
import { planLimits } from '@/lib/plan-limits';
import type { SessionUser } from '@/lib/server-auth';
import { notify } from './email';
import { BadRequestException, ConflictException, ForbiddenException, HttpException, NotFoundException } from './http';
import { hoursOf, inHours } from './parent-hours';
import { publish } from './realtime';
import { pushService } from './services/push.service';

// Parent–teacher meetings (Stage 5 · B16.3). A teacher opens times (for example Thursday 16:00–18:00
// in 15-minute meetings, by video or in a room); a parent books a free one for a child of theirs in
// the teacher's classes and says what they'd like to talk about. Video meetings are calls in the
// app (call id "pm_<id>", src/server/calls.ts): only the two of them, from 10 minutes before. Both
// are reminded about 15 minutes before (the 15-minute cron, /api/cron/reminders). Afterwards the
// teacher keeps private notes and can share a short summary with the parent. In-app + push, never
// email; the teacher's hours for parents (src/server/parent-hours.ts) hold pushes about bookings.

export const LENGTHS = [10, 15, 20, 30, 45, 60] as const;
const MODES = ['VIDEO', 'IN_PERSON'] as const;
const MAX_SLOTS = 40, MAX_AHEAD_MS = 120 * 86_400_000, MAX_SPAN_MS = 12 * 3600_000;
/** Parents book at least this long before a meeting, and cancel up to its start. */
const BOOK_AHEAD_MS = 30 * 60_000;
export const JOIN_EARLY_MS = 10 * 60_000;
const REMIND_AHEAD_MS = 16 * 60_000;
const MAX_TOPIC = 500, MAX_NOTES = 5000, MAX_SUMMARY = 3000;
/** A time given back (or newly booked) starts with no notes: they belonged to the meeting before. */
const CLEAN = { notes: null, summary: null, summarySentAt: null };
const isStaff = (u: SessionUser) => u.role === 'TEACHER' || u.role === 'ADMIN';
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const endOf = (m: { startAt: Date; durationMin: number }) => m.startAt.getTime() + m.durationMin * 60_000;
/** "Thu 14 Nov, 16:00" on the reader's clock (their device's time zone, kept with the meeting), else in UTC. */
export const when = (d: Date, tz?: string | null) =>
  `${d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz ? validZone(tz) : 'UTC' })}${tz ? '' : ' UTC'}`;

/**
 * The start times for meetings of `length` minutes (plus `gap` between them) from `start` to
 * `end`, leaving out those that overlap one of `taken` (the teacher's other meetings).
 */
export function slotTimes(start: number, end: number, length: number, gap: number, taken: { start: number; end: number }[] = []) {
  const out: number[] = [];
  for (let t = start; t + length * 60_000 <= end && out.length < MAX_SLOTS; t += (length + gap) * 60_000) {
    const e = t + length * 60_000;
    if (!taken.some((x) => t < x.end && e > x.start)) out.push(t);
  }
  return out;
}

/** Whether a video meeting can be joined now: the teacher from 30 minutes before, the parent from 10; both until 30 minutes after it ends. */
export function joinable(m: { startAt: Date; durationMin: number }, host: boolean, now = Date.now()) {
  return now >= m.startAt.getTime() - (host ? 30 * 60_000 : JOIN_EARLY_MS) && now <= endOf(m) + 30 * 60_000;
}

const meetingSelect = {
  id: true, teacherId: true, startAt: true, durationMin: true, mode: true, location: true, teacherTimeZone: true, parentTimeZone: true, guardianId: true, studentId: true, topic: true, bookedAt: true, notes: true, summary: true, summarySentAt: true,
  guardian: { select: { id: true, name: true, avatar: true } },
  student: { select: { id: true, name: true } },
  teacher: { select: { id: true, name: true, avatar: true } },
} as const;

// ── Teachers ────────────────────────────────────────────────────────────────────────────────

/** GET /api/teacher/meetings: my meeting times from today on (booked or free) and my last 60 days of meetings. */
export async function teacherMeetings(user: SessionUser) {
  if (!isStaff(user)) throw new ForbiddenException('Only teachers hold parent meetings.');
  const [upcoming, past] = await Promise.all([
    prisma.parentMeeting.findMany({ where: { teacherId: user.id, startAt: { gte: new Date(Date.now() - 2 * 3600_000) } }, orderBy: { startAt: 'asc' }, take: 300, select: meetingSelect }),
    prisma.parentMeeting.findMany({ where: { teacherId: user.id, guardianId: { not: null }, startAt: { lt: new Date(Date.now() - 2 * 3600_000), gt: new Date(Date.now() - 60 * 86_400_000) } }, orderBy: { startAt: 'desc' }, take: 60, select: meetingSelect }),
  ]);
  const links = await relations([...upcoming, ...past]);
  const shape = (m: (typeof upcoming)[number]) => ({
    id: m.id, startAt: m.startAt, durationMin: m.durationMin, mode: m.mode, location: m.location, topic: m.topic, bookedAt: m.bookedAt,
    parent: m.guardian ? { id: m.guardian.id, name: m.guardian.name, avatar: m.guardian.avatar, relation: links.get(`${m.guardianId}:${m.studentId}`) ?? null } : null,
    student: m.student ? { id: m.student.id, name: m.student.name } : null,
    notes: m.notes, summary: m.summary, summarySentAt: m.summarySentAt,
    canJoin: m.mode === 'VIDEO' && !!m.guardianId && joinable(m, true),
  });
  return { lengths: LENGTHS, upcoming: upcoming.map(shape), past: past.map(shape) };
}

/** "Mother", "Father"… for each booked meeting's parent and child. */
async function relations(ms: { guardianId: string | null; studentId: string | null }[]) {
  const guardians = [...new Set(ms.map((m) => m.guardianId).filter((g): g is string => !!g))].slice(0, 90);
  if (!guardians.length) return new Map<string, string | null>();
  const rows = await prisma.guardianLink.findMany({ where: { guardianId: { in: guardians } }, select: { guardianId: true, studentId: true, relation: true }, take: 1000 });
  return new Map(rows.map((r) => [`${r.guardianId}:${r.studentId}`, r.relation]));
}

/** POST /api/teacher/meetings { startAt, endAt, durationMin, gapMin?, mode, location?, timeZone }: opens meeting times (ISO times from the teacher's device). */
export async function openMeetingTimes(user: SessionUser, b: Record<string, unknown>) {
  if (!isStaff(user)) throw new ForbiddenException('Only teachers hold parent meetings.');
  const start = typeof b.startAt === 'string' ? new Date(b.startAt).getTime() : NaN;
  const end = typeof b.endAt === 'string' ? new Date(b.endAt).getTime() : NaN;
  const length = LENGTHS.find((l) => l === Number(b.durationMin));
  const gap = [0, 5, 10].includes(Number(b.gapMin)) ? Number(b.gapMin) : 0;
  const mode = MODES.find((m) => m === b.mode) ?? 'VIDEO';
  const location = typeof b.location === 'string' ? b.location.trim().slice(0, 120) || null : null;
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new BadRequestException('Choose a day and times.');
  if (!length) throw new BadRequestException('Choose how long each meeting is.');
  if (end <= start) throw new BadRequestException('The end time is before the start.');
  if (end - start > MAX_SPAN_MS) throw new BadRequestException('Open up to 12 hours at a time.');
  if (start < Date.now() - 5 * 60_000) throw new BadRequestException('That time has passed.');
  if (start > Date.now() + MAX_AHEAD_MS) throw new BadRequestException('Open times up to 4 months ahead.');
  if (mode === 'IN_PERSON' && !location) throw new BadRequestException('Say where parents should come.');
  const taken = (await prisma.parentMeeting.findMany({
    where: { teacherId: user.id, startAt: { gte: new Date(start - 4 * 3600_000), lt: new Date(end) } },
    select: { startAt: true, durationMin: true }, take: 500,
  })).map((m) => ({ start: m.startAt.getTime(), end: endOf(m) }));
  const times = slotTimes(start, end, length, gap, taken);
  if (!times.length) throw new BadRequestException(taken.length ? 'You already have meetings at those times.' : 'That’s too short for one meeting.');
  const teacherTimeZone = validZone(b.timeZone);
  await prisma.parentMeeting.createMany({ data: times.map((t) => ({ teacherId: user.id, startAt: new Date(t), durationMin: length, mode, location: mode === 'IN_PERSON' ? location : null, teacherTimeZone })) });
  return { created: times.length, skipped: slotTimes(start, end, length, gap).length - times.length };
}

/** POST /api/teacher/meetings/:id { action: 'delete' | 'notes', notes?, summary?, share? } */
export async function teacherMeetingAction(user: SessionUser, id: string, b: Record<string, unknown>) {
  if (!isStaff(user)) throw new ForbiddenException('Only teachers hold parent meetings.');
  const m = await prisma.parentMeeting.findUnique({ where: { id }, select: meetingSelect });
  if (!m || m.teacherId !== user.id) throw new NotFoundException('That meeting doesn’t exist.');
  if (b.action === 'delete') {
    // A booked meeting that hasn't happened: the parent hears it's cancelled.
    const told = !!m.guardianId && endOf(m) > Date.now();
    await prisma.parentMeeting.delete({ where: { id } });
    if (told && m.guardianId) {
      await notify(m.guardianId, { type: 'meeting', title: `Meeting cancelled: ${user.name}`, body: `${when(m.startAt, m.parentTimeZone)} about ${firstName(m.student?.name ?? 'your child')} was cancelled by the teacher. You can book another time.`, link: '/parent?tab=meetings', email: false });
      await pushService.sendToUser(m.guardianId, { title: 'Meeting cancelled', body: `${user.name} cancelled your meeting. You can book another time.`, url: '/parent?tab=meetings', tag: `meeting-${id}` }).catch(() => {});
      publish([m.guardianId], { type: 'refresh', keys: ['/api/parent/meetings*'] });
    }
    return { deleted: true, told };
  }
  if (b.action !== 'notes') throw new BadRequestException('Unknown action.');
  if (!m.guardianId) throw new BadRequestException('Notes are for booked meetings.');
  const notes = typeof b.notes === 'string' ? b.notes.trim().slice(0, MAX_NOTES) || null : m.notes;
  const summary = typeof b.summary === 'string' ? b.summary.trim().slice(0, MAX_SUMMARY) || null : m.summary;
  const share = b.share === true && !!summary && summary !== (m.summarySentAt ? m.summary : null);
  await prisma.parentMeeting.update({ where: { id }, data: { notes, summary, ...(share ? { summarySentAt: new Date() } : {}) } });
  if (share) {
    await notify(m.guardianId, { type: 'meeting', title: `Notes from your meeting with ${user.name}`, body: summary!.slice(0, 300), link: '/parent?tab=meetings', email: false });
    publish([m.guardianId], { type: 'refresh', keys: ['/api/parent/meetings*'] });
  }
  return { saved: true, shared: share };
}

// ── Parents ─────────────────────────────────────────────────────────────────────────────────

async function myChild(user: SessionUser, studentId: unknown) {
  if (user.role !== 'GUARDIAN') throw new ForbiddenException('This is for parent accounts.');
  const link = typeof studentId === 'string' && studentId
    ? await prisma.guardianLink.findUnique({ where: { guardianId_studentId: { guardianId: user.id, studentId } }, select: { studentId: true, student: { select: { name: true } } } })
    : null;
  if (!link) throw new NotFoundException('That child isn’t linked to your account.');
  return link;
}

/** The child's teachers (their classes' teachers), by id. */
async function teachersOf(studentId: string) {
  const rows = await prisma.enrollment.findMany({ where: { studentId }, select: { course: { select: { code: true, teacher: { select: { id: true, name: true, avatar: true, role: true } } } } }, take: 60 });
  const byId = new Map<string, { id: string; name: string; avatar: string | null; courses: string[] }>();
  for (const r of rows) {
    const t = r.course.teacher;
    if (!t || (t.role !== 'TEACHER' && t.role !== 'ADMIN')) continue;
    const cur = byId.get(t.id) ?? { id: t.id, name: t.name, avatar: t.avatar, courses: [] };
    cur.courses.push(r.course.code);
    byId.set(t.id, cur);
  }
  return byId;
}

const parentView = (m: { id: string; startAt: Date; durationMin: number; mode: string; location: string | null; topic: string | null; summary: string | null; summarySentAt: Date | null; studentId: string | null; teacher: { id: string; name: string; avatar: string | null }; student: { name: string } | null }, now = Date.now()) => ({
  id: m.id, startAt: m.startAt, durationMin: m.durationMin, mode: m.mode, location: m.location, topic: m.topic,
  teacher: m.teacher, studentId: m.studentId, child: m.student ? firstName(m.student.name) : null,
  // The summary once the teacher has shared it.
  summary: m.summarySentAt ? m.summary : null,
  canJoin: m.mode === 'VIDEO' && joinable(m, false, now),
  canCancel: m.startAt.getTime() > now,
});

/**
 * GET /api/parent/meetings?studentId=[&teacherId=]: my meetings (every child: upcoming, and the last
 * 60 days with any summary the teacher shared), the child's teachers with how many times they've
 * opened; with teacherId, that teacher's free times.
 */
export async function parentMeetings(user: SessionUser, studentId: string | null, teacherId: string | null) {
  const child = await myChild(user, studentId);
  const now = Date.now();
  const teachers = await teachersOf(child.studentId);
  if (teacherId) {
    if (!teachers.has(teacherId)) throw new NotFoundException('That teacher doesn’t teach your child.');
    const free = await prisma.parentMeeting.findMany({
      where: { teacherId, guardianId: null, startAt: { gt: new Date(now + BOOK_AHEAD_MS), lt: new Date(now + MAX_AHEAD_MS) } },
      orderBy: { startAt: 'asc' }, take: 120, select: { id: true, startAt: true, durationMin: true, mode: true, location: true },
    });
    return { teacher: teachers.get(teacherId), free };
  }
  const ids = [...teachers.keys()];
  const [mine, open] = await Promise.all([
    prisma.parentMeeting.findMany({ where: { guardianId: user.id, startAt: { gt: new Date(now - 60 * 86_400_000) } }, orderBy: { startAt: 'asc' }, take: 60, select: meetingSelect }),
    ids.length ? prisma.parentMeeting.groupBy({ by: ['teacherId'], where: { teacherId: { in: ids.slice(0, 90) }, guardianId: null, startAt: { gt: new Date(now + BOOK_AHEAD_MS), lt: new Date(now + MAX_AHEAD_MS) } }, _count: { _all: true }, _min: { startAt: true } }) : Promise.resolve([]),
  ]);
  const upcoming = mine.filter((m) => endOf(m) + 30 * 60_000 > now);
  return {
    child: firstName(child.student.name),
    upcoming: upcoming.map((m) => parentView(m, now)),
    past: mine.filter((m) => endOf(m) + 30 * 60_000 <= now).reverse().map((m) => parentView(m, now)),
    teachers: [...teachers.values()].map((t) => {
      const o = open.find((x) => x.teacherId === t.id);
      return { ...t, free: o?._count._all ?? 0, next: o?._min.startAt ?? null, booked: upcoming.some((m) => m.teacherId === t.id && m.studentId === child.studentId) };
    }).sort((a, b) => b.free - a.free || a.name.localeCompare(b.name)),
  };
}

/** POST /api/parent/meetings { meetingId, studentId, topic?, timeZone }: books a free time. */
export async function bookMeeting(user: SessionUser, b: Record<string, unknown>) {
  const child = await myChild(user, b.studentId);
  const id = typeof b.meetingId === 'string' ? b.meetingId : '';
  const m = await prisma.parentMeeting.findUnique({ where: { id }, select: { id: true, teacherId: true, startAt: true, durationMin: true, mode: true, location: true, teacherTimeZone: true, guardianId: true, teacher: { select: { name: true } } } });
  if (!m || !(await teachersOf(child.studentId)).has(m.teacherId)) throw new NotFoundException('That time isn’t available.');
  if (m.startAt.getTime() < Date.now() + BOOK_AHEAD_MS) throw new BadRequestException('That time is too soon to book. Choose a later one.');
  const already = await prisma.parentMeeting.findFirst({ where: { teacherId: m.teacherId, guardianId: user.id, studentId: child.studentId, startAt: { gt: new Date() } }, select: { startAt: true } });
  if (already) throw new ConflictException(`You already have a meeting with ${m.teacher.name} about ${firstName(child.student.name)}. Cancel it first to choose another time.`);
  const topic = typeof b.topic === 'string' ? b.topic.trim().slice(0, MAX_TOPIC) || null : null;
  // Claimed only if still free: two parents can't book the same time.
  const claim = await prisma.parentMeeting.updateMany({ where: { id, guardianId: null }, data: { guardianId: user.id, studentId: child.studentId, topic, parentTimeZone: validZone(b.timeZone), bookedAt: new Date(), remindedAt: null, ...CLEAN } });
  if (!claim.count) throw new ConflictException('Someone just booked that time. Choose another one.');
  const title = `Meeting booked: ${user.name}`;
  const body = `${when(m.startAt, m.teacherTimeZone)} · about ${firstName(child.student.name)}${topic ? ` · ${topic.slice(0, 120)}` : ''}`;
  await notify(m.teacherId, { type: 'meeting', title, body, link: `/teacher/meetings?m=${id}`, email: false });
  // A push only within the teacher's hours for parents.
  const hours = await hoursOf([m.teacherId]);
  if (inHours(hours(m.teacherId), new Date())) await pushService.sendToUser(m.teacherId, { title, body, url: `/teacher/meetings?m=${id}`, tag: `meeting-${id}` }).catch(() => {});
  publish([m.teacherId], { type: 'refresh', keys: ['/api/teacher/meetings'] });
  return { booked: true, id };
}

/** POST /api/parent/meetings/:id { action: 'cancel' }: gives a booked time back (until it starts). */
export async function cancelMeeting(user: SessionUser, id: string, b: Record<string, unknown>) {
  if (user.role !== 'GUARDIAN') throw new ForbiddenException('This is for parent accounts.');
  if (b.action !== 'cancel') throw new BadRequestException('Unknown action.');
  const m = await prisma.parentMeeting.findUnique({ where: { id }, select: { id: true, teacherId: true, guardianId: true, startAt: true, teacherTimeZone: true, student: { select: { name: true } } } });
  if (!m || m.guardianId !== user.id) throw new NotFoundException('That meeting doesn’t exist.');
  if (m.startAt.getTime() <= Date.now()) throw new BadRequestException('This meeting has started. Message the teacher instead.');
  await prisma.parentMeeting.update({ where: { id }, data: { guardianId: null, studentId: null, topic: null, parentTimeZone: null, bookedAt: null, remindedAt: null, ...CLEAN } });
  await notify(m.teacherId, { type: 'meeting', title: `Meeting cancelled: ${user.name}`, body: `${when(m.startAt, m.teacherTimeZone)} about ${firstName(m.student?.name ?? 'their child')} is free again.`, link: '/teacher/meetings', email: false });
  publish([m.teacherId], { type: 'refresh', keys: ['/api/teacher/meetings'] });
  return { cancelled: true };
}

// ── Calls and reminders ─────────────────────────────────────────────────────────────────────

/** Who may join a video meeting's call: its teacher (host) and the parent who booked it, around its time. */
export async function meetingCallAccess(id: string, user: SessionUser) {
  const m = await prisma.parentMeeting.findUnique({ where: { id }, select: { teacherId: true, guardianId: true, startAt: true, durationMin: true, mode: true, teacher: { select: { name: true } }, guardian: { select: { name: true } }, student: { select: { name: true } } } });
  const host = !!m && m.teacherId === user.id;
  if (!m || !m.guardianId || m.mode !== 'VIDEO' || (!host && m.guardianId !== user.id)) throw new NotFoundException('This meeting isn’t one of yours.');
  if (!joinable(m, host)) {
    throw new HttpException(Date.now() < m.startAt.getTime() ? `The meeting opens ${host ? 30 : 10} minutes before it starts.` : 'This meeting has ended.', 410);
  }
  const child = firstName(m.student?.name ?? '');
  return { host, title: host ? `Parent meeting · ${m.guardian?.name ?? 'Parent'}${child ? ` · ${child}` : ''}` : `Meeting with ${m.teacher.name}` };
}

/** The cron's job: remind both people of booked meetings starting within about 15 minutes (each once). */
export async function remindParentMeetings() {
  const now = Date.now();
  const due = await prisma.parentMeeting.findMany({
    where: { guardianId: { not: null }, remindedAt: null, startAt: { gt: new Date(now - 5 * 60_000), lte: new Date(now + REMIND_AHEAD_MS) } },
    orderBy: { startAt: 'asc' }, take: 20,
    select: { id: true, teacherId: true, guardianId: true, startAt: true, mode: true, location: true, teacher: { select: { name: true } }, guardian: { select: { name: true } }, student: { select: { name: true } } },
  });
  let budget = planLimits().pushes;
  let reminded = 0;
  for (const m of due) {
    const claim = await prisma.parentMeeting.updateMany({ where: { id: m.id, remindedAt: null }, data: { remindedAt: new Date() } });
    if (!claim.count || !m.guardianId) continue;
    const mins = Math.max(1, Math.round((m.startAt.getTime() - now) / 60_000));
    const where = m.mode === 'VIDEO' ? 'video call in the app' : m.location ?? 'in person';
    const child = firstName(m.student?.name ?? '');
    const forTeacher = { title: `Parent meeting in ${mins} min`, body: `${m.guardian?.name ?? 'A parent'}${child ? ` · ${child}` : ''} · ${where}`, link: `/teacher/meetings?m=${m.id}` };
    const forParent = { title: `Meeting in ${mins} min`, body: `${m.teacher.name} · ${where}`, link: '/parent?tab=meetings' };
    await prisma.notification.createMany({ data: [
      { userId: m.teacherId, ...forTeacher, type: 'meeting' },
      { userId: m.guardianId, ...forParent, type: 'meeting' },
    ] });
    publish([m.teacherId, m.guardianId], { type: 'notification' });
    if (budget > 0) budget -= (await pushService.sendToUser(m.teacherId, { title: forTeacher.title, body: forTeacher.body, url: forTeacher.link, tag: `meeting-${m.id}` }).then(() => 1).catch(() => 1));
    if (budget > 0) budget -= (await pushService.sendToUser(m.guardianId, { title: forParent.title, body: forParent.body, url: forParent.link, tag: `meeting-${m.id}` }).then(() => 1).catch(() => 1));
    reminded++;
  }
  return { due: due.length, reminded };
}
