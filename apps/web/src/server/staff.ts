import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { notify, notifyMany } from './email';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from './http';
import { need } from './permissions';
import { publish } from './realtime';
import { pushService } from './services/push.service';

// Staff (Stage 5 · B15.8). Teachers mark themselves in each day, ask for leave and see the classes
// they cover. Managers (admins, or staff with staff.manage) see who's in, approve or decline leave,
// and plan cover: every class an absent teacher would miss on a date (from the weekly timetable)
// gets a teacher who's free then (no class of their own at that time, not on leave, not already
// covering), fewest covers this week first. In-app and push only, never email.

export const LEAVE_TYPES = ['SICK', 'PERSONAL', 'TRAINING', 'OTHER'] as const;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LEAVE_DAYS = 60, MAX_RANGE_DAYS = 14;
const isTeacher = (u: SessionUser) => u.role === 'TEACHER';

// ── Calendar days ───────────────────────────────────────────────────────────────────────────

const toUtc = (d: string) => new Date(`${d}T12:00:00Z`);
export const isDay = (v: unknown): v is string => typeof v === 'string' && DAY_RE.test(v) && Number.isFinite(toUtc(v).getTime()) && toUtc(v).toISOString().slice(0, 10) === v;
export const addDays = (d: string, n: number) => { const x = toUtc(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const daysBetween = (a: string, b: string) => Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
/** 0 = Monday … 6 = Sunday, like timetable slots. */
export const weekday = (d: string) => (toUtc(d).getUTCDay() + 6) % 7;
/** Every day from a to b, both included. */
export const eachDay = (a: string, b: string) => Array.from({ length: Math.max(0, daysBetween(a, b) + 1) }, (_, i) => addDays(a, i));
export const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) => a.start < b.end && b.start < a.end;
/** A day the person's device sends must be within a day of today on the server (time zones). */
const nearToday = (d: string) => Math.abs(daysBetween(new Date().toISOString().slice(0, 10), d)) <= 1;

// ── Teachers ────────────────────────────────────────────────────────────────────────────────

/** GET /api/staff/me?today=YYYY-MM-DD: my day (in / out), my leave, and the classes I cover from today. */
export async function myStaff(user: SessionUser, today: string | null) {
  if (!isTeacher(user)) throw new ForbiddenException('This is for staff accounts.');
  const day = isDay(today) && nearToday(today) ? today : new Date().toISOString().slice(0, 10);
  const [att, leave, covers] = await Promise.all([
    prisma.staffAttendance.findUnique({ where: { userId_date: { userId: user.id, date: day } }, select: { inAt: true, outAt: true } }),
    prisma.staffLeave.findMany({ where: { userId: user.id, toDate: { gte: addDays(day, -90) } }, orderBy: { fromDate: 'desc' }, take: 30, select: { id: true, type: true, fromDate: true, toDate: true, reason: true, status: true, decisionNote: true, decidedAt: true, createdAt: true } }),
    prisma.staffCover.findMany({ where: { coverTeacherId: user.id, date: { gte: day } }, orderBy: [{ date: 'asc' }], take: 30, select: { id: true, date: true, note: true, absentTeacher: { select: { name: true } }, slot: { select: { startTime: true, endTime: true, type: true, room: { select: { name: true } }, course: { select: { code: true, name: true } } } } } }),
  ]);
  return {
    today: day, inAt: att?.inAt ?? null, outAt: att?.outAt ?? null, leave,
    covers: covers.map((c) => ({ id: c.id, date: c.date, start: c.slot.startTime, end: c.slot.endTime, type: c.slot.type, room: c.slot.room?.name ?? null, course: c.slot.course, absent: c.absentTeacher.name, note: c.note }))
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)),
  };
}

/** POST /api/staff/me { action: 'in' | 'out', date } | { action: 'leave', type, fromDate, toDate, reason? } | { action: 'cancel', leaveId } */
export async function myStaffAction(user: SessionUser, b: Record<string, unknown>) {
  if (!isTeacher(user)) throw new ForbiddenException('This is for staff accounts.');
  if (b.action === 'in' || b.action === 'out') {
    if (!isDay(b.date) || !nearToday(b.date)) throw new BadRequestException('That isn’t today.');
    const date = b.date;
    if (b.action === 'in') {
      await prisma.staffAttendance.upsert({ where: { userId_date: { userId: user.id, date } }, update: { inAt: new Date(), outAt: null }, create: { userId: user.id, date, inAt: new Date() } });
    } else {
      const row = await prisma.staffAttendance.findUnique({ where: { userId_date: { userId: user.id, date } }, select: { inAt: true } });
      if (!row?.inAt) throw new BadRequestException('Mark yourself in first.');
      await prisma.staffAttendance.update({ where: { userId_date: { userId: user.id, date } }, data: { outAt: new Date() } });
    }
    return { ok: true };
  }
  if (b.action === 'leave') {
    const type = LEAVE_TYPES.find((t) => t === b.type) ?? 'PERSONAL';
    if (!isDay(b.fromDate) || !isDay(b.toDate)) throw new BadRequestException('Choose the first and last day.');
    const fromDate = b.fromDate, toDate = b.toDate;
    if (toDate < fromDate) throw new BadRequestException('The last day is before the first.');
    if (daysBetween(fromDate, toDate) + 1 > MAX_LEAVE_DAYS) throw new BadRequestException(`Up to ${MAX_LEAVE_DAYS} days at a time.`);
    if (daysBetween(new Date().toISOString().slice(0, 10), fromDate) < -30) throw new BadRequestException('Leave can be recorded up to 30 days back.');
    const clash = await prisma.staffLeave.findFirst({ where: { userId: user.id, status: { in: ['PENDING', 'APPROVED'] }, fromDate: { lte: toDate }, toDate: { gte: fromDate } }, select: { fromDate: true, toDate: true } });
    if (clash) throw new ConflictException(`You already asked for leave from ${clash.fromDate} to ${clash.toDate}.`);
    const reason = typeof b.reason === 'string' ? b.reason.trim().slice(0, 500) || null : null;
    const leave = await prisma.staffLeave.create({ data: { userId: user.id, type, fromDate, toDate, reason }, select: { id: true } });
    const days = daysBetween(fromDate, toDate) + 1;
    await notifyManagers({ title: `Leave request: ${user.name}`, body: `${typeLabel(type)} · ${fromDate}${days > 1 ? ` to ${toDate} (${days} days)` : ''}${reason ? ` · ${reason.slice(0, 80)}` : ''}`, link: '/admin/staff?view=leave' });
    return { id: leave.id };
  }
  if (b.action === 'cancel') {
    const id = typeof b.leaveId === 'string' ? b.leaveId : '';
    const leave = await prisma.staffLeave.findUnique({ where: { id }, select: { userId: true, status: true, toDate: true, fromDate: true } });
    if (!leave || leave.userId !== user.id) throw new NotFoundException('That leave doesn’t exist.');
    if (!['PENDING', 'APPROVED'].includes(leave.status)) throw new BadRequestException('This leave can’t be cancelled.');
    if (leave.toDate < new Date().toISOString().slice(0, 10)) throw new BadRequestException('This leave is over.');
    await prisma.staffLeave.update({ where: { id }, data: { status: 'CANCELLED', updatedAt: new Date() } });
    // Cover planned for it goes; the teachers who were covering hear so.
    const covers = await prisma.staffCover.findMany({ where: { leaveId: id }, select: { coverTeacherId: true } });
    await prisma.staffCover.deleteMany({ where: { leaveId: id } });
    const told = [...new Set(covers.map((c) => c.coverTeacherId).filter((x): x is string => !!x))];
    if (told.length) await notifyMany(told, { type: 'staff', title: 'Cover no longer needed', body: `${user.name} is back: the classes you were covering (${leave.fromDate}${leave.toDate !== leave.fromDate ? ` to ${leave.toDate}` : ''}) are theirs again.`, link: '/teacher/staff', email: false });
    if (leave.status === 'APPROVED') await notifyManagers({ title: `Leave cancelled: ${user.name}`, body: `${leave.fromDate}${leave.toDate !== leave.fromDate ? ` to ${leave.toDate}` : ''}`, link: '/admin/staff?view=leave' });
    return { cancelled: true };
  }
  throw new BadRequestException('Unknown action.');
}

const typeLabel = (t: string) => ({ SICK: 'Sick leave', PERSONAL: 'Personal leave', TRAINING: 'Training', OTHER: 'Leave' } as Record<string, string>)[t] ?? 'Leave';

/** Admins and staff who may manage staff, in the app. */
async function notifyManagers(n: { title: string; body: string; link: string }) {
  const [admins, holders] = await Promise.all([
    prisma.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true }, take: 20 }),
    prisma.staffRoleMember.findMany({ where: { role: { permissions: { contains: '"staff.manage"' } } }, select: { userId: true }, take: 40 }),
  ]);
  const ids = [...new Set([...admins.map((a) => a.id), ...holders.map((h) => h.userId)])];
  if (ids.length) await notifyMany(ids, { type: 'staff', ...n, email: false });
}

// ── Managers ────────────────────────────────────────────────────────────────────────────────

/** GET /api/staff/register?date=: every teacher on a day: in (when), on leave (what), or not in. */
export async function staffRegister(user: SessionUser, date: string | null) {
  await need(user, 'staff.manage');
  const day = isDay(date) ? date : new Date().toISOString().slice(0, 10);
  const [teachers, att, leave] = await Promise.all([
    prisma.user.findMany({ where: { role: 'TEACHER', status: { not: 'SUSPENDED' } }, orderBy: { name: 'asc' }, take: 1000, select: { id: true, name: true, email: true, avatar: true } }),
    prisma.staffAttendance.findMany({ where: { date: day }, select: { userId: true, inAt: true, outAt: true } }),
    prisma.staffLeave.findMany({ where: { status: 'APPROVED', fromDate: { lte: day }, toDate: { gte: day } }, select: { userId: true, type: true } }),
  ]);
  const rows = teachers.map((t) => {
    const a = att.find((x) => x.userId === t.id), l = leave.find((x) => x.userId === t.id);
    return { ...t, status: l ? 'leave' : a?.inAt ? 'in' : 'missing', inAt: a?.inAt ?? null, outAt: a?.outAt ?? null, leaveType: l?.type ?? null };
  });
  return { date: day, counts: { in: rows.filter((r) => r.status === 'in').length, leave: rows.filter((r) => r.status === 'leave').length, missing: rows.filter((r) => r.status === 'missing').length }, rows };
}

/** GET /api/staff/leave?status=: leave requests (pending first), with who asked. */
export async function leaveRequests(user: SessionUser, status: string | null) {
  await need(user, 'staff.manage');
  const where = status === 'PENDING' || status === 'APPROVED' || status === 'DECLINED' || status === 'CANCELLED' ? { status } : { toDate: { gte: addDays(new Date().toISOString().slice(0, 10), -60) } };
  const rows = await prisma.staffLeave.findMany({
    where, orderBy: [{ fromDate: 'asc' }], take: 200,
    select: { id: true, type: true, fromDate: true, toDate: true, reason: true, status: true, decisionNote: true, decidedAt: true, createdAt: true, user: { select: { id: true, name: true, avatar: true } }, _count: { select: { covers: true } } },
  });
  const order = { PENDING: 0, APPROVED: 1, DECLINED: 2, CANCELLED: 3 } as Record<string, number>;
  return { pending: rows.filter((r) => r.status === 'PENDING').length, rows: rows.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.fromDate.localeCompare(b.fromDate)) };
}

/** POST /api/staff/leave/:id { action: 'approve' | 'decline', note? } */
export async function decideLeave(user: SessionUser, id: string, b: Record<string, unknown>) {
  await need(user, 'staff.manage');
  const leave = await prisma.staffLeave.findUnique({ where: { id }, select: { id: true, userId: true, status: true, type: true, fromDate: true, toDate: true } });
  if (!leave) throw new NotFoundException('That leave request doesn’t exist.');
  if (leave.userId === user.id) throw new ForbiddenException('Someone else decides on your own leave.');
  const to = b.action === 'approve' ? 'APPROVED' : b.action === 'decline' ? 'DECLINED' : null;
  if (!to) throw new BadRequestException('Approve or decline?');
  if (leave.status !== 'PENDING' && !(leave.status === 'APPROVED' && to === 'DECLINED')) throw new BadRequestException('This request was already decided.');
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 300) || null : null;
  await prisma.staffLeave.update({ where: { id }, data: { status: to, decidedById: user.id, decidedAt: new Date(), decisionNote: note, updatedAt: new Date() } });
  if (to === 'DECLINED') await prisma.staffCover.deleteMany({ where: { leaveId: id } });
  const when = `${leave.fromDate}${leave.toDate !== leave.fromDate ? ` to ${leave.toDate}` : ''}`;
  await notify(leave.userId, { type: 'staff', title: to === 'APPROVED' ? 'Leave approved' : 'Leave declined', body: `${typeLabel(leave.type)} · ${when}${note ? ` · ${note}` : ''}`, link: '/teacher/staff', email: false });
  return { status: to };
}

interface Need { date: string; slotId: string; start: string; end: string; type: string; room: string | null; course: { code: string; name: string }; absent: { id: string; name: string }; leaveId: string; cover: { id: string; name: string } | null }

/** GET /api/staff/cover?from=&to=: every class an absent teacher would miss (approved leave), and who covers it. */
export async function coverNeeds(user: SessionUser, from: string | null, to: string | null) {
  await need(user, 'staff.manage');
  const start = isDay(from) ? from : new Date().toISOString().slice(0, 10);
  const end = isDay(to) && to >= start ? (daysBetween(start, to) < MAX_RANGE_DAYS ? to : addDays(start, MAX_RANGE_DAYS - 1)) : addDays(start, 6);
  const leave = await prisma.staffLeave.findMany({ where: { status: 'APPROVED', fromDate: { lte: end }, toDate: { gte: start } }, select: { id: true, userId: true, fromDate: true, toDate: true, user: { select: { id: true, name: true } } }, take: 100 });
  if (!leave.length) return { from: start, to: end, needs: [] as Need[], uncovered: 0 };
  const teacherIds = [...new Set(leave.map((l) => l.userId))];
  const [slots, covers] = await Promise.all([
    prisma.timetableSlot.findMany({ where: { course: { teacherId: { in: teacherIds } } }, select: { id: true, dayOfWeek: true, startTime: true, endTime: true, type: true, room: { select: { name: true } }, course: { select: { code: true, name: true, teacherId: true } } }, take: 2000 }),
    prisma.staffCover.findMany({ where: { date: { gte: start, lte: end } }, select: { date: true, slotId: true, coverTeacher: { select: { id: true, name: true } } } }),
  ]);
  const needs: Need[] = [];
  for (const l of leave) {
    for (const date of eachDay(l.fromDate < start ? start : l.fromDate, l.toDate > end ? end : l.toDate)) {
      const dow = weekday(date);
      for (const s of slots.filter((x) => x.course.teacherId === l.userId && x.dayOfWeek === dow)) {
        const c = covers.find((x) => x.date === date && x.slotId === s.id);
        needs.push({ date, slotId: s.id, start: s.startTime, end: s.endTime, type: s.type, room: s.room?.name ?? null, course: { code: s.course.code, name: s.course.name }, absent: l.user, leaveId: l.id, cover: c?.coverTeacher ?? null });
      }
    }
  }
  needs.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  return { from: start, to: end, needs, uncovered: needs.filter((n) => !n.cover).length };
}

/** Teachers free to cover a slot on a date, fewest covers in that week first. */
export async function freeTeachers(user: SessionUser, date: string | null, slotId: string | null) {
  await need(user, 'staff.manage');
  if (!isDay(date) || !slotId) throw new BadRequestException('Choose a class and a day.');
  const slot = await prisma.timetableSlot.findUnique({ where: { id: slotId }, select: { dayOfWeek: true, startTime: true, endTime: true, course: { select: { teacherId: true } } } });
  if (!slot) throw new NotFoundException('That class time doesn’t exist.');
  const monday = addDays(date, -weekday(date));
  const [teachers, busySlots, onLeave, coversThatDay, coversThatWeek] = await Promise.all([
    prisma.user.findMany({ where: { role: 'TEACHER', status: { not: 'SUSPENDED' }, id: { not: slot.course.teacherId } }, orderBy: { name: 'asc' }, take: 1000, select: { id: true, name: true, avatar: true } }),
    prisma.timetableSlot.findMany({ where: { dayOfWeek: slot.dayOfWeek }, select: { startTime: true, endTime: true, course: { select: { teacherId: true } } }, take: 3000 }),
    prisma.staffLeave.findMany({ where: { status: 'APPROVED', fromDate: { lte: date }, toDate: { gte: date } }, select: { userId: true } }),
    prisma.staffCover.findMany({ where: { date, coverTeacherId: { not: null } }, select: { coverTeacherId: true, slotId: true, slot: { select: { startTime: true, endTime: true } } } }),
    prisma.staffCover.groupBy({ by: ['coverTeacherId'], where: { date: { gte: monday, lte: addDays(monday, 6) }, coverTeacherId: { not: null } }, _count: { _all: true } }),
  ]);
  const away = new Set(onLeave.map((l) => l.userId));
  const want = { start: slot.startTime, end: slot.endTime };
  const free = teachers.filter((t) => !away.has(t.id)
    && !busySlots.some((s) => s.course.teacherId === t.id && overlaps(want, { start: s.startTime, end: s.endTime }))
    && !coversThatDay.some((c) => c.coverTeacherId === t.id && c.slotId !== slotId && overlaps(want, { start: c.slot.startTime, end: c.slot.endTime })));
  const week = (id: string) => coversThatWeek.find((c) => c.coverTeacherId === id)?._count._all ?? 0;
  return { free: free.map((t) => ({ ...t, coversThisWeek: week(t.id) })).sort((a, b) => a.coversThisWeek - b.coversThisWeek || a.name.localeCompare(b.name)).slice(0, 50) };
}

/** POST /api/staff/cover { date, slotId, leaveId, coverTeacherId: string | null, note? }: who covers a class, or nobody. */
export async function setCover(user: SessionUser, b: Record<string, unknown>) {
  await need(user, 'staff.manage');
  if (!isDay(b.date) || typeof b.slotId !== 'string' || typeof b.leaveId !== 'string') throw new BadRequestException('Choose a class and a day.');
  const date = b.date, slotId = b.slotId;
  const [slot, leave] = await Promise.all([
    prisma.timetableSlot.findUnique({ where: { id: slotId }, select: { dayOfWeek: true, startTime: true, endTime: true, room: { select: { name: true } }, course: { select: { code: true, teacherId: true, teacher: { select: { name: true } } } } } }),
    prisma.staffLeave.findUnique({ where: { id: b.leaveId }, select: { id: true, userId: true, status: true, fromDate: true, toDate: true } }),
  ]);
  if (!slot || !leave || leave.status !== 'APPROVED' || leave.userId !== slot.course.teacherId || date < leave.fromDate || date > leave.toDate || weekday(date) !== slot.dayOfWeek) {
    throw new BadRequestException('That class isn’t missed on that day.');
  }
  const before = await prisma.staffCover.findUnique({ where: { date_slotId: { date, slotId } }, select: { coverTeacherId: true } });
  const coverId = typeof b.coverTeacherId === 'string' && b.coverTeacherId ? b.coverTeacherId : null;
  const what = `${slot.course.code} on ${date}, ${slot.startTime}–${slot.endTime}${slot.room ? ` in ${slot.room.name}` : ''}`;
  if (!coverId) {
    await prisma.staffCover.deleteMany({ where: { date, slotId } });
    if (before?.coverTeacherId) await notify(before.coverTeacherId, { type: 'staff', title: 'Cover no longer needed', body: what, link: '/teacher/staff', email: false });
    return { cover: null };
  }
  const free = (await freeTeachers(user, date, slotId)).free;
  const pick = free.find((t) => t.id === coverId);
  if (!pick) throw new ConflictException('That teacher isn’t free then any more. Choose another.');
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 300) || null : null;
  await prisma.staffCover.upsert({ where: { date_slotId: { date, slotId } }, update: { coverTeacherId: coverId, note, updatedAt: new Date() }, create: { date, slotId, absentTeacherId: leave.userId, coverTeacherId: coverId, leaveId: leave.id, note, createdById: user.id } });
  if (before?.coverTeacherId && before.coverTeacherId !== coverId) await notify(before.coverTeacherId, { type: 'staff', title: 'Cover no longer needed', body: what, link: '/teacher/staff', email: false });
  if (before?.coverTeacherId !== coverId) {
    const title = `You’re covering ${slot.course.code}`;
    const body = `${what} · for ${slot.course.teacher.name}${note ? ` · ${note}` : ''}`;
    await notify(coverId, { type: 'staff', title, body, link: '/teacher/staff', email: false });
    await pushService.sendToUser(coverId, { title, body, url: '/teacher/staff', tag: `cover-${date}-${slotId}` }).catch(() => {});
    publish([coverId], { type: 'refresh', keys: ['/api/staff/me*'] });
  }
  return { cover: { id: pick.id, name: pick.name } };
}

